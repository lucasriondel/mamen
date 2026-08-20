import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * The `statement_formats` table (migration 0032).
 *
 * The claim worth pinning is the one the column types cannot state: the nested
 * **mapping** and **value rules** are JSON in TEXT, so sqlite stores them as
 * opaque strings and the round trip is the *only* thing standing between a
 * stored format and a wizard that reads back a different bank's rules. Pinned
 * here on the same grounds as the accounts IBAN migration's test — the storage
 * shape is the claim, and it is cheapest to state against the raw table before
 * a codec is in the way.
 */
describe("0032 statement_formats", () => {
  const mapping = JSON.stringify({
    date: "Date",
    rawIssuerString: "Intitulé",
    counterpartyIban: "IBAN du tiers",
  });

  const rules = JSON.stringify({
    sign: {
      strategy: "direction-column",
      amountColumn: "Montant",
      directionColumn: "Direction",
      debitValue: "DEBIT",
    },
    dateOrder: "iso",
    decimalSeparator: "dot",
    filter: { column: "Statut", equals: "COMPLETE" },
  });

  it.effect("round-trips the JSON-held mapping and rules verbatim", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO statement_formats (accountId, name, kind, declaredColumns, mapping, rules, createdAt, updatedAt)
				VALUES (1, 'Green-Got', 'csv', ${JSON.stringify(["Statut", "Date", "Montant"])}, ${mapping}, ${rules}, '2026-08-20', '2026-08-20')`;

      const [stored] = yield* sql<{
        id: number;
        declaredColumns: string;
        mapping: string;
        rules: string;
      }>`SELECT id, declaredColumns, mapping, rules FROM statement_formats`;

      // Byte-identical, not merely equivalent: nothing between the writer and
      // the reader is allowed to reformat, reorder or re-encode the blob.
      assert.strictEqual(stored?.mapping, mapping);
      assert.strictEqual(stored?.rules, rules);
      assert.deepStrictEqual(JSON.parse(stored?.declaredColumns ?? "null"), [
        "Statut",
        "Date",
        "Montant",
      ]);
      // AUTOINCREMENT, like every other id in this schema.
      assert.ok((stored?.id ?? 0) > 0);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("holds both kinds against the same account", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const columns = JSON.stringify(["Date", "Libellé", "Débit", "Crédit"]);

      yield* sql`INSERT INTO statement_formats (accountId, name, kind, declaredColumns, mapping, rules, createdAt, updatedAt)
				VALUES (1, 'Green-Got CSV', 'csv', ${columns}, ${mapping}, ${rules}, '2026-08-20', '2026-08-20')`;
      yield* sql`INSERT INTO statement_formats (accountId, name, kind, declaredColumns, mapping, rules, createdAt, updatedAt)
				VALUES (1, 'Green-Got PDF', 'pdf', ${columns}, ${mapping}, ${rules}, '2026-08-20', '2026-08-20')`;

      const rows = yield* sql<{
        kind: string;
      }>`SELECT kind FROM statement_formats WHERE accountId = 1 ORDER BY id`;

      // No uniqueness on (accountId, kind) or on the name: a bank publishing
      // both a CSV and a PDF export is the ordinary case, and a bank that
      // changes its export earns a *second* format rather than an edit.
      assert.deepStrictEqual(
        rows.map((r) => r.kind),
        ["csv", "pdf"],
      );
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
