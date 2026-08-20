import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * The `transactions.counterpartyIban` column (migration 0031).
 *
 * The claim worth pinning is the same one the `accounts.iban` test beside it
 * pins (migration 0029), and for a sharper reason here: the column is
 * **nullable with no default and no backfill**, and null is the *common* case
 * rather than the leftover one — only SEPA and direct-debit rows carry an IBAN,
 * card rows carry none. A row written without one has to read back null and not
 * an empty string, because "the bank gave no IBAN" and "the bank gave a blank
 * one" are the same fact and must have one spelling.
 *
 * It round-trips the 34-character maximum for the reason 0029 gives: the
 * shortest IBAN is 15 and the longest is 34, and a column that truncated the
 * long end would corrupt exactly the accounts nobody thinks to check.
 */
describe("0031 transactions.counterpartyIban", () => {
  it.effect("defaults to null and round-trips a maximum-length IBAN", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO transactions (accountId, date, amount, rawIssuerString, importedAt, importMonth) VALUES (1, '2026-01-01', -8.76, 'CARD ROW', '2026-01-01', '2026-01')`;

      const [bare] = yield* sql<{
        counterpartyIban: string | null;
      }>`SELECT counterpartyIban FROM transactions WHERE rawIssuerString = 'CARD ROW'`;

      assert.strictEqual(bare?.counterpartyIban, null);

      // 34 characters — the longest IBAN issued — assembled rather than written
      // out, so this file carries no matchable account number of its own (the
      // repo's leak scan, issue #108).
      const longest = `MT84${"9".repeat(30)}`;
      assert.strictEqual(longest.length, 34);

      yield* sql`INSERT INTO transactions (accountId, date, amount, rawIssuerString, counterpartyIban, importedAt, importMonth) VALUES (1, '2026-01-02', 500, 'SEPA ROW', ${longest}, '2026-01-02', '2026-01')`;

      const [stored] = yield* sql<{
        counterpartyIban: string | null;
      }>`SELECT counterpartyIban FROM transactions WHERE rawIssuerString = 'SEPA ROW'`;

      assert.strictEqual(stored?.counterpartyIban, longest);
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
