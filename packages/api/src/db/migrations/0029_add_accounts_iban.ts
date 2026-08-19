import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `accounts.iban` — the account's IBAN, entered when the account is created
 * and editable from its card.
 *
 * `TEXT` nullable with no default, so nothing is backfilled: an account without
 * an IBAN is the normal resting state, not a half-filled row. Null means *not
 * given* here, unlike `color` (migration 0022) where null means *auto* — there
 * is nothing to derive an IBAN from, so the UI simply omits the line.
 *
 * The stored value is normalised at the edge (upper-case, spaces stripped) and
 * only shape-checked, never validated against the country register: statements
 * from a bank the app has never seen must still be enterable, and a column that
 * refuses a real IBAN it does not recognise is worse than one that stores it.
 * sqlite has no CHECK worth writing for that anyway, and the contract types it
 * as a bare nullable string.
 *
 * No index and no uniqueness: the IBAN is display/reference data, never a filter
 * or join key, and two accounts legitimately share one (a joint account added
 * twice for two statement sources).
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE accounts ADD COLUMN iban TEXT`.pipe(Effect.asVoid),
);
