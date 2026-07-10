import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `categories` table and its lookup indexes. Ported verbatim from
 * the old server's initial schema (`001-initial-schema.ts`) — TEXT ISO-8601
 * `createdAt`, nullable `parentId` (null = root), `sortOrder` defaulting to 0,
 * no DB-level uniqueness on `slug`.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`
			CREATE TABLE IF NOT EXISTS categories (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				slug TEXT NOT NULL,
				color TEXT NOT NULL,
				icon TEXT NOT NULL,
				parentId INTEGER,
				sortOrder INTEGER NOT NULL DEFAULT 0,
				createdAt TEXT NOT NULL
			)
		`,
		sql`CREATE INDEX IF NOT EXISTS idx_categories_parentId ON categories(parentId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`,
		sql`CREATE INDEX IF NOT EXISTS idx_categories_sortOrder ON categories(sortOrder)`,
	]).pipe(Effect.asVoid),
);
