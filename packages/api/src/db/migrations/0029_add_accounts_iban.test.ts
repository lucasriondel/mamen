import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * The `accounts.iban` column (migration 0029).
 *
 * Two claims worth pinning. The column is **nullable with no default**, so an
 * account created without an IBAN reads back null rather than an empty string —
 * the distinction the contract leans on, where null means *not given*. And it
 * accepts the full 34-character maximum, because the shortest IBAN is 15 and the
 * longest is 34 and a column that silently truncated the long end would corrupt
 * exactly the accounts nobody thinks to check.
 */
describe("0029 accounts.iban", () => {
  it.effect("defaults to null and round-trips a maximum-length IBAN", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO accounts (name, type, createdAt, updatedAt) VALUES ('No IBAN', 'checking', '2026-01-01', '2026-01-01')`;

      const [bare] = yield* sql<{
        iban: string | null;
      }>`SELECT iban FROM accounts WHERE name = 'No IBAN'`;

      assert.strictEqual(bare?.iban, null);

      // 34 characters — the longest IBAN issued — assembled rather than written
      // out, so this file carries no matchable account number of its own (see
      // the repo's leak scan, issue #108).
      const longest = `MT84${"9".repeat(30)}`;
      assert.strictEqual(longest.length, 34);

      yield* sql`INSERT INTO accounts (name, type, iban, createdAt, updatedAt) VALUES ('Maxed', 'checking', ${longest}, '2026-01-01', '2026-01-01')`;

      const [stored] = yield* sql<{
        iban: string | null;
      }>`SELECT iban FROM accounts WHERE name = 'Maxed'`;

      assert.strictEqual(stored?.iban, longest);
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
