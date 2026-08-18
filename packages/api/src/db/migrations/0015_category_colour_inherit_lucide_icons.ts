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
 * On the way across, every row whose stored colour is a *copy* rather than a
 * choice starts inheriting. Two shapes qualify, and the predicate names both
 * rather than proxying them by position in the tree:
 *
 * - the colour equals its parent's — what the seed wrote onto every leaf, and
 *   what a re-parented leaf still carries from the folder it came from;
 * - the colour is the old hardcoded `#94a3b8` that `use-category-mutations`
 *   stamped onto every user-created category, which was never a choice either
 *   (it is the live bug ADR 0006 names) and which now resolves to the identical
 *   neutral constant when inherited.
 *
 * Deliberately *not* "null every childless row". Childlessness is the
 * folder/leaf test (ADR 0003), not a test for copied data, and using it here
 * gets both ends wrong: a seeded folder whose children were all deleted or moved
 * away would lose the brand colour it genuinely chose, while an intermediate
 * folder — a user-created node with children under it, holding the grey — would
 * *keep* its copy and permanently block a recolour of the root above it from
 * reaching the subtree beneath it, which is the whole feature. Comparing the
 * value is the direct test, and it leaves a root's colour and any genuinely
 * distinct colour alone.
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
 * The grey `use-category-mutations` hardcoded onto every category created
 * through the UI, and the neutral constant an inheriting row now resolves to.
 * Nulling it is therefore invisible to a reader and un-blocks the subtree.
 */
const OLD_HARDCODED_GREY = "#94a3b8";

/**
 * Old emoji → Lucide icon id (kebab-case, Lucide's own canonical key — not the
 * PascalCase React export). Covers all 27 seeded rows (6 folders + 21 leaves)
 * plus `🏷️`, the default every category created through the UI carried.
 */
const ICON_TRANSLATION: ReadonlyArray<readonly [emoji: string, lucide: string]> = [
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
    // 1. Rebuild the table with a nullable `color`, carrying every row over —
    //    the colour of a row that only ever held a copy becoming NULL on the
    //    way — then restore the indexes the drop took with it.
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
    // The copy is also where a copied colour becomes an inherited one, so the
    // predicate reads the *old* table: both the row and its parent are still
    // pristine there. Doing it as an UPDATE afterwards would let a parent
    // already nulled by the same statement change what its child compares
    // against, making the result depend on row order.
    yield* sql`
			INSERT INTO categories_new (id, name, slug, color, icon, parentId, sortOrder, createdAt)
			SELECT
				id, name, slug,
				CASE
					WHEN color = ${OLD_HARDCODED_GREY} THEN NULL
					WHEN color = (SELECT p.color FROM categories p WHERE p.id = c.parentId) THEN NULL
					ELSE color
				END,
				icon, parentId, sortOrder, createdAt
			FROM categories c
		`;
    yield* sql`DROP TABLE categories`;
    yield* sql`ALTER TABLE categories_new RENAME TO categories`;
    yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_parentId ON categories(parentId)`;
    yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`;
    yield* sql`CREATE INDEX IF NOT EXISTS idx_categories_sortOrder ON categories(sortOrder)`;

    // 2. Reinterpret the icon column: emoji in, Lucide id out.
    for (const [emoji, lucide] of ICON_TRANSLATION) {
      yield* sql`UPDATE categories SET icon = ${lucide} WHERE icon = ${emoji}`;
    }
  }),
);
