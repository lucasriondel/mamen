import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { ColumnMapping } from "@mamen/shared/contract";
import { Effect, Schema } from "effect";
import { DatabaseTest } from "../test";
import { migrations } from ".";
import migration0034 from "./0034_statement_formats_label_columns";

/**
 * The widening behind the multi-column label (PRD #208).
 *
 * `mapping.rawIssuerString` was one column name and is now a list of them,
 * because banks split what a human reads as one label across several columns.
 * The value is JSON in TEXT, so the old shape does not fail at the column — it
 * fails at the row codec, on the *read*, which without this backfill turns every
 * format authored before the change into a 500 on the format picker.
 *
 * Run by re-applying the migration to an already-migrated database with the rows
 * planted first, the way the 0033 test does: it is idempotent over its own
 * output — a value already a list is left alone — so this is sound.
 */

const RULES = {
  sign: { strategy: "signed-column", amountColumn: "Montant" },
  dateOrder: "iso",
  decimalSeparator: "dot",
  filter: null,
};

const plant = (mapping: unknown) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const inserted = yield* sql`INSERT INTO statement_formats ${sql.insert({
      accountId: 1,
      name: "Planted",
      kind: "csv",
      declaredColumns: JSON.stringify(["Date", "Libellé", "Montant"]),
      mapping: JSON.stringify(mapping),
      rules: JSON.stringify(RULES),
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    })} RETURNING id`;
    return (inserted[0] as { id: number }).id;
  });

const mappingOf = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      mapping: string;
    }>`SELECT mapping FROM statement_formats WHERE id = ${id}`;
    return JSON.parse(rows[0]?.mapping ?? "null") as Record<string, unknown>;
  });

describe("0034 statement_formats label columns become a list", () => {
  // The cases below apply the migration by hand, so every one of them would
  // still pass if the file were never added to the set the migrator runs — and
  // a backfill nobody runs is a backfill that did not happen.
  it("is registered in the migration set", () => {
    assert.strictEqual(migrations["0034_statement_formats_label_columns"], migration0034);
  });

  it.effect("wraps a single column name in the list that now holds it", () =>
    Effect.gen(function* () {
      const id = yield* plant({
        date: "Date",
        rawIssuerString: "Libellé",
        counterpartyIban: null,
      });

      yield* migration0034;

      assert.deepStrictEqual((yield* mappingOf(id)).rawIssuerString, ["Libellé"]);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("leaves every other field of the mapping exactly as it was", () =>
    Effect.gen(function* () {
      const id = yield* plant({
        date: "Date",
        rawIssuerString: "Libellé",
        counterpartyIban: "IBAN du tiers",
      });

      yield* migration0034;

      const mapping = yield* mappingOf(id);
      assert.strictEqual(mapping.date, "Date");
      assert.strictEqual(mapping.counterpartyIban, "IBAN du tiers");
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("makes a row written before the list decode again", () =>
    Effect.gen(function* () {
      // The whole point: the old shape is what the row codec now refuses, and
      // this is the pass that makes those rows readable rather than a 500.
      const id = yield* plant({
        date: "Date",
        rawIssuerString: "Libellé",
        counterpartyIban: null,
      });

      yield* migration0034;

      const decoded = Schema.decodeUnknownSync(ColumnMapping)(yield* mappingOf(id));
      assert.deepStrictEqual(decoded.rawIssuerString, ["Libellé"]);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("leaves a row already holding a list alone, however many columns", () =>
    Effect.gen(function* () {
      const id = yield* plant({
        date: "Date",
        rawIssuerString: ["Payee", "Memo"],
        counterpartyIban: null,
      });

      yield* migration0034;
      // Idempotent: a second pass changes nothing, which is what makes
      // re-applying it above a fair test.
      yield* migration0034;

      assert.deepStrictEqual((yield* mappingOf(id)).rawIssuerString, ["Payee", "Memo"]);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("folds a blank column name to the empty list", () =>
    Effect.gen(function* () {
      const id = yield* plant({ date: "Date", rawIssuerString: "", counterpartyIban: null });

      yield* migration0034;

      assert.deepStrictEqual((yield* mappingOf(id)).rawIssuerString, []);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("leaves an unreadable mapping untouched rather than failing startup", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const inserted = yield* sql`INSERT INTO statement_formats ${sql.insert({
        accountId: 1,
        name: "Broken",
        kind: "csv",
        declaredColumns: JSON.stringify(["Date"]),
        mapping: "not json at all",
        rules: JSON.stringify(RULES),
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      })} RETURNING id`;
      const id = (inserted[0] as { id: number }).id;

      // A migration is not the place to discover an unreadable row, and failing
      // here would take the whole startup down over one of them.
      yield* migration0034;

      const rows = yield* sql<{
        mapping: string;
      }>`SELECT mapping FROM statement_formats WHERE id = ${id}`;
      assert.strictEqual(rows[0]?.mapping, "not json at all");
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
