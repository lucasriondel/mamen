import { assert, describe, it } from "@effect/vitest";
import { CategoryId, type IssuerCreate, IssuerId, NotFound } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { IssuerRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `IssuerRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = IssuerRepo.Default.pipe(Layer.provide(DatabaseTest));

const asId = Schema.decodeSync(IssuerId);

/** A fixed instant for `firstSeen` — deterministic across the suite. */
const FIRST_SEEN = new Date("2026-01-15T00:00:00.000Z");

/** A valid create payload; override any field per test. */
const make = (over: Partial<IssuerCreate> = {}): IssuerCreate => ({
  name: "Acme",
  firstSeen: FIRST_SEEN,
  ...over,
});

describe("IssuerRepo", () => {
  it.effect("create assigns an id + createdAt, keeps firstSeen, then getById returns it", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ name: "Coffee Co" }));
      assert.strictEqual(created.name, "Coffee Co");
      assert.ok(created.id > 0);
      assert.ok(created.createdAt instanceof Date);
      assert.strictEqual(created.firstSeen.getTime(), FIRST_SEEN.getTime());
      // Optional columns absent (not null) when unset.
      assert.strictEqual(created.imageUrl, undefined);
      assert.strictEqual(created.defaultCategoryId, undefined);

      const fetched = yield* repo.getById(created.id);
      assert.deepStrictEqual(fetched, created);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("create keeps optional imageUrl + defaultCategoryId", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(
        make({
          imageUrl: "/uploads/issuers/x.png",
          defaultCategoryId: Schema.decodeSync(CategoryId)(7),
        }),
      );
      assert.strictEqual(created.imageUrl, "/uploads/issuers/x.png");
      assert.strictEqual(created.defaultCategoryId, 7);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list returns items and the full count", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "a" }));
      yield* repo.create(make({ name: "b" }));

      const page = yield* repo.list({ limit: 50, offset: 0 });
      assert.strictEqual(page.total, 2);
      assert.strictEqual(page.items.length, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list honors limit/offset while total stays the full set", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "a" }));
      yield* repo.create(make({ name: "b" }));
      yield* repo.create(make({ name: "c" }));

      const page = yield* repo.list({ limit: 1, offset: 1 });
      assert.strictEqual(page.total, 3);
      assert.strictEqual(page.items.length, 1);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list orders by name (case-insensitive) when asked", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "banana" }));
      yield* repo.create(make({ name: "Apple" }));
      yield* repo.create(make({ name: "cherry" }));

      const page = yield* repo.list({ limit: 50, offset: 0, orderBy: "name" });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["Apple", "banana", "cherry"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list without orderBy keeps insertion order", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "zeta" }));
      yield* repo.create(make({ name: "alpha" }));

      const page = yield* repo.list({ limit: 50, offset: 0 });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["zeta", "alpha"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list narrows to a set of ids, and total counts only those", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const a = yield* repo.create(make({ name: "a" }));
      yield* repo.create(make({ name: "b" }));
      const c = yield* repo.create(make({ name: "c" }));

      const page = yield* repo.list({ limit: 50, offset: 0, id: [a.id, c.id] });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["a", "c"],
      );
      // `total` is the filtered count, not the table's row count.
      assert.strictEqual(page.total, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list accepts a lone id, not only a set", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "a" }));
      const b = yield* repo.create(make({ name: "b" }));

      const page = yield* repo.list({ limit: 50, offset: 0, id: b.id });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["b"],
      );
      assert.strictEqual(page.total, 1);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The bug this filter exists to kill: resolution used to read page 1 of the
  // whole table, so an issuer whose id sorts past that page came back missing
  // and every row pointing at it rendered *unresolved*. Asking by id must not
  // care where the id sorts.
  it.effect("list finds an id that sorts outside the first page", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "first" }));
      yield* repo.create(make({ name: "second" }));
      const last = yield* repo.create(make({ name: "newest" }));

      // A page of one, from the top of the id order — `last` is nowhere near it.
      const firstPage = yield* repo.list({ limit: 1, offset: 0 });
      assert.notStrictEqual(firstPage.items[0]?.id, last.id);

      const page = yield* repo.list({ limit: 1, offset: 0, id: [last.id] });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["newest"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  // An empty set is a real answer ("resolve nothing"), not a dropped filter —
  // falling through to the whole table would hand a caller every issuer at the
  // exact moment it asked for none.
  it.effect("list with an empty id set matches nothing", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "a" }));
      yield* repo.create(make({ name: "b" }));

      const page = yield* repo.list({ limit: 50, offset: 0, id: [] });
      assert.strictEqual(page.items.length, 0);
      assert.strictEqual(page.total, 0);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list ignores an id that no longer exists", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const a = yield* repo.create(make({ name: "a" }));

      const page = yield* repo.list({
        limit: 50,
        offset: 0,
        id: [a.id, asId(9999)],
      });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["a"],
      );
      assert.strictEqual(page.total, 1);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The picker read (#79): a picker offers a choice among issuers it never
  // holds all of, so it asks the server for the names matching what was typed.
  it.effect("list narrows to a case-insensitive name substring", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "MINT ENERGIE" }));
      yield* repo.create(make({ name: "Spotify" }));
      yield* repo.create(make({ name: "Mintaka" }));

      const page = yield* repo.list({ limit: 50, offset: 0, search: "mint" });
      assert.deepStrictEqual(page.items.map((m) => m.name).sort(), ["MINT ENERGIE", "Mintaka"]);
      // `total` describes the searched set, not the table.
      assert.strictEqual(page.total, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list treats LIKE metacharacters in the search as literals", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "100% Pure" }));
      yield* repo.create(make({ name: "Spotify" }));

      const page = yield* repo.list({ limit: 50, offset: 0, search: "0% P" });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["100% Pure"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list with a blank search returns the whole set", () =>
    Effect.gen(function* () {
      // An empty picker box asks for a page to browse, not for nothing — the
      // opposite of an empty `id` set, which asks to resolve nothing.
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "a" }));
      yield* repo.create(make({ name: "b" }));

      const page = yield* repo.list({ limit: 50, offset: 0, search: "  " });
      assert.strictEqual(page.total, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list ANDs the search with the id filter", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const mint = yield* repo.create(make({ name: "MINT ENERGIE" }));
      yield* repo.create(make({ name: "Mintaka" }));

      const page = yield* repo.list({
        limit: 50,
        offset: 0,
        id: [mint.id],
        search: "mint",
      });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["MINT ENERGIE"],
      );
      assert.strictEqual(page.total, 1);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The cliff this read exists to remove: a picker that paged the table saw
  // only the first N issuers, so a name past that page was unfindable however
  // precisely it was typed (#79).
  it.effect("list finds a name that sorts outside the first page", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      for (let i = 0; i < 20; i++) {
        yield* repo.create(make({ name: `filler ${i}` }));
      }
      yield* repo.create(make({ name: "Zephyr Energy" }));

      const firstPage = yield* repo.list({ limit: 5, offset: 0 });
      assert.ok(!firstPage.items.some((m) => m.name === "Zephyr Energy"));

      const page = yield* repo.list({ limit: 5, offset: 0, search: "zephyr" });
      assert.deepStrictEqual(
        page.items.map((m) => m.name),
        ["Zephyr Energy"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getByName matches exactly (case-sensitive)", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "Netflix" }));
      const found = yield* repo.getByName("Netflix");
      assert.strictEqual(found.name, "Netflix");

      // A different case is NOT an exact match.
      const error = yield* repo.getByName("netflix").pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: "netflix" }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getByNameCi matches case-insensitively", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      yield* repo.create(make({ name: "Netflix" }));
      const found = yield* repo.getByNameCi("NETFLIX");
      assert.strictEqual(found.name, "Netflix");
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update merges the partial and preserves createdAt", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ name: "Old" }));
      const updated = yield* repo.update(created.id, { name: "New" });
      assert.strictEqual(updated.name, "New");
      assert.strictEqual(updated.id, created.id);
      assert.strictEqual(updated.createdAt.getTime(), created.createdAt.getTime());
      assert.strictEqual(updated.firstSeen.getTime(), created.firstSeen.getTime());
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("create stores notes, then getById returns them", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ name: "Gym", notes: "Cancels in March" }));
      assert.strictEqual(created.notes, "Cancels in March");
      const found = yield* repo.getById(created.id);
      assert.strictEqual(found.notes, "Cancels in March");
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update sets notes on an issuer that had none", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make());
      assert.strictEqual(created.notes, undefined);
      const updated = yield* repo.update(created.id, {
        notes: "Shared with Ana",
      });
      assert.strictEqual(updated.notes, "Shared with Ana");
    }).pipe(Effect.provide(RepoTest)),
  );

  // The nullable-clear half of the contract: `null` erases, absent preserves.
  it.effect("update clears notes with null (back to absent)", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ notes: "Temporary" }));
      const cleared = yield* repo.update(created.id, { notes: null });
      assert.strictEqual(cleared.notes, undefined);
      const found = yield* repo.getById(created.id);
      assert.strictEqual(found.notes, undefined);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update leaves notes untouched when the field is absent", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ notes: "Keep me" }));
      const renamed = yield* repo.update(created.id, { name: "Renamed" });
      assert.strictEqual(renamed.name, "Renamed");
      assert.strictEqual(renamed.notes, "Keep me");
    }).pipe(Effect.provide(RepoTest)),
  );

  // --- Recap exclusion (issue #69, ADR 0008) ---------------------------------
  // The issuer-level default every non-manually-flagged transaction of this
  // issuer reads. Stored as a plain 0/1 column and folded like the transaction
  // flags: `1` → `true`, `0` → absent.

  it.effect("create stores excludedFromRecap, then getById returns it", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make({ name: "Joint account", excludedFromRecap: true }));
      assert.strictEqual(created.excludedFromRecap, true);
      const found = yield* repo.getById(created.id);
      assert.strictEqual(found.excludedFromRecap, true);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("an issuer defaults to counted, and update flips it both ways", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make());
      // Not-excluded is the default, so an untouched issuer reads absent.
      assert.strictEqual(created.excludedFromRecap, undefined);

      const excluded = yield* repo.update(created.id, {
        excludedFromRecap: true,
      });
      assert.strictEqual(excluded.excludedFromRecap, true);

      // An unrelated later edit must not silently pull the issuer back in.
      const renamed = yield* repo.update(created.id, { name: "Renamed" });
      assert.strictEqual(renamed.name, "Renamed");
      assert.strictEqual(renamed.excludedFromRecap, true);

      const included = yield* repo.update(created.id, {
        excludedFromRecap: false,
      });
      assert.strictEqual(included.excludedFromRecap, undefined);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("setImage sets imageUrl, then getById reflects it", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make());
      const updated = yield* repo.setImage(created.id, "/uploads/issuers/logo.png");
      assert.strictEqual(updated.imageUrl, "/uploads/issuers/logo.png");

      const fetched = yield* repo.getById(created.id);
      assert.strictEqual(fetched.imageUrl, "/uploads/issuers/logo.png");
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("clearImage removes imageUrl (back to absent)", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make());
      yield* repo.setImage(created.id, "/uploads/issuers/logo.png");
      const cleared = yield* repo.clearImage(created.id);
      assert.strictEqual(cleared.imageUrl, undefined);

      const fetched = yield* repo.getById(created.id);
      assert.strictEqual(fetched.imageUrl, undefined);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("remove deletes the row", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const created = yield* repo.create(make());
      yield* repo.remove(created.id);
      const error = yield* repo.getById(created.id).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: created.id }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getById fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getByNameCi fails NotFound on a missing name", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const error = yield* repo.getByNameCi("nope").pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: "nope" }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("update fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const error = yield* repo.update(asId(404), { name: "X" }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("remove fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* IssuerRepo;
      const error = yield* repo.remove(asId(404)).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "issuer", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );
});
