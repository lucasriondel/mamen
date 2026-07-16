import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	Api,
	type CategoryCreate,
	CategoryHasChildren,
	CategoryId,
	CategoryInUse,
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
const asAccount = Schema.decodeSync(AccountId);

const TX_DATE = new Date("2026-03-01T00:00:00.000Z");

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

// The seeded tree (migration 0010): the six Category folders, top-to-bottom,
// each mapped to the leaf names that sit beneath it. Asserted independently of
// the migration's own data so the test pins the *shape* a caller observes.
const SEEDED_TREE: Record<string, readonly string[]> = {
	Food: ["Groceries", "Restaurants", "Cafés"],
	Home: ["Rent", "Energy", "Insurance", "Internet & Phone"],
	Transport: ["Fuel & Charging", "Transit", "Vehicle"],
	Life: ["Health", "Pets", "Shopping", "Subscriptions", "Gifts & Donations"],
	Leisure: ["Events", "Travel"],
	"Income & Other": ["Salary", "Taxes", "Transfers", "Uncategorised"],
};
const SEEDED_FOLDERS = Object.keys(SEEDED_TREE);
const SEEDED_LEAF_COUNT = Object.values(SEEDED_TREE).reduce(
	(n, ls) => n + ls.length,
	0,
);
const SEEDED_COUNT = SEEDED_FOLDERS.length + SEEDED_LEAF_COUNT;

describe("seeded category tree (migration 0010)", () => {
	it.effect(
		"a fresh migrated DB has the two-level tree at the right shape",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const page = yield* client.categories.list({
					urlParams: { limit: 100, offset: 0 },
				});
				const all = page.items;

				const folders = all.filter((c) => c.parentId === null);
				const leaves = all.filter((c) => c.parentId !== null);

				// Six folders, in seed order; every leaf sits under a real folder.
				assert.deepStrictEqual(
					folders.map((f) => f.name),
					SEEDED_FOLDERS,
				);
				assert.strictEqual(leaves.length, SEEDED_LEAF_COUNT);
				const folderIds = new Set(folders.map((f) => f.id));
				assert.ok(leaves.every((l) => folderIds.has(l.parentId!)));

				// Each folder holds exactly its seeded leaves.
				const byId = new Map(folders.map((f) => [f.id, f.name]));
				const leavesByFolder: Record<string, string[]> = {};
				for (const leaf of leaves) {
					const folderName = byId.get(leaf.parentId!) as string;
					const bucket = leavesByFolder[folderName] ?? [];
					bucket.push(leaf.name);
					leavesByFolder[folderName] = bucket;
				}
				assert.deepStrictEqual(leavesByFolder, SEEDED_TREE);

				// *Uncategorised* — the override escape hatch — is present as a leaf.
				const uncategorised = all.find((c) => c.name === "Uncategorised");
				assert.ok(uncategorised);
				assert.strictEqual(byId.get(uncategorised.parentId!), "Income & Other");
			}).pipe(Effect.provide(HttpLive)),
	);
});

