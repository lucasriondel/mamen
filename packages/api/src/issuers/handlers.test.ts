import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import {
	Api,
	type CategoryCreate,
	CategoryNotLeaf,
	InvalidFileType,
	type IssuerCreate,
	IssuerId,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema, TestClock } from "effect";
import sharp from "sharp";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
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
	Layer.provide(ClaudeCodeStub),
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

/** A category-create payload; a folder by default (`parentId: null`). */
const makeCategory = (over: Partial<CategoryCreate> = {}): CategoryCreate => ({
	name: "Food",
	slug: "food",
	color: "#ff0000",
	icon: "utensils-crossed",
	parentId: null,
	sortOrder: 0,
	...over,
});

// Real encoded images, built once — the upload path decodes what it is given
// now, so a handful of arbitrary bytes is no longer a valid fixture. `WIDE_PNG`
// and `TALL_JPEG` are deliberately not square, so the stored file proves the
// handler squares off a non-square input whatever its aspect ratio.
// `Uint8Array<ArrayBuffer>`, not `Buffer`: `File` only takes a view over a plain
// ArrayBuffer, which is what the `new Uint8Array(...)` copy guarantees.
let SQUARE_PNG: Uint8Array<ArrayBuffer>;
let WIDE_PNG: Uint8Array<ArrayBuffer>;
let TALL_JPEG: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
	const solid = (width: number, height: number) =>
		sharp({
			create: {
				width,
				height,
				channels: 3,
				background: { r: 10, g: 120, b: 220 },
			},
		});
	SQUARE_PNG = new Uint8Array(await solid(200, 200).png().toBuffer());
	WIDE_PNG = new Uint8Array(await solid(600, 100).png().toBuffer());
	TALL_JPEG = new Uint8Array(await solid(120, 480).jpeg().toBuffer());
});

/** A valid image body under one of the allowed MIME types. */
const imageFormData = (
	mime = "image/png",
	filename = "logo.png",
	bytes: Uint8Array<ArrayBuffer> = SQUARE_PNG,
): FormData => {
	const fd = new FormData();
	fd.append("file", new File([bytes], filename, { type: mime }));
	return fd;
};

/** Read a stored image back through the static route and probe it with sharp. */
const storedImageMetadata = (imageUrl: string) =>
	Effect.gen(function* () {
		const http = yield* HttpClient.HttpClient;
		const res = yield* http.get(imageUrl);
		assert.strictEqual(res.status, 200);
		const bytes = yield* res.arrayBuffer;
		return yield* Effect.promise(() => sharp(Buffer.from(bytes)).metadata());
	});

/**
 * The on-disk issuers upload directory, filtered to one issuer's files — the
 * directory is shared by the whole suite, so a bare listing would couple tests.
 */
