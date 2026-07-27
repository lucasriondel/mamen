import { assert, describe, it } from "@effect/vitest";
import {
	LogoSearchFailed,
	LogoSearchQuotaExceeded,
	LogoSearchUnconfigured,
} from "@mamen/shared/contract";
import { ConfigProvider, Effect, Fiber, Layer, TestClock } from "effect";
import { FETCH_TIMEOUT } from "../net/guarded-fetch";
import { Outbound } from "../net/outbound";
import { searchLogos } from "./search";

const KEY = "test-cse-key";
const CX = "test-cse-cx";

/**
 * Config from a map rather than `process.env`: the unconfigured state is half
 * of what this module does, and an env-backed test would depend on the
 * ambient environment for its most important case.
 */
const withConfig = (entries: Record<string, string>) =>
	Effect.withConfigProvider(
		ConfigProvider.fromMap(new Map(Object.entries(entries))),
	);

const CONFIGURED = { GOOGLE_CSE_KEY: KEY, GOOGLE_CSE_CX: CX };

/** A stub Google. Records every request; never resolves DNS (nothing should). */
const stubGoogle = (respond: (url: string) => Response | Promise<Response>) => {
	const requested: string[] = [];
	const layer = Layer.succeed(Outbound, {
		lookup: () =>
			Promise.reject(new Error("the search proxy must not resolve")),
		fetch: (url) => {
			requested.push(url);
			return Promise.resolve(respond(url));
		},
	});
	return { layer, requested };
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

/** One image result in Programmable Search's own response shape. */
const item = (over: Record<string, unknown> = {}) => ({
	title: "Acme logo",
	link: "https://cdn.example/acme.png",
	mime: "image/png",
	image: {
		thumbnailLink: "https://encrypted.google.example/thumb.png",
		contextLink: "https://acme.example/about",
		width: 512,
		height: 512,
	},
	...over,
});

const run = (
	net: ReturnType<typeof stubGoogle>,
	config: Record<string, string> = CONFIGURED,
	query = "acme logo",
) => searchLogos(query).pipe(Effect.provide(net.layer), withConfig(config));

/**
 * Run and narrow the failure to `LogoSearchUnconfigured`, so a test can read
 * `missing` off it. The assertion is inside the helper rather than at each call
 * site because the alternative — a cast — would keep passing if the endpoint
 * started answering a missing key with `LogoSearchFailed`, which is exactly the
 * confusion the distinct state exists to prevent.
 */
const unconfiguredFrom = (
	net: ReturnType<typeof stubGoogle>,
	config: Record<string, string>,
) =>
	run(net, config).pipe(
		Effect.flip,
		Effect.map((error) => {
			assert.instanceOf(error, LogoSearchUnconfigured);
			return error;
		}),
	);

describe("searchLogos — configuration", () => {
	it.effect("reports itself unconfigured when neither value is set", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({}));
			const error = yield* run(net, {}).pipe(Effect.flip);
			assert.instanceOf(error, LogoSearchUnconfigured);
			// Names both, so the UI can say what to set rather than "search is
			// broken" — the distinct-state requirement is only worth anything if
			// it carries enough to act on.
			assert.deepStrictEqual([...error.missing].sort(), [
				"GOOGLE_CSE_CX",
				"GOOGLE_CSE_KEY",
			]);
			// And it costs nothing: no call is made with credentials it hasn't got.
			assert.deepStrictEqual(net.requested, []);
		}),
	);

	it.effect("names only the value that is missing", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({}));
			const missingCx = yield* unconfiguredFrom(net, { GOOGLE_CSE_KEY: KEY });
			assert.deepStrictEqual([...missingCx.missing], ["GOOGLE_CSE_CX"]);

			const missingKey = yield* unconfiguredFrom(net, { GOOGLE_CSE_CX: CX });
			assert.deepStrictEqual([...missingKey.missing], ["GOOGLE_CSE_KEY"]);
		}),
	);

	it.effect("treats a blank value as absent", () =>
		Effect.gen(function* () {
			// `GOOGLE_CSE_KEY=` in an env file is set-but-empty, which every layer
			// below here would happily send to Google to be rejected. Unconfigured
			// is what it means.
			const net = stubGoogle(() => json({}));
			const error = yield* run(net, {
				GOOGLE_CSE_KEY: "   ",
				GOOGLE_CSE_CX: "",
			}).pipe(Effect.flip);
			assert.instanceOf(error, LogoSearchUnconfigured);
			assert.deepStrictEqual([...error.missing].sort(), [
				"GOOGLE_CSE_CX",
				"GOOGLE_CSE_KEY",
			]);
			assert.deepStrictEqual(net.requested, []);
		}),
	);
});

