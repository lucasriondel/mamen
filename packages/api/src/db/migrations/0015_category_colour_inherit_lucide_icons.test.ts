import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";
import migration0015 from "./0015_category_colour_inherit_lucide_icons";

/**
 * The post-migration shape of the seeded tree (ADR 0006, issue #55). Asserted
 * over the whole migrated set rather than over migration 0015 in isolation,
 * because what matters is the state a fresh database boots into: 0010 seeds
 * emoji-and-copied-colour rows, 0015 reinterprets them, and only the composition
 * is observable to a reader.
 */

type Row = { id: number; name: string; color: string | null; icon: string };

const allCategories = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const rows =
		yield* sql`SELECT id, name, color, icon, parentId FROM categories`;
	return rows as unknown as Array<Row & { parentId: number | null }>;
});

/** Lucide's canonical id form: lowercase alphanumerics joined by single dashes. */
const LUCIDE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("0015 category colour inheritance + Lucide icon names", () => {
	it.effect("nulls every Category leaf's colour and keeps every folder's", () =>
		Effect.gen(function* () {
			const rows = yield* allCategories;
			const parentIds = new Set(
				rows.map((r) => r.parentId).filter((id): id is number => id !== null),
			);
			assert.strictEqual(rows.length, 27); // 6 folders + 21 leaves

			const folders = rows.filter((r) => parentIds.has(r.id));
			const leaves = rows.filter((r) => !parentIds.has(r.id));
			assert.strictEqual(folders.length, 6);
			assert.strictEqual(leaves.length, 21);

			// A folder is now the only kind of row that *stores* a colour; every leaf
			// held a byte-identical copy of its folder's, so nulling loses nothing.
			for (const folder of folders) {
				assert.isNotNull(folder.color, `${folder.name} should keep its colour`);
			}
			for (const leaf of leaves) {
				assert.isNull(leaf.color, `${leaf.name} should inherit`);
			}
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("rewrites every seeded icon to a kebab-case Lucide id", () =>
		Effect.gen(function* () {
			const rows = yield* allCategories;
			for (const row of rows) {
				assert.match(
					row.icon,
					LUCIDE_ID,
					`${row.name} icon "${row.icon}" is not a Lucide id`,
				);
			}
			// Spot-check the translation across both kinds, so a silently-empty
			// UPDATE (a mistyped emoji key) fails rather than passing the regex.
			const byName = new Map(rows.map((r) => [r.name, r.icon]));
			assert.strictEqual(byName.get("Food"), "utensils-crossed");
			assert.strictEqual(byName.get("Groceries"), "shopping-cart");
			assert.strictEqual(byName.get("Uncategorised"), "circle-help");
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("leaves the tree's shape and lookup indexes intact", () =>
		Effect.gen(function* () {
			// The colour relax rebuilt the table; the copy must preserve ids (money
			// points at them) and the indexes must come back with it.
			const sql = yield* SqlClient.SqlClient;
			const rows = yield* allCategories;
			const food = rows.find((r) => r.name === "Food");
			const groceries = rows.find((r) => r.name === "Groceries");
			assert.isDefined(food);
			assert.isDefined(groceries);
			assert.strictEqual(groceries?.parentId, food?.id);

			const indexes =
				yield* sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'categories'`;
			const names = (indexes as unknown as Array<{ name: string }>).map(
				(r) => r.name,
			);
			for (const index of [
				"idx_categories_parentId",
				"idx_categories_slug",
				"idx_categories_sortOrder",
			]) {
				assert.include(names, index);
			}
		}).pipe(Effect.provide(DatabaseTest)),
	);

	/**
	 * The colour predicate over shapes the seed does not contain — a user's
	 * database is not the seed, and these are exactly the rows the rejected
	 * "null every childless row" rule would have got wrong.
	 *
	 * Run by *re-applying* 0015 to an already-migrated database with the rows
	 * planted first, which is sound because the migration is idempotent over its
	 * own output: a nulled colour matches neither arm of the predicate, and the
	 * emoji→Lucide table has no entry keyed by a Lucide id. That beats standing up
	 * a second, partial migrator layer to reach the 0014 state.
	 */
	const plant = (row: {
		name: string;
		color: string | null;
		parentId: number | null;
	}) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const inserted = yield* sql`INSERT INTO categories ${sql.insert({
				name: row.name,
				slug: row.name.toLowerCase(),
				color: row.color,
				icon: "tag",
				parentId: row.parentId,
				sortOrder: 0,
				createdAt: "2026-07-27T00:00:00.000Z",
			})} RETURNING id`;
			return (inserted[0] as { id: number }).id;
		});

	const colorOf = (id: number) =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const rows = yield* sql`SELECT color FROM categories WHERE id = ${id}`;
			return (rows[0] as { color: string | null }).color;
		});

	it.effect("keeps the colour a childless folder genuinely chose", () =>
		Effect.gen(function* () {
			// A seeded folder whose leaves the user deleted or moved away is now
			// childless, but its brand colour was a *choice*, not a copy. Nulling it
			// by childlessness would silently discard it.
			const emptied = yield* plant({
				name: "Emptied",
				color: "#3b82f6",
				parentId: null,
			});
			yield* migration0015;
			assert.strictEqual(yield* colorOf(emptied), "#3b82f6");
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect(
		"nulls the old hardcoded grey, even on a folder with children",
		() =>
			Effect.gen(function* () {
				// The live bug's residue: a category created through the UI carried
				// `#94a3b8` regardless of where it sat. Left on an *intermediate* folder
				// it would permanently block a recolour of the root above from reaching
				// the subtree below — so it inherits, and resolves to the identical
				// neutral constant meanwhile.
				const root = yield* plant({
					name: "Root",
					color: "#ef4444",
					parentId: null,
				});
				const middle = yield* plant({
					name: "Middle",
					color: "#94a3b8",
					parentId: root,
				});
				yield* plant({ name: "Deep", color: null, parentId: middle });

				yield* migration0015;
				assert.strictEqual(yield* colorOf(root), "#ef4444");
				assert.isNull(yield* colorOf(middle));
			}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("nulls a copy of the parent's colour but not a distinct one", () =>
		Effect.gen(function* () {
			const parent = yield* plant({
				name: "Parent",
				color: "#ef4444",
				parentId: null,
			});
			// Carried down from the folder it was created in — a copy, so it inherits.
			const copied = yield* plant({
				name: "Copied",
				color: "#ef4444",
				parentId: parent,
			});
			// Opted out, so it keeps its own colour and stops inheriting.
			const distinct = yield* plant({
				name: "Distinct",
				color: "#000000",
				parentId: parent,
			});

			yield* migration0015;
			assert.isNull(yield* colorOf(copied));
			assert.strictEqual(yield* colorOf(distinct), "#000000");
		}).pipe(Effect.provide(DatabaseTest)),
	);
});
