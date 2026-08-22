import { SqlClient } from "@effect/sql";
import { normalizeIban } from "@mamen/shared/contract";
import { Effect } from "effect";

/**
 * Normalises `accounts.iban` in place (issue #201) — the backfill that makes the
 * column's long-standing claim true of rows written before anything enforced it.
 *
 * `accounts.iban` has been documented as stored upper-case with no spaces since
 * migration 0029, but until the contract carried a schema for it (`StoredIban`)
 * the only thing that made it so was the web client normalising at submit. Any
 * other writer — a curl, an SDK script, an importer — stored the value as typed,
 * and the comparison that matters happens **in SQL**: the transfer view's
 * **IBAN-confirmed** mark joins `transactions.counterpartyIban` against this
 * column, so a grouped account number there is a mark that never fires. Fixing
 * the schema alone would leave those rows wrong for ever.
 *
 * A **data migration, not a constraint.** SQLite cannot express "upper-case with
 * no spaces" as a CHECK worth having, and a constraint would refuse the write
 * rather than converge it — which is the opposite of what the contract chose.
 * The schema is the enforcement; this is the one-off catch-up.
 *
 * Written in TypeScript over {@link normalizeIban} rather than as
 * `UPPER(REPLACE(…))`, so the stored form has exactly one definition and this
 * cannot drift from it — `\s` covers separators no readable SQL expression
 * would. Accounts are a handful of rows, so a row-at-a-time rewrite costs
 * nothing, and only the rows that actually change are written.
 *
 * A blank folds to `NULL`: "not given" gets one spelling, the same rule
 * migration 0031 states for `counterpartyIban`. Idempotent over its own output,
 * which is what lets its test re-apply it to a migrated database.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{
    id: number;
    iban: string | null;
  }>`SELECT id, iban FROM accounts WHERE iban IS NOT NULL`;

  for (const row of rows) {
    const normalized = normalizeIban(row.iban ?? "");
    const stored = normalized.length === 0 ? null : normalized;
    if (stored === row.iban) continue;

    yield* sql`UPDATE accounts SET iban = ${stored} WHERE id = ${row.id}`;
  }
});
