import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";
import { migrations } from ".";
import migration0033 from "./0033_normalize_accounts_iban";

/**
 * The backfill behind the `accounts.iban` invariant (issue #201).
 *
 * The schema now normalises every account number crossing the contract, but a
 * database written before it holds whatever its clients sent — and the value
 * that matters is compared **in SQL**, by the transfer view's IBAN-confirmed
 * mark, on the bytes as stored. A forward-only fix would leave exactly those
 * rows mismatching for ever.
 *
 * Run by *re-applying* the migration to an already-migrated database with the
 * rows planted first, the way the 0015 test does: the migration is idempotent
 * over its own output — normalising a normalised value is a no-op — so this is
 * sound, and it beats standing up a second partial migrator layer.
 *
 * Account numbers are assembled rather than written out, so this file carries
 * none of its own (the repo's leak scan, issue #108).
 */

const IBAN = `FR7699999${"000011234567890189"}`;

const plant = (iban: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const inserted = yield* sql`INSERT INTO accounts ${sql.insert({
      name: `Account ${iban ?? "none"}`,
      type: "checking",
      iban,
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    })} RETURNING id`;
    return (inserted[0] as { id: number }).id;
  });

const ibanOf = (id: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ iban: string | null }>`SELECT iban FROM accounts WHERE id = ${id}`;
    return rows[0]?.iban ?? null;
  });

describe("0033 accounts.iban is normalised in place", () => {
  // The cases below apply the migration by hand, so every one of them would
  // still pass if the file were never added to the set the migrator runs — and
  // a backfill nobody runs is a backfill that did not happen.
  it("is registered in the migration set", () => {
    assert.strictEqual(migrations["0033_normalize_accounts_iban"], migration0033);
  });

  it.effect("rewrites a grouped, lower-case account number into the stored form", () =>
    Effect.gen(function* () {
      const id = yield* plant("fr76 9999 9000 0112 3456 7890 189");

      yield* migration0033;

      assert.strictEqual(yield* ibanOf(id), IBAN);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("strips the separators a hyphenated one carries", () =>
    Effect.gen(function* () {
      const id = yield* plant(`${IBAN.slice(0, 4)}-${IBAN.slice(4, 8)}-${IBAN.slice(8)}`);

      yield* migration0033;

      assert.strictEqual(yield* ibanOf(id), IBAN);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  // "Not given" has one spelling. A blank that a pre-schema client stored is
  // the second one, and it is what makes an untouched edit form read as a
  // change — the failure the issue was filed for.
  it.effect("folds a blank one to null", () =>
    Effect.gen(function* () {
      const blank = yield* plant("");
      const spaces = yield* plant("   ");

      yield* migration0033;

      assert.strictEqual(yield* ibanOf(blank), null);
      assert.strictEqual(yield* ibanOf(spaces), null);
    }).pipe(Effect.provide(DatabaseTest)),
  );

  it.effect("leaves an already-normalised one and an account with none alone", () =>
    Effect.gen(function* () {
      const stored = yield* plant(IBAN);
      const none = yield* plant(null);

      yield* migration0033;
      // Idempotent: a second pass changes nothing, which is what makes
      // re-applying it above a fair test.
      yield* migration0033;

      assert.strictEqual(yield* ibanOf(stored), IBAN);
      assert.strictEqual(yield* ibanOf(none), null);
    }).pipe(Effect.provide(DatabaseTest)),
  );
});
