import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the two **bundle** columns to `transactions` (issue #68, epic #66):
 *
 * - `kind` — the discriminator that tells a real bank row (`'bank'`) from a
 *   synthetic **bundle parent** (`'bundle'`). `TEXT DEFAULT 'bank'`, so every
 *   pre-existing row reads as the bank row it is with nothing backfilled.
 * - `bundleId` — a nullable self-reference to the parent row standing for this
 *   one. `NULL` means the row belongs to no bundle, which is every row today.
 *
 * A bundle parent lives in this table rather than a table of its own precisely
 * so it sorts, pages, filters, searches and is edited through every surface a
 * transaction already has — the whole argument for the `kind` column.
 *
 * `bundleId` is indexed, unlike the recap-exclusion columns: it is read as a
 * plain equality (a parent listing its members) *and* as an `IS NULL` on every
 * unfiltered list — members drop out of the top level — so it is on the hot path
 * of the app's landing query. Mirrors `idx_tx_transferGroupId`, the other flat
 * FK-free grouping id.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all([
    sql`ALTER TABLE transactions ADD COLUMN kind TEXT DEFAULT 'bank'`,
    sql`ALTER TABLE transactions ADD COLUMN bundleId INTEGER`,
    sql`CREATE INDEX IF NOT EXISTS idx_tx_bundleId ON transactions(bundleId)`,
  ]).pipe(Effect.asVoid),
);
