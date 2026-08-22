import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { AccountId, NotFound } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { AccountRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `AccountRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
// `provideMerge` rather than `provide` so the SqlClient stays reachable: the
// IBAN cases below assert on the *stored bytes*, which is where the join that
// invariant exists for actually happens.
const RepoTest = AccountRepo.Default.pipe(Layer.provideMerge(DatabaseTest));

const asId = Schema.decodeSync(AccountId);

describe("AccountRepo", () => {
  it.effect("create assigns an id and timestamps, then findById returns it", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking" });
      assert.strictEqual(created.name, "Main");
      assert.ok(created.id > 0);
      assert.strictEqual(created.createdAt.getTime(), created.updatedAt.getTime());

      const fetched = yield* repo.getById(created.id);
      assert.deepStrictEqual(fetched, created);
    }).pipe(Effect.provide(RepoTest)),
  );

  // A synthetic IBAN, assembled rather than written out, so this file carries no
  // matchable account number of its own (the repo's leak scan, issue #108).
  const IBAN = `FR7699999${"000011234567890189"}`;

  it.effect("create stores an omitted IBAN as null, not absent", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking" });

      // Null is the contract's "not given" — an account with no IBAN on file,
      // distinct from an empty string nobody chose to enter.
      assert.strictEqual(created.iban, null);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("create round-trips an IBAN", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking", iban: IBAN });
      assert.strictEqual(created.iban, IBAN);

      const fetched = yield* repo.getById(created.id);
      assert.strictEqual(fetched.iban, IBAN);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The same account number as the bank prints it: grouped in fours and, since
  // it was copied out of a web page, lower-case. Nothing about the *value*
  // differs from `IBAN` above — only its spelling.
  const GROUPED = "fr76 9999 9000 0112 3456 7890 189";

  /** The `iban` column of the one account in the DB, as stored. */
  const storedIban = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ iban: string | null }>`SELECT iban FROM accounts`;
    return rows[0]?.iban ?? null;
  });

  // The invariant the contract has always claimed, now enforced by the schema
  // rather than by whichever client remembered to normalise (issue #201). The
  // repository is exactly the caller that never did: it is reached by the
  // handler with an already-decoded payload, but nothing stops a script or a
  // seeder from calling it directly.
  //
  // Asserted on the column, not on the returned account: the **IBAN-confirmed**
  // mark joins `transactions.counterpartyIban` against `accounts.iban` in SQL,
  // so a value that only reads back normalised is a value that still misses.
  it.effect("create stores an IBAN in the normalised form, whoever spelt it", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking", iban: GROUPED });

      assert.strictEqual(created.iban, IBAN);
      assert.strictEqual(yield* storedIban, IBAN);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update stores an IBAN in the normalised form too", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking" });

      const set = yield* repo.update(created.id, { iban: GROUPED });
      assert.strictEqual(set.iban, IBAN);
      assert.strictEqual(yield* storedIban, IBAN);
    }).pipe(Effect.provide(RepoTest)),
  );

  // "Not given" has one spelling — null — so an empty string never reaches the
  // column. Two spellings of nothing is what makes an untouched edit form read
  // as a change and spend a write.
  it.effect("create folds a blank IBAN to null rather than storing an empty string", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking", iban: "" });

      assert.strictEqual(created.iban, null);
      assert.strictEqual(yield* storedIban, null);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The update is a partial, so an IBAN must be settable, changeable, and
  // *clearable* — the last one is the case a naive `?? current` would drop on
  // the floor, leaving a stale account number the user believes they deleted.
  it.effect("update sets, changes and clears the IBAN", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking" });

      const set = yield* repo.update(created.id, { iban: IBAN });
      assert.strictEqual(set.iban, IBAN);

      const cleared = yield* repo.update(created.id, { iban: null });
      assert.strictEqual(cleared.iban, null);
    }).pipe(Effect.provide(RepoTest)),
  );

  // An update that says nothing about the IBAN must not erase it: a rename is
  // the common partial write, and it travels without an `iban` key.
  it.effect("update leaves an untouched IBAN alone", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Main", type: "checking", iban: IBAN });

      const renamed = yield* repo.update(created.id, { name: "Renamed" });
      assert.strictEqual(renamed.name, "Renamed");
      assert.strictEqual(renamed.iban, IBAN);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list returns items and the full count", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      yield* repo.create({ name: "A", type: "checking" });
      yield* repo.create({ name: "B", type: "savings" });

      const page = yield* repo.list(50, 0);
      assert.strictEqual(page.total, 2);
      assert.strictEqual(page.items.length, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list honors limit/offset while total stays the full set", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      yield* repo.create({ name: "A", type: "checking" });
      yield* repo.create({ name: "B", type: "savings" });
      yield* repo.create({ name: "C", type: "other" });

      const page = yield* repo.list(1, 1);
      assert.strictEqual(page.total, 3);
      assert.deepStrictEqual(
        page.items.map((a) => a.name),
        ["B"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getByName returns the matching account", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      yield* repo.create({ name: "Wallet", type: "other" });
      const found = yield* repo.getByName("Wallet");
      assert.strictEqual(found.name, "Wallet");
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update merges the partial and preserves createdAt", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const created = yield* repo.create({ name: "Old", type: "checking" });
      const updated = yield* repo.update(created.id, { type: "savings" });
      assert.strictEqual(updated.name, "Old");
      assert.strictEqual(updated.type, "savings");
      assert.strictEqual(updated.createdAt.getTime(), created.createdAt.getTime());
    }).pipe(Effect.provide(RepoTest)),
  );

  // The delete is not on this repository: it cascades into the Matching Rules
  // scoped to the account and re-derives the rows they won, so it lives on the
  // `IssuerMatcher` (issue #90). Both halves — the row going, and the 404 on a
  // missing id — are covered end-to-end in `accounts/handlers.test.ts`.

  it.effect("getById fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* AccountRepo;
      const error = yield* repo.update(asId(404), { name: "X" }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );
});
