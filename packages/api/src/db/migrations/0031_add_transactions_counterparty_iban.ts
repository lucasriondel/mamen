import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `transactions.counterpartyIban` (issue #178, ADR 0012) — the
 * **counterparty IBAN**: the IBAN of *the other party* to the transaction,
 * promoted out of the **raw source** (migration 0030) into a column of its own.
 *
 * Direction-agnostic, following **Issuer**: on a debit it is who was paid, on a
 * credit it is who paid. It is promoted rather than left in the archive because
 * a matcher cannot reach inside an opaque JSON bin — the transfer-candidate
 * query has to *join* this against `accounts.iban`, and that is precisely the
 * bar ADR 0012 sets for earning a column.
 *
 * `TEXT` nullable with no default and **no backfill**. Null is the ordinary
 * case here rather than the leftover one: only SEPA and direct-debit rows carry
 * an IBAN at all, so a card row's null is the correct answer and not a gap —
 * which is also why an empty string must never be stored, since "not given" and
 * "given blank" are one fact and need one spelling.
 *
 * The stored value is **normalised** at the import edge — upper-case, spaces
 * stripped — identically to `accounts.iban` (migration 0029), because the two
 * exist to be joined and a bank that prints its IBANs in groups of four would
 * otherwise fail that join. Shape-checked only, never validated against a
 * country register: a statement from a bank the app has never seen must still
 * import. The raw delivered form stays in the archive, and the two are allowed
 * to disagree — the column is for matching, the archive is for provenance.
 *
 * No index and no uniqueness: the join lands with the mark (#179) and is a scan
 * over a candidate set of a handful of rows, while two transactions naming the
 * same counterparty is the normal state of a recurring direct debit.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE transactions ADD COLUMN counterpartyIban TEXT`.pipe(Effect.asVoid),
);