describe("searchLogos — results", () => {
	it.effect("queries Programmable Search for images", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({ items: [item()] }));
			yield* run(net);

			assert.strictEqual(net.requested.length, 1);
			const url = new URL(net.requested[0]!);
			assert.strictEqual(url.origin, "https://www.googleapis.com");
			assert.strictEqual(url.pathname, "/customsearch/v1");
			assert.strictEqual(url.searchParams.get("key"), KEY);
			assert.strictEqual(url.searchParams.get("cx"), CX);
			assert.strictEqual(url.searchParams.get("q"), "acme logo");
			// Without this the same endpoint returns web pages, not images.
			assert.strictEqual(url.searchParams.get("searchType"), "image");
		}),
	);

	it.effect("returns the thumbnail and the source URL of each hit", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({ items: [item()] }));
			const { results } = yield* run(net);
			assert.deepStrictEqual(results, [
				{
					title: "Acme logo",
					// The full-size original, on its own host — this is what gets
					// handed back to `setImageFromUrl`.
					imageUrl: "https://cdn.example/acme.png",
					// Google's own small copy — what the picker grid renders, so
					// opening the popover doesn't pull a dozen full-size logos.
					thumbnailUrl: "https://encrypted.google.example/thumb.png",
					contextUrl: "https://acme.example/about",
					width: 512,
					height: 512,
				},
			]);
		}),
	);

	it.effect("falls back to the source URL when there is no thumbnail", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({ items: [item({ image: {} })] }));
			const { results } = yield* run(net);
			// A hit with no thumbnail is still a usable hit; rendering the
			// full-size image beats dropping the result or an empty tile.
			assert.strictEqual(
				results[0]?.thumbnailUrl,
				"https://cdn.example/acme.png",
			);
			assert.isUndefined(results[0]?.contextUrl);
		}),
	);

	it.effect("returns nothing for a query with no hits", () =>
		Effect.gen(function* () {
			// Google omits `items` entirely rather than sending an empty array.
			const net = stubGoogle(() => json({ searchInformation: {} }));
			const { results } = yield* run(net);
			assert.deepStrictEqual(results, []);
		}),
	);
});

describe("searchLogos — quota", () => {
	it.effect("reports the daily limit as its own error on 429", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() =>
				json({ error: { code: 429, message: "Quota exceeded" } }, 429),
			);
			const error = yield* run(net).pipe(Effect.flip);
			// Its own error, not a transport failure: the fix is wait or pay, and
			// nothing in the UI should suggest retrying.
			assert.instanceOf(error, LogoSearchQuotaExceeded);
		}),
	);

	it.effect("reports the daily limit on a 403 that says so", () =>
		Effect.gen(function* () {
			// The free tier's actual answer once the 100 daily queries are gone:
			// 403, not 429. Reading only the status would file this as a generic
			// failure and invite the retry the whole distinction exists to avoid.
			const net = stubGoogle(() =>
				json(
					{
						error: {
							code: 403,
							message: "Quota exceeded for quota metric 'Queries'",
							errors: [{ reason: "dailyLimitExceeded" }],
						},
					},
					403,
				),
			);
			assert.instanceOf(
				yield* run(net).pipe(Effect.flip),
				LogoSearchQuotaExceeded,
			);
		}),
	);

	it.effect("does not read every 403 as a quota failure", () =>
		Effect.gen(function* () {
			// A revoked key, or an engine the key can't use, is also a 403 — and
			// is emphatically not "come back tomorrow".
			const net = stubGoogle(() =>
				json(
					{
						error: {
							code: 403,
							message: "Requests from referer <empty> are blocked.",
							errors: [{ reason: "forbidden" }],
						},
					},
					403,
				),
			);
			assert.instanceOf(yield* run(net).pipe(Effect.flip), LogoSearchFailed);
		}),
	);
});

describe("searchLogos — failures", () => {
	it.effect("reports a server error as a transport failure", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => json({}, 500));
			const error = yield* run(net).pipe(Effect.flip);
			assert.instanceOf(error, LogoSearchFailed);
			assert.include(error.message, "500");
		}),
	);

	it.effect("reports a refused connection as a transport failure", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => {
				throw new Error("ECONNREFUSED");
			});
			assert.instanceOf(yield* run(net).pipe(Effect.flip), LogoSearchFailed);
		}),
	);

	it.effect("reports an unreadable body as a transport failure", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => new Response("<html>nope</html>"));
			assert.instanceOf(yield* run(net).pipe(Effect.flip), LogoSearchFailed);
		}),
	);

	it.effect("reports a response in an unexpected shape", () =>
		Effect.gen(function* () {
			// Valid JSON, wrong shape. Better surfaced than silently half-read:
			// this is the signal that Google's response format moved.
			const net = stubGoogle(() => json({ items: [{ nope: true }] }));
			assert.instanceOf(yield* run(net).pipe(Effect.flip), LogoSearchFailed);
		}),
	);

	it.effect("never leaks the API key into a client-visible error", () =>
		Effect.gen(function* () {
			// The message reaches the browser, and the key is in the request URL
			// a naive "include what we were doing" message would quote. The key
			// being server-only is the reason this proxy exists at all.
			const net = stubGoogle(() => json({}, 500));
			const error = yield* run(net).pipe(Effect.flip);
			assert.instanceOf(error, LogoSearchFailed);
			assert.notInclude(error.message, KEY);
		}),
	);

	it.effect("gives up on a Google that never answers", () =>
		Effect.gen(function* () {
			const net = stubGoogle(() => new Promise<Response>(() => {}));
			const fiber = yield* Effect.fork(run(net).pipe(Effect.flip));
			yield* TestClock.adjust(FETCH_TIMEOUT);
			// A hang is a transport failure, not a quota one: retrying is exactly
			// the right advice here.
			assert.instanceOf(yield* Fiber.join(fiber), LogoSearchFailed);
		}),
	);
});
