import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Drops the two vestigial category columns from `transactions` (categories
 * prefactor, PRD #19 / issue #20). `categoryOverride` (free-text TEXT) was never
 * read by any derivation — the real **Category override** mechanism is
 * `manualCategory` + `categoryId` — and its name collides with the categories
 * work in a way that would silently mislead a future writer. `subcategoryId`
 * (INTEGER) is a second category pointer from a model that predates `parentId`;
 * it would fight the two-level tree. Both are null on every live row, so the
 * drop is free and preserves nothing.
 *
 * `subcategoryId` carries an index (`idx_tx_subcategoryId` from 0004), and
 * SQLite refuses to `DROP COLUMN` a column referenced by an index — so the index
 * is dropped first. `categoryOverride` has no index (mirrors 0008's rules drop).
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`DROP INDEX IF EXISTS idx_tx_subcategoryId`,
		sql`ALTER TABLE transactions DROP COLUMN subcategoryId`,
		sql`ALTER TABLE transactions DROP COLUMN categoryOverride`,
	]).pipe(Effect.asVoid),
);
