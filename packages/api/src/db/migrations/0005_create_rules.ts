import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `rules` table and its lookup indexes. Ported verbatim from the old
 * server's initial schema (`001-initial-schema.ts`) — `issuerId` NOT NULL,
 * `pattern` TEXT NOT NULL, nullable `categoryOverride` (an INTEGER category id
 * despite the name), `matchCount` INTEGER default 0, TEXT ISO-8601 `createdAt`.
 * No DB-level foreign keys or uniqueness.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`
			CREATE TABLE IF NOT EXISTS rules (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				issuerId INTEGER NOT NULL,
				pattern TEXT NOT NULL,
				categoryOverride INTEGER,
				matchCount INTEGER NOT NULL DEFAULT 0,
				createdAt TEXT NOT NULL
			)
		`,
		sql`CREATE INDEX IF NOT EXISTS idx_rules_issuerId ON rules(issuerId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern)`,
	]).pipe(Effect.asVoid),
);
