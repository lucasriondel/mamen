import {
	LogoSearchFailed,
	LogoSearchQuotaExceeded,
	type LogoSearchResult,
	LogoSearchUnconfigured,
} from "@mamen/shared/contract";
import { Effect, Option, Redacted, Schema } from "effect";
import { GoogleCseCx, GoogleCseKey } from "../config";
import { FETCH_TIMEOUT } from "../net/guarded-fetch";
import { Outbound } from "../net/outbound";

/**
 * The **Logo search** query proxy (ADR 0007): Google Programmable Search's JSON
 * API with `searchType=image`, run server-side.
 *
 * Server-side because the API key is a server secret — the browser cannot make
 * this call without being handed the key, and a key in a bundle is a public
 * key. That is the whole job: everything else here is turning Google's three
 * failure modes into three the client can act on differently.
 *
 * - **unconfigured** — the key or the engine id is absent. Not a failure at
 *   all: nothing was attempted, and the answer is "go and set this up".
 * - **quota exceeded** — the free tier's 100 queries/day are spent. Retrying
 *   cannot help until tomorrow, so it must never look like the third case.
 * - **failed** — anything else. A retry may well work.
 *
 * Unlike the download path this URL is a constant, so it does not go through
 * the SSRF guard: there is no caller-supplied host to check. The caller's input
 * reaches it only as a query-string value.
 */

/** Google's endpoint. Fixed — the only caller-supplied part is `q`. */
const ENDPOINT = "https://www.googleapis.com/customsearch/v1";

/**
 * How many hits to ask for. Ten is the API's per-request maximum and one
 * "page"; asking for fewer would not save quota (billing is per query, not per
 * result) and asking again for more would.
 */
const RESULT_COUNT = 10;

/**
 * The slice of Programmable Search's response this reads. Effect's decoder
 * ignores properties we don't name, so the many facets Google also returns cost
 * nothing.
 *
 * `link` is required, everything else optional: a hit with no URL is not a hit,
 * while a hit with no thumbnail or dimensions still renders. A response that
 * misses the required shape fails the whole search rather than silently
 * dropping items — that shape moving is worth an error, not a short list.
 */
const GoogleImageItem = Schema.Struct({
	title: Schema.optional(Schema.String),
	link: Schema.String,
	image: Schema.optional(
		Schema.Struct({
			thumbnailLink: Schema.optional(Schema.String),
			contextLink: Schema.optional(Schema.String),
			width: Schema.optional(Schema.Number),
			height: Schema.optional(Schema.Number),
		}),
	),
});

/** `items` is absent, not empty, when a query matches nothing. */
const GoogleSearchResponse = Schema.Struct({
	items: Schema.optional(Schema.Array(GoogleImageItem)),
});

/**
 * The `reason` codes Google uses when the quota is the problem. The free tier
 * answers a spent daily allowance with **403**, not 429, so the status alone
 * cannot tell "come back tomorrow" from "your key is wrong".
 */
const QUOTA_REASONS = new Set([
	"dailyLimitExceeded",
	"quotaExceeded",
	"rateLimitExceeded",
	"userRateLimitExceeded",
]);

/** Google's error envelope, read only far enough to classify the failure. */
const GoogleErrorBody = Schema.Struct({
	error: Schema.optional(
		Schema.Struct({
			errors: Schema.optional(
				Schema.Array(Schema.Struct({ reason: Schema.optional(Schema.String) })),
			),
		}),
	),
});

/** Does this error body blame the quota? */
const blamesQuota = (body: unknown): boolean => {
	const decoded = Schema.decodeUnknownOption(GoogleErrorBody)(body);
	if (Option.isNone(decoded)) return false;
	return (decoded.value.error?.errors ?? []).some(
		(e) => e.reason !== undefined && QUOTA_REASONS.has(e.reason),
	);
};

/** A configured value counts as absent when it is blank — `FOO=` in an env
 * file is a value nothing downstream can use, and sending it to Google only
 * converts a clear "unconfigured" into a confusing 403. */
const isBlank = (value: string) => value.trim() === "";

export const searchLogos = (
	query: string,
): Effect.Effect<
	{ readonly results: ReadonlyArray<LogoSearchResult> },
	LogoSearchUnconfigured | LogoSearchQuotaExceeded | LogoSearchFailed,
	Outbound
> =>
	Effect.gen(function* () {
		// Both are `Config.option`, so absence is a value rather than an error;
		// anything that *does* fail here is a broken ConfigProvider, which is an
		// infrastructure defect and not this endpoint's to describe.
		const key = yield* Effect.orDie(GoogleCseKey);
		const cx = yield* Effect.orDie(GoogleCseCx);

		const missing: string[] = [];
		if (Option.isNone(key) || isBlank(Redacted.value(key.value))) {
			missing.push("GOOGLE_CSE_KEY");
		}
		if (Option.isNone(cx) || isBlank(cx.value)) missing.push("GOOGLE_CSE_CX");
		if (missing.length > 0) {
			return yield* Effect.fail(new LogoSearchUnconfigured({ missing }));
		}
		// Narrowed by the checks above; `missing` being empty is what proves it.
		const secret = Redacted.value(Option.getOrThrow(key));
		const engine = Option.getOrThrow(cx);

		const url = new URL(ENDPOINT);
		url.searchParams.set("key", secret);
		url.searchParams.set("cx", engine);
		url.searchParams.set("q", query);
		url.searchParams.set("searchType", "image");
		url.searchParams.set("num", String(RESULT_COUNT));
		url.searchParams.set("safe", "active");

		const outbound = yield* Outbound;
		const response = yield* Effect.tryPromise({
			try: (signal) =>
				outbound.fetch(url.href, {
					signal,
					headers: { accept: "application/json" },
				}),
			// Never quote the URL: it carries the key, and this message is sent to
			// the browser.
			catch: (cause) =>
				new LogoSearchFailed({
					message: `could not reach Programmable Search: ${cause}`,
				}),
		});

		const body = yield* Effect.tryPromise({
			try: () => response.json() as Promise<unknown>,
			catch: () =>
				new LogoSearchFailed({
					message: `Programmable Search answered ${response.status} with a body that is not JSON`,
				}),
		});

		if (!response.ok) {
			// 429 is unambiguous; a 403 has to be read, because a spent daily
			// allowance and a rejected key share the status.
			if (response.status === 429 || blamesQuota(body)) {
				return yield* Effect.fail(new LogoSearchQuotaExceeded());
			}
			return yield* Effect.fail(
				new LogoSearchFailed({
					message: `Programmable Search answered ${response.status}`,
				}),
			);
		}

		const decoded = yield* Schema.decodeUnknown(GoogleSearchResponse)(
			body,
		).pipe(
			Effect.mapError(
				() =>
					new LogoSearchFailed({
						message: "Programmable Search answered in an unexpected shape",
					}),
			),
		);

		return {
			results: (decoded.items ?? []).map((hit) => ({
				title: hit.title ?? "",
				imageUrl: hit.link,
				// A hit with no thumbnail is still usable — render the original
				// rather than dropping the result or painting an empty tile.
				thumbnailUrl: hit.image?.thumbnailLink ?? hit.link,
				contextUrl: hit.image?.contextLink,
				width: hit.image?.width,
				height: hit.image?.height,
			})),
		};
	}).pipe(
		// A hanging Google is a transport failure, not a quota one: retrying is
		// exactly the right advice, which is the distinction being preserved.
		Effect.timeoutFail({
			duration: FETCH_TIMEOUT,
			onTimeout: () =>
				new LogoSearchFailed({ message: "Programmable Search timed out" }),
		}),
	);
