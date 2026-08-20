import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * The `transactions.rawSource` column (migration 0030).
 *
 * Two claims worth pinning, on the same grounds as the `accounts.iban` test
 * beside it (migration 0029). The column is **nullable with no default and no
 * backfill**, so a row written without an archive reads back null — every row
 * imported before this migration is one of those, permanently, and the contract
 * leans on null meaning *no original row was kept* rather than *an empty one
 * was*. And the column round-trips a **JSON object** unchanged: it is TEXT
 * holding JSON (the storage pattern `anomalyFlags` set), so what goes in has to
 * come back out byte-for-byte for the archive to be worth keeping.
 */
describe("0030 transactions.rawSource", () => {
  it.effect("defaults to null and round-trips a JSON object", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO transactions (accountId, date, amount, rawIssuerString, importedAt, importMonth) VALUES (1, '2026-01-01', -10, 'NO ARCHIVE', '2026-01-01', '2026-01')`;

      const [bare] = yield* sql<{
        rawSource: string | null;
      }>`SELECT rawSource FROM transactions WHERE rawIssuerString = 'NO ARCHIVE'`;

      assert.strictEqual(bare?.rawSource, null);

      // A Green-Got row's shape: the bank's own column names, French and all,
      // mapped and unmapped columns side by side. The account number is
      // assembled rather than written out, so this file carries no matchable
      // one (the repo's leak scan, issue #108).
      const archive = {
        "N° transaction": "000000000000000000000042",
        Statut: "COMPLETE",
        Intitulé: "SOCIETE EXEMPLE SARL",
        "IBAN du tiers": `FR7699999${"0".repeat(18)}`,
        "Moyen de paiement": "SEPA",
        Catégorie: "INCOME",
      };

      yield* sql`INSERT INTO transactions (accountId, date, amount, rawIssuerString, rawSource, importedAt, importMonth) VALUES (1, '2026-01-02', 500, 'ARCHIVED', ${JSON.stringify(archive)}, '2026-01-02', '2026-01')`;

      const [stored] = yield* sql<{
        rawSource: string | null;
      }>`SELECT rawSource FROM transactions WHERE rawIssuerString = 'ARCHIVED'`;

      assert.deepStrictEqual(JSON.parse(stored?.rawSource ?? "null"), archive);
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
