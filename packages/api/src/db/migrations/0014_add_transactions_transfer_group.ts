import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `transactions.transferGroupId` column (Internal transfers, PRD #48,
 * issue #49) — a nullable self-reference to a transaction id, carrying transfer-
 * group membership flat and FK-free (the schema has zero foreign keys). All legs
 * of one internal transfer share the smallest leg's id as their group id; a
 * `NULL` value means the row belongs to no transfer. This mirrors the existing
 * `linkedRefundId` flat nullable-self-reference precedent — same INTEGER column,
 * same lookup index (the detail page lists a group's other legs, and the filter
 * badges legs, by this id, so it must be indexed). No default → absent → `NULL`
 * on every pre-existing row.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`ALTER TABLE transactions ADD COLUMN transferGroupId INTEGER`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_transferGroupId ON transactions(transferGroupId)`,
	]).pipe(Effect.asVoid),
);
