import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `accounts` table and its lookup indexes. Ported verbatim from the
 * old server's initial schema (`001-initial-schema.ts`) — TEXT ISO-8601
 * timestamps, no DB-level uniqueness. Later resource ports add their own
 * numbered migration file.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`
			CREATE TABLE IF NOT EXISTS accounts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				type TEXT NOT NULL DEFAULT 'checking',
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`,
		sql`CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name)`,
		sql`CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type)`,
		sql`CREATE INDEX IF NOT EXISTS idx_accounts_createdAt ON accounts(createdAt)`,
	]).pipe(Effect.asVoid),
);