describe("categories endpoints", () => {
	it.effect("list returns the seeded tree initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.categories.list({
				urlParams: { limit: 100, offset: 0 },
			});
			assert.strictEqual(page.total, SEEDED_COUNT);
			assert.strictEqual(page.items.length, SEEDED_COUNT);
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
			// The seeded tree already occupies the table, so the three new rows lift
			// the total above the seed count rather than standing on their own.
			assert.strictEqual(page.total, SEEDED_COUNT + 3);
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
			assert.deepStrictEqual(page.items.map((c) => c.slug).sort(), [
				"child-1",
				"child-2",
			]);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list orders by sortOrder over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			// Scope under a fresh parent so the seeded rows don't interleave.
			const parent = yield* client.categories.create({
				payload: make({ slug: "ordered-parent" }),
			});
			yield* client.categories.create({
				payload: make({ slug: "third", parentId: parent.id, sortOrder: 30 }),
			});
			yield* client.categories.create({
				payload: make({ slug: "first", parentId: parent.id, sortOrder: 10 }),
			});
			yield* client.categories.create({
				payload: make({ slug: "second", parentId: parent.id, sortOrder: 20 }),
			});

			const page = yield* client.categories.list({
				urlParams: {
					limit: 50,
					offset: 0,
					parentId: parent.id,
					orderBy: "sortOrder",
				},
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
					records: [make({ slug: "one" }), make({ slug: "two" })],
				},
			});
			assert.strictEqual(created.length, 2);
			assert.ok(created.every((c) => c.id > 0));

			const page = yield* client.categories.list({
				urlParams: { limit: 100, offset: 0 },
			});
			assert.strictEqual(page.total, SEEDED_COUNT + 2);
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

	// The Leaf-assignable invariant (ADR 0003) at the categories door: categories
	// nest to **any depth**, so any node — leaf or folder — is a legal parent. The
	// old depth-3 rejection is gone; creating under an existing leaf simply turns
	// that leaf into a folder.
	describe("categories nest to any depth on create/bulkCreate (ADR 0003)", () => {
		it.effect("create accepts a parentId pointing at a leaf (depth 3)", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Life (folder) → Subscriptions (leaf) → Streaming (depth-3 child).
				const folder = yield* client.categories.create({
					payload: make({ slug: "life" }),
				});
				const subscriptions = yield* client.categories.create({
					payload: make({ slug: "subscriptions", parentId: folder.id }),
				});

				// A grandchild under the former leaf is now legal — it sits at depth 3.
				const streaming = yield* client.categories.create({
					payload: make({ slug: "streaming", parentId: subscriptions.id }),
				});
				assert.strictEqual(streaming.parentId, subscriptions.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("create accepts a parentId pointing at a folder", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const leaf = yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: folder.id }),
				});
				assert.strictEqual(leaf.parentId, folder.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("bulkCreate accepts a leaf parent in a row (depth 3)", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "life" }),
				});
				const subscriptions = yield* client.categories.create({
					payload: make({ slug: "subscriptions", parentId: folder.id }),
				});

				const before = yield* client.categories.list({
					urlParams: { limit: 100, offset: 0 },
				});

				const created = yield* client.categories.bulkCreate({
					payload: {
						records: [
							make({ slug: "gifts", parentId: folder.id }),
							make({ slug: "streaming", parentId: subscriptions.id }),
						],
					},
				});
				assert.strictEqual(created.length, 2);
				// The depth-3 row lands under the former leaf, no rejection.
				assert.strictEqual(created[1]?.parentId, subscriptions.id);

				const after = yield* client.categories.list({
					urlParams: { limit: 100, offset: 0 },
				});
				assert.strictEqual(after.total, before.total + 2);
			}).pipe(Effect.provide(HttpLive)),
		);
	});

	// The remaining `update` guard (ADR 0003): a leaf may move under any node at
	// any depth (childlessness, not position, decides), but a folder with children
	// may not be given a parent — the moved-node guard that survives from the
	// two-level world.
	describe("re-parent guards on update (ADR 0003)", () => {
		it.effect("moves a leaf under another leaf (now legal, depth 3)", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const groceries = yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: folder.id }),
				});
				const restaurants = yield* client.categories.create({
					payload: make({ slug: "restaurants", parentId: folder.id }),
				});

				// Moving Groceries (childless) under Restaurants (childless) is a legal
				// depth-3 move now — assignability is childlessness, not root-ness.
				const moved = yield* client.categories.update({
					path: { id: groceries.id },
					payload: { parentId: restaurants.id },
				});
				assert.strictEqual(moved.parentId, restaurants.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("rejects giving a parent to a folder that has children", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const food = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: food.id }),
				});
				const other = yield* client.categories.create({
					payload: make({ slug: "other" }),
				});

				// Food still holds Groceries; re-homing it under Other would sink
				// Groceries to depth 3.
				const error = yield* client.categories
					.update({ path: { id: food.id }, payload: { parentId: other.id } })
					.pipe(Effect.flip);
				assert.ok(error instanceof CategoryHasChildren);
				assert.strictEqual(error.categoryId, food.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("moves a leaf to a different folder (its identity follows)", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const food = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const life = yield* client.categories.create({
					payload: make({ slug: "life" }),
				});
				const coffee = yield* client.categories.create({
					payload: make({ slug: "coffee", parentId: food.id }),
				});

				const moved = yield* client.categories.update({
					path: { id: coffee.id },
					payload: { parentId: life.id },
				});
				// Same category id — a transaction pointing at it follows to the new
				// folder for free; only its `parentId` changed.
				assert.strictEqual(moved.id, coffee.id);
				assert.strictEqual(moved.parentId, life.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("lets an empty folder be given a parent (becomes a leaf)", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const food = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const empty = yield* client.categories.create({
					payload: make({ slug: "empty" }),
				});

				// No children hang off `empty`, so re-homing it under a folder is a
				// legal folder→leaf move.
				const moved = yield* client.categories.update({
					path: { id: empty.id },
					payload: { parentId: food.id },
				});
				assert.strictEqual(moved.parentId, food.id);
			}).pipe(Effect.provide(HttpLive)),
		);
	});

	// The guarded delete (ADR 0001): a category is refused deletion while anything
	// still depends on it, and the refusal names each dependent by count so the
	// user can re-assign first. Neither cascading nor nulling is offered.
	describe("guarded delete", () => {
		it.effect("refuses to delete a folder that still has children", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: folder.id }),
				});
				yield* client.categories.create({
					payload: make({ slug: "restaurants", parentId: folder.id }),
				});

				const error = yield* client.categories
					.remove({ path: { id: folder.id } })
					.pipe(Effect.flip);
				assert.ok(error instanceof CategoryInUse);
				assert.strictEqual(error.categoryId, folder.id);
				assert.strictEqual(error.children, 2);
				assert.strictEqual(error.transactions, 0);
				assert.strictEqual(error.issuers, 0);

				// The folder is untouched — nothing was cascaded away.
				const still = yield* client.categories.getById({
					path: { id: folder.id },
				});
				assert.strictEqual(still.id, folder.id);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("refuses to delete a leaf still assigned to transactions", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const leaf = yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: folder.id }),
				});

				// A transaction carrying this leaf as a Category override.
				yield* client.transactions.create({
					payload: {
						accountId: asAccount(1),
						date: TX_DATE,
						amount: 12.5,
						rawIssuerString: "MARKET",
						importedAt: TX_DATE,
						importMonth: "2026-03",
						categoryId: leaf.id,
						manualCategory: true,
					},
				});

				const error = yield* client.categories
					.remove({ path: { id: leaf.id } })
					.pipe(Effect.flip);
				assert.ok(error instanceof CategoryInUse);
				assert.strictEqual(error.categoryId, leaf.id);
				assert.strictEqual(error.children, 0);
				assert.strictEqual(error.transactions, 1);
				assert.strictEqual(error.issuers, 0);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect("refuses to delete a leaf held as an issuer default", () =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const folder = yield* client.categories.create({
					payload: make({ slug: "food" }),
				});
				const leaf = yield* client.categories.create({
					payload: make({ slug: "groceries", parentId: folder.id }),
				});

				// An issuer holding this leaf as its default category.
				yield* client.issuers.create({
					payload: {
						name: "Whole Foods",
						firstSeen: TX_DATE,
						defaultCategoryId: leaf.id,
					},
				});

				const error = yield* client.categories
					.remove({ path: { id: leaf.id } })
					.pipe(Effect.flip);
				assert.ok(error instanceof CategoryInUse);
				assert.strictEqual(error.categoryId, leaf.id);
				assert.strictEqual(error.children, 0);
				assert.strictEqual(error.transactions, 0);
				assert.strictEqual(error.issuers, 1);
			}).pipe(Effect.provide(HttpLive)),
		);

		it.effect(
			"deletes a leaf when nothing depends on it (a bare override doesn't count)",
			() =>
				Effect.gen(function* () {
					const client = yield* HttpApiClient.make(Api);
					const folder = yield* client.categories.create({
						payload: make({ slug: "food" }),
					});
					const leaf = yield* client.categories.create({
						payload: make({ slug: "groceries", parentId: folder.id }),
					});

					// A transaction that once referenced the leaf but whose override was
					// removed (manualCategory cleared) is *not* a live assignment — the
					// derivation ignores a non-manual `categoryId` — so it must not block.
					yield* client.transactions.create({
						payload: {
							accountId: asAccount(1),
							date: TX_DATE,
							amount: 12.5,
							rawIssuerString: "MARKET",
							importedAt: TX_DATE,
							importMonth: "2026-03",
							categoryId: leaf.id,
							manualCategory: false,
						},
					});

					yield* client.categories.remove({ path: { id: leaf.id } });
					const error = yield* client.categories
						.getById({ path: { id: leaf.id } })
						.pipe(Effect.flip);
					assert.ok(error instanceof NotFound);
				}).pipe(Effect.provide(HttpLive)),
		);
	});

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
