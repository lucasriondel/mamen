import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `rules.matchAccountId` and `rules.matchSign` columns (issue #90) —
 * the optional **Account matcher** and **Sign matcher** (ADR 0009). Both are
 * nullable with no default and no backfill, exactly as `matchValue` was at
 * #42/ADR 0004: every pre-existing rule reads as carrying neither predicate
 * (absent → SQL `NULL` → the wire field absent), so the upgrade is invisible
 * until a user opts in.
 *
 * `matchAccountId` carries **no FK constraint**, consistent with
 * `transactions.accountId` (`NOT NULL`, no `REFERENCES`). The cascade — deleting
 * an account deletes the rules scoped to it — is enforced in the delete path,
 * not by the database.
 *
 * `matchSign` stores the two-valued enum as TEXT (`'positive'` / `'negative'`);
 * the rule row codec is what constrains it, since sqlite has no enum type. No
 * index on either: neither is filtered nor ordered in SQL — the match runs in JS.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all(
    [
      sql`ALTER TABLE rules ADD COLUMN matchAccountId INTEGER`,
      sql`ALTER TABLE rules ADD COLUMN matchSign TEXT`,
    ],
    { discard: true },
  ).pipe(Effect.asVoid),
);
