import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `subscriptions` table and its lookup indexes. Ported verbatim from
 * the old server's initial schema (`001-initial-schema.ts`) — `issuerId` /
 * `issuerName` NOT NULL, `typicalAmount` REAL, `frequency` / `status` TEXT
 * (`status` defaults `'active'`), `transactionIds` a JSON TEXT array (default
 * `'[]'`), all four date columns TEXT (faithful: strings, not upgraded to dates).
 * No DB-level foreign keys or uniqueness.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all([
    sql`
			CREATE TABLE IF NOT EXISTS subscriptions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				issuerId INTEGER NOT NULL,
				issuerName TEXT NOT NULL,
				typicalAmount REAL NOT NULL,
				frequency TEXT NOT NULL,
				intervalDays INTEGER NOT NULL,
				lastChargeDate TEXT NOT NULL,
				firstChargeDate TEXT NOT NULL,
				chargeCount INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'active',
				transactionIds TEXT NOT NULL DEFAULT '[]',
				detectedAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`,
    sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_issuerId ON subscriptions(issuerId)`,
    sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`,
  ]).pipe(Effect.asVoid),
);
