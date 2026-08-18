import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `transactions.notes` column (issue #38) — a nullable free-text note
 * the user records against a single transaction. No default (absent → SQL
 * `NULL` → wire `notes` absent, folded like `duplicateNote`), and no index:
 * it is neither filtered nor ordered here (text search over it is #40's job).
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE transactions ADD COLUMN notes TEXT`.pipe(Effect.asVoid),
);
