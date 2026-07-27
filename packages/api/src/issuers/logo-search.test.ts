import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import {
	Api,
	ImageFetchRefused,
	type IssuerCreate,
	IssuerId,
	LogoSearchQuotaExceeded,
	LogoSearchUnconfigured,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema, TestClock } from "effect";
import sharp from "sharp";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { stubOutbound } from "../net/test";
import { StaticUploadsLive } from "../static/uploads";

/**
 * The two **Logo search** endpoints over the wire (ADR 0007, issue #60).
 *
 * The guards themselves are pinned at their own level — `net/ssrf.test.ts` and
 * `net/guarded-fetch.test.ts` exercise every range, hop and cap directly. What
 * this suite adds is that the endpoints are *wired to them*: that
 * `setImageFromUrl` actually runs a caller-supplied URL through
 * `fetchGuarded` rather than around it, that a refusal reaches the client as
 * `ImageFetchRefused` and leaves nothing on disk, and that a fetched image is
 * stored through the same normalisation pipeline as an upload.
 */

/**
 * A fresh uploads directory *per test*, not per suite.
 *
 * Each `it.effect` builds its own server over its own `:memory:` database, so
 * issuer ids restart at 1, and `TestClock` starts at 0 — which means every test
 * that stores an image produces the same `issuer-1-0.webp`. Sharing one
 * directory would let a file written by an earlier test satisfy (or break) a
 * later test's "nothing was stored" assertion, which is precisely the assertion
 * the refusal cases turn on. The config is read per-request, so setting the
 * environment here is enough.
 */
let root: string;
const freshUploads = () => {
	const dir = mkdtempSync(join(root, "run-"));
	process.env.UPLOADS_DIR = dir;
	return dir;
};

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "mamen-logo-search-"));
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
	delete process.env.UPLOADS_DIR;
	configure(false);
});

const KEY = "test-cse-key";
const CX = "test-cse-cx";

/**
 * Config reaches the handler through the *server's* fiber, not the client's, so
 * `Effect.withConfigProvider` around the request would never be seen. Both
 * values are read per-request rather than at layer build, so setting the
 * environment per test is enough — and is what lets one suite cover both the
 * configured and the unconfigured case.
 */
const configure = (configured: boolean) => {
	if (configured) {
		process.env.GOOGLE_CSE_KEY = KEY;
		process.env.GOOGLE_CSE_CX = CX;
	} else {
		// `delete`, not `= undefined`: the latter leaves the key *present* with an
		// undefined value, which the env `ConfigProvider` reads as set-but-invalid
		// and turns into a 500 — the exact generic failure the unconfigured state
		// exists to replace. Absent has to mean absent.
		delete process.env.GOOGLE_CSE_KEY;
		delete process.env.GOOGLE_CSE_CX;
	}
};

const asId = Schema.decodeSync(IssuerId);

const make = (over: Partial<IssuerCreate> = {}): IssuerCreate => ({
	name: "Acme",
	firstSeen: new Date("2026-01-15T00:00:00.000Z"),
	...over,
});

/** A real encoded PNG — the download path decodes what it is given. */
let WIDE_PNG: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
	WIDE_PNG = new Uint8Array(
		await sharp({
			create: {
				width: 600,
				height: 100,
				channels: 3,
				background: { r: 10, g: 120, b: 220 },
			},
		})
			.png()
			.toBuffer(),
	);
});

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const LOGO_URL = "https://cdn.example/acme.png";

/** Google's own response shape, one image hit. */
const googleHit = {
	items: [
		{
			title: "Acme logo",
			link: LOGO_URL,
			image: {
				thumbnailLink: "https://encrypted.google.example/thumb.png",
				contextLink: "https://acme.example/about",
				width: 600,
				height: 100,
			},
		},
	],
};

/**
 * The whole server over a fake network, on its own uploads directory. `net` is
 * returned alongside so a test can assert on what was *not* fetched — the only
 * way "refused before any connection" is provable from out here — and `uploads`
 * so it can assert on what was not written.
 */
const serverWith = (opts: Parameters<typeof stubOutbound>[0]) => {
	const uploads = freshUploads();
	const net = stubOutbound(opts);
	const layer = HttpApiBuilder.serve().pipe(
		Layer.provide(StaticUploadsLive),
		Layer.provide(ApiLive),
		Layer.provide(ClaudeCodeStub),
		Layer.provide(net.layer),
		Layer.provide(DatabaseTest),
		Layer.provideMerge(NodeHttpServer.layerTest),
	);
	return { net, layer, uploads };
};

