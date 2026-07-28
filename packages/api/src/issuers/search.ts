import {
	LogoSearchFailed,
	LogoSearchQuotaExceeded,
	type LogoSearchResult,
	LogoSearchUnconfigured,
} from "@mamen/shared/contract";
import { Effect, Option } from "effect";
import { LogodevToken } from "../config";
import { FETCH_TIMEOUT } from "../net/guarded-fetch";
import { Outbound } from "../net/outbound";

/**
 * The **Logo search** query proxy (ADR 0007, amended): logo.dev's Logo API,
 * looked up **by name**, run server-side.
 *
 * logo.dev is not a search engine — `img.logo.dev/name/<query>` resolves a
 * brand name to *one* logo image, served from a CDN. So "search" here means:
 * ask logo.dev whether it knows this name at all, and if it does, offer the
 * same logo on the three backgrounds the API can render (`theme=auto`, `light`,
 * `dark`) as the mosaic to pick from. One upstream request answers for all
 * three — the variants are the same asset re-rendered, so existence is shared.
 *
 * Server-side even though the token is *publishable* (logo.dev designs it to
 * sit in `<img>` tags): the client contract stays provider-agnostic, the
 * unconfigured state stays a server answer rather than a missing Vite env, and
 * there is exactly one place to configure. The failure taxonomy survives:
 *
 * - **unconfigured** — the token is absent. Not a failure at all: nothing was
 *   attempted, and the answer is "go and set this up".
 * - **quota exceeded** — logo.dev answered 429; its rate limit is spent.
 *   Retrying immediately cannot help, so it must never look like the third
 *   case.
 * - **failed** — anything else. A retry may well work.
 *
 * Unlike the download path this URL's host is a constant, so it does not go
 * through the SSRF guard: there is no caller-supplied host to check. The
 * caller's input reaches it only as an encoded path segment.
 */

/** logo.dev's image CDN. Fixed — the only caller-supplied part is the name. */
const ENDPOINT = "https://img.logo.dev";

/**
 * The three backgrounds logo.dev can render a transparent logo onto. The same
 * logo on each is what the mosaic offers: the stored image is a flattened
 * 128×128 WebP (ADR 0007), so the background baked in at download time is the
 * one the user keeps.
 */
const THEMES = ["auto", "light", "dark"] as const;

/** Full-size request: 256px at 2× — comfortably above the stored 128×128. */
const IMAGE_SIZE = 256;

/** What the mosaic tile loads. */
const THUMB_SIZE = 128;

/**
 * One lookup URL. `fallback=404` on every URL, not just the probe: without it
 * logo.dev answers an unknown name with a monogram placeholder and `200 OK`,
 * which would make "no logos found" unrepresentable — and would let a picked
 * result silently store a monogram if the logo vanished upstream.
 */
const variantUrl = (
	query: string,
	token: string,
	theme: (typeof THEMES)[number],
	size: number,
): string => {
	const url = new URL(`/name/${encodeURIComponent(query)}`, ENDPOINT);
	url.searchParams.set("token", token);
	url.searchParams.set("size", String(size));
	url.searchParams.set("format", "png");
	url.searchParams.set("theme", theme);
	url.searchParams.set("retina", "true");
	url.searchParams.set("fallback", "404");
	return url.href;
};

/** A configured value counts as absent when it is blank — `FOO=` in an env
 * file is a value nothing downstream can use, and sending it to logo.dev only
 * converts a clear "unconfigured" into a confusing 401. */
const isBlank = (value: string) => value.trim() === "";

export const searchLogos = (
	query: string,
): Effect.Effect<
	{ readonly results: ReadonlyArray<LogoSearchResult> },
	LogoSearchUnconfigured | LogoSearchQuotaExceeded | LogoSearchFailed,
	Outbound
> =>
	Effect.gen(function* () {
		// `Config.option`, so absence is a value rather than an error; anything
		// that *does* fail here is a broken ConfigProvider, which is an
		// infrastructure defect and not this endpoint's to describe.
		const token = yield* Effect.orDie(LogodevToken);

		if (Option.isNone(token) || isBlank(token.value)) {
			return yield* Effect.fail(
				new LogoSearchUnconfigured({ missing: ["LOGODEV_TOKEN"] }),
			);
		}
		const pk = token.value;

		// The probe doubles as the first result's URL: one request decides
		// whether logo.dev knows this name, and its answer is cached by the CDN
		// for when the mosaic actually renders it.
		const probe = variantUrl(query, pk, "auto", IMAGE_SIZE);

		const outbound = yield* Outbound;
		const response = yield* Effect.tryPromise({
			try: (signal) => outbound.fetch(probe, { signal }),
			// Never quote the URL: it carries the token, and this message is sent
			// to the browser. The token is publishable, but the habit is not.
			catch: (cause) =>
				new LogoSearchFailed({
					message: `could not reach logo.dev: ${cause}`,
				}),
		});

		// `fallback=404` turns "no logo for this name" into a plain 404 — an
		// empty result set, not a failure.
		if (response.status === 404) {
			return { results: [] };
		}
		if (response.status === 429) {
			return yield* Effect.fail(new LogoSearchQuotaExceeded());
		}
		if (!response.ok) {
			return yield* Effect.fail(
				new LogoSearchFailed({ message: `logo.dev answered ${response.status}` }),
			);
		}

		return {
			results: THEMES.map((theme) => ({
				title: theme === "auto" ? query : `${query} — ${theme} background`,
				imageUrl: variantUrl(query, pk, theme, IMAGE_SIZE),
				thumbnailUrl: variantUrl(query, pk, theme, THUMB_SIZE),
			})),
		};
	}).pipe(
		// A hanging logo.dev is a transport failure, not a quota one: retrying is
		// exactly the right advice, which is the distinction being preserved.
		Effect.timeoutFail({
			duration: FETCH_TIMEOUT,
			onTimeout: () => new LogoSearchFailed({ message: "logo.dev timed out" }),
		}),
	);
