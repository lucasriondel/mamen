import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Category colour becomes **inherited** and `icon` becomes an **Icon name**
 * (ADR 0006, issue #55) — one migration, because both rewrite the same seeded
 * rows.
 *
 * **Colour.** `categories.color` was `TEXT NOT NULL` and the seed (0010) wrote
 * each folder's colour onto every leaf beneath it, so a leaf's colour was a
 * *copy* with no link back. NULL now means *inherit*: the colour a row paints is
 * its nearest non-null ancestor's, so one write recolours a subtree. SQLite
 * cannot relax a `NOT NULL` in place, so the table is rebuilt (create / copy /
 * drop / rename) and its three lookup indexes recreated — they die with the old
 * table. The schema has zero foreign keys, so no `PRAGMA foreign_keys` dance is
 * needed.
 *
 * Then every **Category leaf** (a row nothing points at) is nulled. Unconditional
 * rather than "null it only if it equals its parent's": as seeded every leaf's
 * colour *is* a byte-identical copy, so nothing is lost, and a leaf that wants
 * its own colour can store one afterwards. A childless *root* is nulled too and
 * resolves to the neutral constant — which is exactly the hardcoded grey every
 * user-created category already carried.
 *
 * **Icons.** The emoji→Lucide table below rewrites the icons in place: no tagged
 * `emoji:`/`lucide:` union and no second column, because that is permanent
 * complexity in every read path to protect data this database does not have.
 * Keyed on the **emoji**, not the slug, so the translation reaches renamed and
 * re-parented rows and every user-created category (all of which carry the old
 * `🏷️` default) — it is a global reinterpretation of the column, not a re-seed.
 * A hand-typed emoji outside this table survives as an unresolvable name and
 * renders the fallback glyph, the accepted degradation.
 */

/**
 * Old emoji → Lucide icon id (kebab-case, Lucide's own canonical key — not the
 * PascalCase React export). Covers all 27 seeded rows (6 folders + 21 leaves)
 * plus `🏷️`, the default every category created through the UI carried.
 */
const ICON_TRANSLATION: ReadonlyArray<
	readonly [emoji: string, lucide: string]
> = [
	// Food
	["🍔", "utensils-crossed"],
	["🛒", "shopping-cart"],
	["🍽️", "utensils"],
	["☕", "coffee"],
	// Home
	["🏠", "house"],
	["🔑", "key-round"],
	["⚡", "zap"],
	["🛡️", "shield"],
	["📶", "wifi"],
	// Transport
	["🚗", "car"],
	["⛽", "fuel"],
	["🚆", "train-front"],
	["🔧", "wrench"],
	// Life
	["💫", "sparkles"],
	["🩺", "stethoscope"],
	["🐾", "paw-print"],
	["🛍️", "shopping-bag"],
	["🔁", "repeat"],
	["🎁", "gift"],
	// Leisure
	["🎉", "party-popper"],
	["🎫", "ticket"],
	["✈️", "plane"],
	// Income & Other
	["💰", "piggy-bank"],
	["💵", "banknote"],
	["🧾", "receipt"],
	["🔄", "arrow-left-right"],
	["❓", "circle-help"],
	// The old new-category default.
	["🏷️", "tag"],
];

export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.gen(function* () {
		// 1. Rebuild the table with a nullable `color`, carrying every row over
		//    unchanged, then restore the indexes the drop took with it.
		yield* sql`
			CREATE TABLE categories_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				slug TEXT NOT NULL,
				color TEXT,
				icon TEXT NOT NULL,
				parentId INTEGER,
				sortOrder INTEGER NOT NULL DEFAULT 0,
				createdAt TEXT NOT NULL
			)
		`;
		yield* sql`
			INSERT INTO categories_new (id, name, slug, color, icon, parentId, sortOrder, createdAt)
			SELECT id, name, slug, color, icon, parentId, sortOrder, createdAt FROM categories
		`;
		yield* sql`DROP TABLE categories`;
		yield* sql`ALTER TABLE categories_new RENAME TO categories`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_parentId ON categories(parentId)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_sortOrder ON categories(sortOrder)`;

		// 2. Every leaf — a row no other row names as its parent — starts
		//    inheriting. Folders keep the colour they chose, and are now the only
		//    rows that store one.
		yield* sql`
			UPDATE categories SET color = NULL
			WHERE id NOT IN (SELECT parentId FROM categories WHERE parentId IS NOT NULL)
		`;

		// 3. Reinterpret the icon column: emoji in, Lucide id out.
		for (const [emoji, lucide] of ICON_TRANSLATION) {
			yield* sql`UPDATE categories SET icon = ${lucide} WHERE icon = ${emoji}`;
		}
	}),
);