/** A network that answers Google and serves one real PNG from a public host. */
const happyNet = () => ({
	addresses: { "cdn.example": ["93.184.216.34"] },
	respond: (url: string) =>
		url.startsWith("https://www.googleapis.com/")
			? json(googleHit)
			: url === LOGO_URL
				? new Response(WIDE_PNG)
				: new Response(null, { status: 404 }),
});

/**
 * Everything stored under this test's uploads directory. `[]` when the
 * directory was never created, which is itself the answer for a refusal that
 * should have written nothing.
 */
const storedFiles = (dir: string) => {
	try {
		return readdirSync(join(dir, "issuers"));
	} catch {
		return [];
	}
};

describe("searchLogos endpoint", () => {
	it.effect("returns image results for a query", () => {
		configure(true);
		const { net, layer } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const { results } = yield* client.issuers.searchLogos({
				urlParams: { q: "acme logo" },
			});

			assert.deepStrictEqual(results, [
				{
					title: "Acme logo",
					imageUrl: LOGO_URL,
					thumbnailUrl: "https://encrypted.google.example/thumb.png",
					contextUrl: "https://acme.example/about",
					width: 600,
					height: 100,
				},
			]);

			// The query really went to Programmable Search's image search, with the
			// server's own credentials attached — the reason the proxy exists.
			assert.strictEqual(net.fetched.length, 1);
			const asked = new URL(net.fetched[0]!);
			assert.strictEqual(asked.searchParams.get("q"), "acme logo");
			assert.strictEqual(asked.searchParams.get("searchType"), "image");
			assert.strictEqual(asked.searchParams.get("key"), KEY);
		}).pipe(Effect.provide(layer));
	});

	it.effect("reports the unconfigured state, and spends nothing", () => {
		configure(false);
		const { net, layer } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.searchLogos({ urlParams: { q: "acme logo" } })
				.pipe(Effect.flip);

			// A distinct, client-readable state that survives the wire: the UI can
			// only explain what to set up if the tag and `missing` arrive intact.
			assert.instanceOf(error, LogoSearchUnconfigured);
			assert.deepStrictEqual([...error.missing].sort(), [
				"GOOGLE_CSE_CX",
				"GOOGLE_CSE_KEY",
			]);
			assert.deepStrictEqual(net.fetched, []);
		}).pipe(Effect.provide(layer));
	});

	it.effect("reports quota exhaustion as its own error", () => {
		configure(true);
		const { layer } = serverWith({
			respond: () =>
				json(
					{ error: { code: 403, errors: [{ reason: "dailyLimitExceeded" }] } },
					403,
				),
		});
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.searchLogos({ urlParams: { q: "acme logo" } })
				.pipe(Effect.flip);
			// Distinguishable from a transport failure at the client, not just in
			// the server's own log: the fix is wait-or-pay and the UI must not
			// offer a retry.
			assert.instanceOf(error, LogoSearchQuotaExceeded);
		}).pipe(Effect.provide(layer));
	});
});

