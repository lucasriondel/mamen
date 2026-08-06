import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates `transfer_dismissals` (issue #91) — the **dismissed pair** table: a
 * (debit, credit) pairing the user has explicitly refused as an internal
 * transfer, so detection never offers it again.
 *
 * This is the *only* thing issue #91 stores. Detection stays a live server-side
 * query recomputed on every read: a materialised candidate goes stale the moment
 * either leg is hand-linked, deleted, marked a refund or bundled, and would need
 * a backfill for every row predating the feature. The user's **refusal** has
 * none of those problems — it is a decision, not a derivation.
 *
 * Keyed on the ordered pair rather than on a leg. A leg-keyed "never a transfer"
 * flag is too blunt: one salary credit can legitimately pair with a real
 * transfer *and* with a coincidence, and refusing the coincidence must not
 * silently refuse the transfer. `PRIMARY KEY (debitId, creditId)` therefore
 * doubles as the idempotence guarantee — dismissing a stored pair again writes
 * nothing (`INSERT OR IGNORE`).
 *
 * The columns carry **no FK constraint**, consistent with every other row
 * reference in this schema (`transferGroupId`, `bundleId`, `linkedRefundId`,
 * `transactions.accountId`) — and consistently with `PRAGMA foreign_keys`, which
 * this app never turns on, so a declared `ON DELETE CASCADE` would be inert
 * decoration. The cascade is real but explicit: deleting a transaction deletes
 * the dismissals naming it, in the shared post-delete cleanup every delete path
 * goes through, beside the transfer-group and bundle cleanups it already runs.
 *
 * The composite primary key already indexes the debit side (the join's driving
 * column); `idx_transfer_dismissals_creditId` covers the credit side, which the
 * delete cascade looks rows up by.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all(
		[
			sql`CREATE TABLE IF NOT EXISTS transfer_dismissals (
					debitId INTEGER NOT NULL,
					creditId INTEGER NOT NULL,
					dismissedAt TEXT NOT NULL,
					PRIMARY KEY (debitId, creditId)
				)`,
			sql`CREATE INDEX IF NOT EXISTS idx_transfer_dismissals_creditId ON transfer_dismissals(creditId)`,
		],
		{ discard: true },
	).pipe(Effect.asVoid),
);
