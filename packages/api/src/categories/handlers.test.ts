import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	CategoryId,
	type CategoryCreate,
	Api,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asId = Schema.decodeSync(CategoryId);

/** A valid create payload; override any field per test. */
const make = (over: Partial<CategoryCreate> = {}): CategoryCreate => ({
	name: "Food",
	slug: "food",
	color: "#ff0000",
	icon: "🍔",
	parentId: null,
	sortOrder: 0,
	...over,
});

describe("categories endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.categories.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.categories.create({
				payload: make({ name: "Groceries", slug: "groceries" }),
			});
			assert.strictEqual(created.name, "Groceries");
			assert.strictEqual(created.parentId, null);

			const fetched = yield* client.categories.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getBySlug finds by exact slug", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.categories.create({ payload: make({ slug: "rent" }) });
			const found = yield* client.categories.getBySlug({
				path: { slug: "rent" },
			});
			assert.strictEqual(found.slug, "rent");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.categories.create({ payload: make({ slug: "a" }) });
			yield* client.categories.create({ payload: make({ slug: "b" }) });
			yield* client.categories.create({ payload: make({ slug: "c" }) });

			const page = yield* client.categories.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list filters by parentId over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const parent = yield* client.categories.create({
				payload: make({ slug: "parent" }),
			});
			yield* client.categories.create({
				payload: make({ slug: "child-1", parentId: parent.id }),
			});
			yield* client.categories.create({
				payload: make({ slug: "child-2", parentId: parent.id }),
			});
			yield* client.categories.create({ payload: make({ slug: "root" }) });

			const page = yield* client.categories.list({
				urlParams: { limit: 50, offset: 0, parentId: parent.id },
			});
			assert.strictEqual(page.total, 2);
			assert.deepStrictEqual(
				page.items.map((c) => c.slug).sort(),
				["child-1", "child-2"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list orders by sortOrder over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.categories.create({
				payload: make({ slug: "third", sortOrder: 30 }),
			});
			yield* client.categories.create({
				payload: make({ slug: "first", sortOrder: 10 }),
			});
			yield* client.categories.create({
				payload: make({ slug: "second", sortOrder: 20 }),
			});

			const page = yield* client.categories.list({
				urlParams: { limit: 50, offset: 0, orderBy: "sortOrder" },
			});
			assert.deepStrictEqual(
				page.items.map((c) => c.slug),
				["first", "second", "third"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkCreate returns 201 with all created rows", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.categories.bulkCreate({
				payload: {
					records: [
						make({ slug: "one" }),
						make({ slug: "two" }),
					],
				},
			});
			assert.strictEqual(created.length, 2);
			assert.ok(created.every((c) => c.id > 0));

			const page = yield* client.categories.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.strictEqual(page.total, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change and keeps createdAt", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.categories.create({
				payload: make({ name: "Old", slug: "old" }),
			});
			const updated = yield* client.categories.update({
				path: { id: created.id },
				payload: { name: "New" },
			});
			assert.strictEqual(updated.name, "New");
			assert.strictEqual(updated.slug, "old");
			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove deletes the category (then getById 404s)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.categories.create({
				payload: make({ slug: "temp" }),
			});
			yield* client.categories.remove({ path: { id: created.id } });

			const error = yield* client.categories
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: created.id }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getById 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.categories
				.getById({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getBySlug 404s on a missing slug", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.categories
				.getBySlug({ path: { slug: "nope" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: "nope" }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.categories
				.update({ path: { id: asId(999) }, payload: { name: "X" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.categories
				.remove({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});
