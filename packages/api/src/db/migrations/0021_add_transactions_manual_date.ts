import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `manualDate` to `transactions` (issue #72, epic #66) — the flag that says
 * a row's `date` is the **user's**, not a derived default, exactly as
 * `manualCategory` says it of `categoryId` and `manualExcluded` of
 * `excludedFromRecap`.
 *
 * Only a **bundle parent** has a derivable date: it defaults to its earliest
 * member's, and overriding it must survive every later membership change (#74),
 * which is a distinction storage has to hold. A bank row's date is the bank's,
 * so the column stays 0 there and nothing reads it.
 *
 * `INTEGER DEFAULT 0` — nothing is backfilled and no re-derivation pass runs:
 * every existing row's date is exactly the one it already had, derived or not,
 * and reads as the un-overridden default it is.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE transactions ADD COLUMN manualDate INTEGER DEFAULT 0`.pipe(Effect.asVoid),
);
