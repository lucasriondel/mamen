import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	HttpApiBuilder,
	HttpApiClient,
	HttpClient,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import {
	Api,
	InvalidFileType,
	type IssuerCreate,
	IssuerId,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema, TestClock } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { StaticUploadsLive } from "../static/uploads";

// A dedicated uploads dir per test file, wired through the `UPLOADS_DIR` config
// env before any layer builds. Cleaned up after the suite so nothing lands in
// the repo tree. Set in `beforeAll` (config reads env lazily at layer build).
let uploadsDir: string;

beforeAll(() => {
	uploadsDir = mkdtempSync(join(tmpdir(), "mamen-uploads-"));
	process.env.UPLOADS_DIR = uploadsDir;
});

afterAll(() => {
	rmSync(uploadsDir, { recursive: true, force: true });
	process.env.UPLOADS_DIR = undefined;
});

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB.
// `NodeHttpServer.layerTest` also provides the `NodeContext` (FileSystem/Path)
// the image handlers + static route need, and an `HttpClient` bound to the test
// server (used to fetch `/uploads/*` raw, outside the typed contract).
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(StaticUploadsLive),
	Layer.provide(ApiLive),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asId = Schema.decodeSync(IssuerId);

const FIRST_SEEN = new Date("2026-01-15T00:00:00.000Z");

const make = (over: Partial<IssuerCreate> = {}): IssuerCreate => ({
	name: "Acme",
	firstSeen: FIRST_SEEN,
	...over,
});

/** A tiny valid file body under one of the allowed MIME types. */
const imageFormData = (
	mime = "image/png",
	filename = "logo.png",
): FormData => {
	const fd = new FormData();
	fd.append(
		"file",
		new File([new Uint8Array([1, 2, 3, 4])], filename, { type: mime }),
	);
	return fd;
};

