import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `idx_tx_account_date` — the index the **month filter** rides now that it
 * buckets a row by its own `date` rather than by the `importMonth` it was
 * stamped with (issue #87).
 *
 * The equivalent of `idx_tx_account_month` (migration 0004) one column over: the
 * filter emits `accountId = ? AND date >= ? AND date < ?`, which the month index
 * cannot serve at all and which `idx_tx_date` serves only after the account has
 * been narrowed by a separate index. The account leads because it is the
 * equality term — sqlite can use a composite index up to and including its first
 * inequality, so `(accountId, date)` covers both halves and the reverse would
 * cover only one.
 *
 * `idx_tx_account_month` stays: `importMonth` is still what the bundle-impact
 * route asks about — a *statement*, not a month of spending. The delete-by-month
 * route that was its other reader is gone (issue #88), an import having stopped
 * replacing the month it writes into.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	sql`CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(accountId, date)`.pipe(
		Effect.asVoid,
	),
);