describe("setImageFromUrl endpoint", () => {
	it.effect("stores a fetched image through the normalisation pipeline", () => {
		configure(true);
		const { layer, uploads } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });

			const updated = yield* client.issuers.setImageFromUrl({
				path: { id: created.id },
				payload: { url: LOGO_URL },
			});

			assert.ok(updated.imageUrl?.startsWith("/uploads/issuers/issuer-"));
			// WebP, whatever arrived — a searched image and an uploaded one are
			// byte-identical in form, which is the point of sharing the pipeline.
			assert.ok(updated.imageUrl?.endsWith(".webp"));

			const res = yield* http.get(updated.imageUrl as string);
			assert.strictEqual(res.status, 200);
			const bytes = yield* res.arrayBuffer;
			const meta = yield* Effect.promise(() =>
				sharp(Buffer.from(bytes)).metadata(),
			);
			assert.strictEqual(meta.format, "webp");
			assert.strictEqual(meta.width, 128);
			assert.strictEqual(meta.height, 128);

			// A 600x100 PNG went in and left exactly one file: the normalised one.
			assert.deepStrictEqual(storedFiles(uploads), [
				(updated.imageUrl as string).replace("/uploads/issuers/", ""),
			]);
		}).pipe(Effect.provide(layer));
	});

	it.effect(
		"refuses a private address without connecting, stores nothing",
		() => {
			configure(true);
			const { net, layer, uploads } = serverWith({
				addresses: { "internal.example": ["10.0.0.5"] },
				// The route would answer happily; nothing should ever ask it.
				respond: () => new Response(WIDE_PNG),
			});
			return Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const created = yield* client.issuers.create({ payload: make() });

				const error = yield* client.issuers
					.setImageFromUrl({
						path: { id: created.id },
						payload: { url: "https://internal.example/secret.png" },
					})
					.pipe(Effect.flip);

				// The guard's verdict survives the wire with its reason, so the UI can
				// say why rather than "failed".
				assert.instanceOf(error, ImageFetchRefused);
				assert.strictEqual(error.reason, "private-address");
				// This is the endpoint-level proof that the SSRF guard is on the path
				// at all: no socket was opened.
				assert.deepStrictEqual(net.fetched, []);

				const fetched = yield* client.issuers.getById({
					path: { id: created.id },
				});
				assert.strictEqual(fetched.imageUrl, undefined);
				assert.deepStrictEqual(storedFiles(uploads), []);
			}).pipe(Effect.provide(layer));
		},
	);

	it.effect("refuses a non-https URL", () => {
		configure(true);
		const { net, layer } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });
			const error = yield* client.issuers
				.setImageFromUrl({
					path: { id: created.id },
					payload: { url: "http://cdn.example/acme.png" },
				})
				.pipe(Effect.flip);
			assert.instanceOf(error, ImageFetchRefused);
			assert.strictEqual(error.reason, "not-https");
			assert.deepStrictEqual(net.fetched, []);
		}).pipe(Effect.provide(layer));
	});

	it.effect("refuses a redirect that points at an internal address", () => {
		configure(true);
		const { net, layer, uploads } = serverWith({
			addresses: { "cdn.example": ["93.184.216.34"] },
			respond: (url) =>
				url === LOGO_URL
					? new Response(null, {
							status: 302,
							headers: {
								location: "https://169.254.169.254/latest/meta-data/",
							},
						})
					: new Response(WIDE_PNG),
		});
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });
			const error = yield* client.issuers
				.setImageFromUrl({
					path: { id: created.id },
					payload: { url: LOGO_URL },
				})
				.pipe(Effect.flip);

			assert.instanceOf(error, ImageFetchRefused);
			assert.strictEqual(error.reason, "private-address");
			// Hop one was fetched, the metadata endpoint never was — the per-hop
			// re-check is on the endpoint's path, not just the module's.
			assert.deepStrictEqual(net.fetched, [LOGO_URL]);
			assert.deepStrictEqual(storedFiles(uploads), []);
		}).pipe(Effect.provide(layer));
	});

	it.effect("refuses bytes that are not an image, stores nothing", () => {
		configure(true);
		const { layer, uploads } = serverWith({
			addresses: { "cdn.example": ["93.184.216.34"] },
			respond: () => new Response(new Uint8Array([1, 2, 3, 4])),
		});
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });
			const error = yield* client.issuers
				.setImageFromUrl({
					path: { id: created.id },
					payload: { url: LOGO_URL },
				})
				.pipe(Effect.flip);

			assert.instanceOf(error, ImageFetchRefused);
			assert.strictEqual(error.reason, "not-an-image");
			assert.deepStrictEqual(storedFiles(uploads), []);
		}).pipe(Effect.provide(layer));
	});

	it.effect("404s on a missing issuer before fetching anything", () => {
		configure(true);
		const { net, layer } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.setImageFromUrl({
					path: { id: asId(999) },
					payload: { url: LOGO_URL },
				})
				.pipe(Effect.flip);

			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
			// A request for an issuer that isn't there must not spend a fetch —
			// otherwise the open proxy answers for ids that don't exist.
			assert.deepStrictEqual(net.fetched, []);
		}).pipe(Effect.provide(layer));
	});

	it.effect("replaces the previous image and removes the old file", () => {
		configure(true);
		const { layer, uploads } = serverWith(happyNet());
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });

			const first = yield* client.issuers.setImageFromUrl({
				path: { id: created.id },
				payload: { url: LOGO_URL },
			});
			// The filename is id + timestamp, so advance the clock or the second
			// store lands on the first's name and "the old file is gone" would hold
			// vacuously.
			yield* TestClock.adjust("1 millis");
			const second = yield* client.issuers.setImageFromUrl({
				path: { id: created.id },
				payload: { url: LOGO_URL },
			});

			assert.notStrictEqual(first.imageUrl, second.imageUrl);
			const gone = yield* http.get(first.imageUrl as string);
			assert.strictEqual(gone.status, 404);
			assert.deepStrictEqual(storedFiles(uploads), [
				(second.imageUrl as string).replace("/uploads/issuers/", ""),
			]);
		}).pipe(Effect.provide(layer));
	});
});