describe("issuers endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.issuers.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({
				payload: make({ name: "Coffee Co" }),
			});
			assert.strictEqual(created.name, "Coffee Co");
			assert.strictEqual(created.imageUrl, undefined);

			const fetched = yield* client.issuers.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByName is exact; getByNameCi is case-insensitive", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.issuers.create({ payload: make({ name: "Netflix" }) });

			const exact = yield* client.issuers.getByName({
				path: { name: "Netflix" },
			});
			assert.strictEqual(exact.name, "Netflix");

			const ci = yield* client.issuers.getByNameCi({
				path: { name: "NETFLIX" },
			});
			assert.strictEqual(ci.name, "Netflix");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list orders by name over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.issuers.create({ payload: make({ name: "banana" }) });
			yield* client.issuers.create({ payload: make({ name: "Apple" }) });
			yield* client.issuers.create({ payload: make({ name: "cherry" }) });

			const page = yield* client.issuers.list({
				urlParams: { limit: 50, offset: 0, orderBy: "name" },
			});
			assert.deepStrictEqual(
				page.items.map((m) => m.name),
				["Apple", "banana", "cherry"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.issuers.create({ payload: make({ name: "a" }) });
			yield* client.issuers.create({ payload: make({ name: "b" }) });
			yield* client.issuers.create({ payload: make({ name: "c" }) });

			const page = yield* client.issuers.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change and keeps createdAt", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({
				payload: make({ name: "Old" }),
			});
			const updated = yield* client.issuers.update({
				path: { id: created.id },
				payload: { name: "New" },
			});
			assert.strictEqual(updated.name, "New");
			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove deletes the issuer (then getById 404s)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({
				payload: make({ name: "temp" }),
			});
			yield* client.issuers.remove({ path: { id: created.id } });

			const error = yield* client.issuers
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: created.id }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove cascades the image-file cleanup", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });
			const uploaded = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData(),
			});
			const url = uploaded.imageUrl as string;

			// Sanity: the file serves before removal.
			const before = yield* http.get(url);
			assert.strictEqual(before.status, 200);

			yield* client.issuers.remove({ path: { id: created.id } });

			// The row is gone AND the on-disk image was unlinked.
			const gone = yield* client.issuers
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				gone,
				new NotFound({ resource: "issuer", id: created.id }),
			);
			const after = yield* http.get(url);
			assert.strictEqual(after.status, 404);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("uploadImage stores the file and returns the updated issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });

			const updated = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData("image/png", "logo.png"),
			});

			// imageUrl is a root-relative /uploads/issuers/... path.
			assert.ok(updated.imageUrl?.startsWith("/uploads/issuers/issuer-"));
			assert.ok(updated.imageUrl?.endsWith(".png"));

			// The file is actually served by the static route.
			const res = yield* http.get(updated.imageUrl as string);
			assert.strictEqual(res.status, 200);
			const bytes = yield* res.arrayBuffer;
			assert.deepStrictEqual(
				new Uint8Array(bytes),
				new Uint8Array([1, 2, 3, 4]),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("re-uploading replaces the image and removes the old file", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });

			const first = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData("image/png", "first.png"),
			});
			const firstUrl = first.imageUrl as string;

			// Advance the clock so the second filename (id + timestamp) differs.
			yield* TestClock.adjust("1 millis");

			const second = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData("image/jpeg", "second.jpg"),
			});
			const secondUrl = second.imageUrl as string;

			assert.notStrictEqual(firstUrl, secondUrl);
			assert.ok(secondUrl.endsWith(".jpg"));

			// The new image serves; the old one is gone.
			const newRes = yield* http.get(secondUrl);
			assert.strictEqual(newRes.status, 200);
			const oldRes = yield* http.get(firstUrl);
			assert.strictEqual(oldRes.status, 404);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("deleteImage on a issuer with no image just returns it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });
			assert.strictEqual(created.imageUrl, undefined);

			const cleared = yield* client.issuers.deleteImage({
				path: { id: created.id },
			});
			assert.strictEqual(cleared.imageUrl, undefined);
			assert.strictEqual(cleared.id, created.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("uploadImage rejects a disallowed MIME type (415)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });

			const error = yield* client.issuers
				.uploadImage({
					path: { id: created.id },
					payload: imageFormData("application/pdf", "bad.pdf"),
				})
				.pipe(Effect.flip);

			assert.ok(error instanceof InvalidFileType);
			assert.strictEqual(error.received, "application/pdf");
			assert.deepStrictEqual(
				[...error.allowed].sort(),
				["image/gif", "image/jpeg", "image/png", "image/webp"],
			);

			// A rejected upload leaves imageUrl unset.
			const fetched = yield* client.issuers.getById({
				path: { id: created.id },
			});
			assert.strictEqual(fetched.imageUrl, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("uploadImage 404s on a missing issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.uploadImage({
					path: { id: asId(999) },
					payload: imageFormData(),
				})
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("deleteImage removes the file, clears imageUrl, returns issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const http = yield* HttpClient.HttpClient;
			const created = yield* client.issuers.create({ payload: make() });
			const uploaded = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData(),
			});
			const url = uploaded.imageUrl as string;

			const cleared = yield* client.issuers.deleteImage({
				path: { id: created.id },
			});
			assert.strictEqual(cleared.imageUrl, undefined);

			// The file is gone — the static route now 404s.
			const res = yield* http.get(url);
			assert.strictEqual(res.status, 404);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("deleteImage 404s on a missing issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.deleteImage({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("static /uploads route 404s on a path-traversal attempt", () =>
		Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			// Encoded `..` so the client doesn't normalize it away before the server.
			const res = yield* http.get("/uploads/..%2f..%2fpackage.json");
			assert.strictEqual(res.status, 404);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("static /uploads route 404s on a missing file", () =>
		Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const res = yield* http.get("/uploads/issuers/does-not-exist.png");
			assert.strictEqual(res.status, 404);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getById 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.getById({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByName 404s on a missing name", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.getByName({ path: { name: "nope" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: "nope" }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.update({ path: { id: asId(999) }, payload: { name: "X" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.issuers
				.remove({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});
