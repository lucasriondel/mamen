import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `issuers` table and its lookup indexes. Ported from the old
 * server's initial schema (`001-initial-schema.ts`) with the later `imageUrl`
 * ALTER folded in — TEXT ISO-8601 `createdAt`/`firstSeen`, nullable
 * `defaultCategoryId` and `imageUrl`, no DB-level uniqueness on `name`.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all([
    sql`
			CREATE TABLE IF NOT EXISTS issuers (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				imageUrl TEXT,
				defaultCategoryId INTEGER,
				createdAt TEXT NOT NULL,
				firstSeen TEXT NOT NULL
			)
		`,
    sql`CREATE INDEX IF NOT EXISTS idx_issuers_name ON issuers(name)`,
    sql`CREATE INDEX IF NOT EXISTS idx_issuers_defaultCategoryId ON issuers(defaultCategoryId)`,
    sql`CREATE INDEX IF NOT EXISTS idx_issuers_firstSeen ON issuers(firstSeen)`,
  ]).pipe(Effect.asVoid),
);
