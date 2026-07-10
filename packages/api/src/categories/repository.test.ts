import { assert, describe, it } from "@effect/vitest";
import {
	type CategoryCreate,
	CategoryId,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { CategoryRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `CategoryRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = CategoryRepo.Default.pipe(Layer.provide(DatabaseTest));

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

describe("CategoryRepo", () => {
	it.effect("create assigns an id and createdAt, then getById returns it", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const created = yield* repo.create(make({ name: "Groceries" }));
			assert.strictEqual(created.name, "Groceries");
			assert.strictEqual(created.parentId, null);
			assert.ok(created.id > 0);
			assert.ok(created.createdAt instanceof Date);

			const fetched = yield* repo.getById(created.id);
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("create keeps a non-null parentId", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const parent = yield* repo.create(make({ slug: "parent" }));
			const child = yield* repo.create(
				make({ slug: "child", parentId: parent.id }),
			);
			assert.strictEqual(child.parentId, parent.id);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns items and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			yield* repo.create(make({ slug: "a" }));
			yield* repo.create(make({ slug: "b" }));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			yield* repo.create(make({ slug: "a" }));
			yield* repo.create(make({ slug: "b" }));
			yield* repo.create(make({ slug: "c" }));

			const page = yield* repo.list({ limit: 1, offset: 1 });
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list filters by parentId (and total reflects the filter)", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const parent = yield* repo.create(make({ slug: "parent" }));
			yield* repo.create(make({ slug: "child-1", parentId: parent.id }));
			yield* repo.create(make({ slug: "child-2", parentId: parent.id }));
			yield* repo.create(make({ slug: "other-root" }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				parentId: parent.id,
			});
			assert.strictEqual(page.total, 2);
			assert.deepStrictEqual(
				page.items.map((c) => c.slug).sort(),
				["child-1", "child-2"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list orders by sortOrder when asked", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			yield* repo.create(make({ slug: "third", sortOrder: 30 }));
			yield* repo.create(make({ slug: "first", sortOrder: 10 }));
			yield* repo.create(make({ slug: "second", sortOrder: 20 }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				orderBy: "sortOrder",
			});
			assert.deepStrictEqual(
				page.items.map((c) => c.slug),
				["first", "second", "third"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list composes parentId + sortOrder together", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const parent = yield* repo.create(make({ slug: "parent" }));
			yield* repo.create(
				make({ slug: "b", parentId: parent.id, sortOrder: 20 }),
			);
			yield* repo.create(
				make({ slug: "a", parentId: parent.id, sortOrder: 10 }),
			);
			yield* repo.create(make({ slug: "root", sortOrder: 5 }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				parentId: parent.id,
				orderBy: "sortOrder",
			});
			assert.strictEqual(page.total, 2);
			assert.deepStrictEqual(
				page.items.map((c) => c.slug),
				["a", "b"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("bulkCreate inserts all rows and returns them with ids", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const created = yield* repo.bulkCreate([
				make({ slug: "one" }),
				make({ slug: "two" }),
				make({ slug: "three" }),
			]);
			assert.strictEqual(created.length, 3);
			assert.ok(created.every((c) => c.id > 0));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 3);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("bulkCreate on an empty array is a no-op", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const created = yield* repo.bulkCreate([]);
			assert.deepStrictEqual(created, []);
			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 0);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getBySlug returns the matching category", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			yield* repo.create(make({ slug: "rent" }));
			const found = yield* repo.getBySlug("rent");
			assert.strictEqual(found.slug, "rent");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges the partial and preserves createdAt", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const created = yield* repo.create(make({ name: "Old", color: "#000000" }));
			const updated = yield* repo.update(created.id, {
				name: "New",
				color: "#ffffff",
			});
			assert.strictEqual(updated.name, "New");
			assert.strictEqual(updated.color, "#ffffff");
			assert.strictEqual(updated.slug, created.slug);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update can reparent to null (root)", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const parent = yield* repo.create(make({ slug: "parent" }));
			const child = yield* repo.create(
				make({ slug: "child", parentId: parent.id }),
			);
			const updated = yield* repo.update(child.id, { parentId: null });
			assert.strictEqual(updated.parentId, null);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove deletes the row", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const created = yield* repo.create(make({ slug: "temp" }));
			yield* repo.remove(created.id);
			const error = yield* repo.getById(created.id).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: created.id }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getById fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getBySlug fails NotFound on a missing slug", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const error = yield* repo.getBySlug("nope").pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: "nope" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const error = yield* repo
				.update(asId(404), { name: "X" })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			const error = yield* repo.remove(asId(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "category", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);
});
