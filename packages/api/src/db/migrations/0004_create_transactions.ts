import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the `transactions` table and its lookup indexes. Ported verbatim from
 * the old server's initial schema (`001-initial-schema.ts`) — TEXT ISO-8601
 * `date`/`importedAt`, REAL `amount`, nullable FK columns, `INTEGER` 0/1 boolean
 * columns (`manualCategory`/`isRefund`/`isDuplicateExcluded`, default 0), the
 * `anomalyFlags` array stored JSON-encoded in one TEXT column, and `importMonth`
 * kept as a `"YYYY-MM"` string. No DB-level foreign keys or uniqueness.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`
			CREATE TABLE IF NOT EXISTS transactions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				accountId INTEGER NOT NULL,
				date TEXT NOT NULL,
				amount REAL NOT NULL,
				rawIssuerString TEXT NOT NULL,
				issuerId INTEGER,
				categoryId INTEGER,
				subcategoryId INTEGER,
				categoryOverride TEXT,
				manualCategory INTEGER DEFAULT 0,
				isRefund INTEGER DEFAULT 0,
				linkedRefundId INTEGER,
				anomalyFlags TEXT,
				isDuplicateExcluded INTEGER DEFAULT 0,
				duplicateNote TEXT,
				importedAt TEXT NOT NULL,
				importMonth TEXT NOT NULL,
				importBatchId TEXT
			)
		`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_accountId ON transactions(accountId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_amount ON transactions(amount)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_issuerId ON transactions(issuerId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_categoryId ON transactions(categoryId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_subcategoryId ON transactions(subcategoryId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_manualCategory ON transactions(manualCategory)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_linkedRefundId ON transactions(linkedRefundId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_importMonth ON transactions(importMonth)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_importBatchId ON transactions(importBatchId)`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_account_month ON transactions(accountId, importMonth)`,
	]).pipe(Effect.asVoid),
);
