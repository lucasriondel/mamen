import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `issuers.notes` column — a nullable free-text note the user records
 * against an issuer (rather than against a single transaction, which is
 * `transactions.notes`, migration 0012). No default (absent → SQL `NULL` → wire
 * `notes` absent, folded like `imageUrl`), and no index: it is neither filtered
 * nor ordered on.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE issuers ADD COLUMN notes TEXT`.pipe(Effect.asVoid),
);