const issuerFiles = (prefix: string) =>
	readdirSync(join(uploadsDir, "issuers")).filter((name) =>
		name.startsWith(prefix),
	);

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

	// The Leaf-assignable invariant (ADR 0003) at the issuers door: a default
	// category must be an assignable leaf (a node with no children), never a
	// folder. A folder-assigned issuer would hang its transactions off a node the
	// rollup visits but never counts. Assignability is childlessness, not
	// root-ness — a childless node is a leaf at any depth.
	it.effect("create accepts a leaf as the default category", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const folder = yield* client.categories.create({
				payload: makeCategory({ name: "Food", slug: "food-x" }),
			});
			const leaf = yield* client.categories.create({
				payload: makeCategory({
					name: "Groceries",
					slug: "groceries-x",
					parentId: folder.id,
				}),
			});

			const created = yield* client.issuers.create({
				payload: make({ name: "Market", defaultCategoryId: leaf.id }),
			});
			assert.strictEqual(created.defaultCategoryId, leaf.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create rejects a folder (a node with children)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			// A node is a folder by having children, not by being a root — give it a
			// child so the childlessness guard (ADR 0003) fires.
			const folder = yield* client.categories.create({
				payload: makeCategory({ name: "Food", slug: "food-y", parentId: null }),
			});
			yield* client.categories.create({
				payload: makeCategory({
					name: "Groceries",
					slug: "groceries-y",
					parentId: folder.id,
				}),
			});

			const error = yield* client.issuers
				.create({ payload: make({ defaultCategoryId: folder.id }) })
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, folder.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update rejects a folder (a node with children)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });
			const folder = yield* client.categories.create({
				payload: makeCategory({ name: "Food", slug: "food-z", parentId: null }),
			});
			yield* client.categories.create({
				payload: makeCategory({
					name: "Groceries",
					slug: "groceries-z",
					parentId: folder.id,
				}),
			});

			const error = yield* client.issuers
				.update({
					path: { id: created.id },
					payload: { defaultCategoryId: folder.id },
				})
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, folder.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update sets and then clears the default category", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const folder = yield* client.categories.create({
				payload: makeCategory({ name: "Food", slug: "food-c" }),
			});
			const leaf = yield* client.categories.create({
				payload: makeCategory({
					name: "Groceries",
					slug: "groceries-c",
					parentId: folder.id,
				}),
			});
			const created = yield* client.issuers.create({ payload: make() });

			const set = yield* client.issuers.update({
				path: { id: created.id },
				payload: { defaultCategoryId: leaf.id },
			});
			assert.strictEqual(set.defaultCategoryId, leaf.id);

			// A `null` clears it (absent-means-unchanged can't express this).
			const cleared = yield* client.issuers.update({
				path: { id: created.id },
				payload: { defaultCategoryId: null },
			});
			assert.strictEqual(cleared.defaultCategoryId, undefined);
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

	it.effect(
		"uploadImage normalises a wide PNG to a 128x128 WebP and stores only that",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const created = yield* client.issuers.create({ payload: make() });

				const updated = yield* client.issuers.uploadImage({
					path: { id: created.id },
					payload: imageFormData("image/png", "logo.png", WIDE_PNG),
				});

				// imageUrl is a root-relative /uploads/issuers/... path, and the
				// extension is WebP regardless of what was sent.
				assert.ok(updated.imageUrl?.startsWith("/uploads/issuers/issuer-"));
				assert.ok(updated.imageUrl?.endsWith(".webp"));

				// The file the static route serves is the normalised form: a 600x100
				// PNG went in, a 128x128 WebP came out. These fixtures are solid
				// colour, so this pins the size and format only; that the square is a
				// centre crop rather than a squash is pinned on the pipeline itself,
				// in image-normalise.test.ts.
				const meta = yield* storedImageMetadata(updated.imageUrl as string);
				assert.strictEqual(meta.format, "webp");
				assert.strictEqual(meta.width, 128);
				assert.strictEqual(meta.height, 128);

				// The original was never retained: this issuer's one upload left
				// exactly one file on disk, the normalised one.
				assert.deepStrictEqual(issuerFiles(`issuer-${created.id}-`), [
					(updated.imageUrl as string).replace("/uploads/issuers/", ""),
				]);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("uploadImage normalises a tall JPEG the same way", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.issuers.create({ payload: make() });

			const updated = yield* client.issuers.uploadImage({
				path: { id: created.id },
				payload: imageFormData("image/jpeg", "logo.jpg", TALL_JPEG),
			});

			assert.ok(updated.imageUrl?.endsWith(".webp"));
			const meta = yield* storedImageMetadata(updated.imageUrl as string);
			assert.strictEqual(meta.format, "webp");
			assert.strictEqual(meta.width, 128);
			assert.strictEqual(meta.height, 128);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"uploadImage refuses an allow-listed MIME whose body isn't an image (415)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const created = yield* client.issuers.create({ payload: make() });

				// A lying Content-Type: accepted by the allow-list, rejected on decode.
				const error = yield* client.issuers
					.uploadImage({
						path: { id: created.id },
						payload: imageFormData(
							"image/png",
							"not-really.png",
							new Uint8Array([1, 2, 3, 4]),
						),
					})
					.pipe(Effect.flip);

				assert.ok(error instanceof InvalidFileType);

				// Nothing was written and the column is untouched.
				const fetched = yield* client.issuers.getById({
					path: { id: created.id },
				});
				assert.strictEqual(fetched.imageUrl, undefined);
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
				payload: imageFormData("image/jpeg", "second.jpg", TALL_JPEG),
			});
			const secondUrl = second.imageUrl as string;

			assert.notStrictEqual(firstUrl, secondUrl);
			// A JPEG went in; the stored extension is WebP either way.
			assert.ok(secondUrl.endsWith(".webp"));

			// The new image serves; the old one is gone.
			const newRes = yield* http.get(secondUrl);
			assert.strictEqual(newRes.status, 200);
			const oldRes = yield* http.get(firstUrl);
			assert.strictEqual(oldRes.status, 404);

			// And the replaced file is really off the disk, not just unserved.
			assert.deepStrictEqual(issuerFiles(`issuer-${created.id}-`), [
				secondUrl.replace("/uploads/issuers/", ""),
			]);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("deleteImage on an issuer with no image just returns it", () =>
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
			assert.deepStrictEqual([...error.allowed].sort(), [
				"image/gif",
				"image/jpeg",
				"image/png",
				"image/webp",
			]);

			// A rejected upload leaves imageUrl unset.
			const fetched = yield* client.issuers.getById({
				path: { id: created.id },
			});
			assert.strictEqual(fetched.imageUrl, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	// The 2 MiB cap is not tested here. It rides the multipart schema and is
	// enforced by the parser as the body arrives, so it never fires under
	// `layerTest`, whose in-process client hands the request over whole. It has
	// its own suite over a real socket instead: image-cap.test.ts.

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

	it.effect(
		"deleteImage removes the file, clears imageUrl, returns issuer",
		() =>
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
