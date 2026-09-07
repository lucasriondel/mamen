import { assert, describe, it } from "@effect/vitest";
import {
  AccountId,
  CsvStatementFormat,
  NotFound,
  PdfStatementFormat,
  type StatementFormatCreate,
  StatementFormatId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { StatementFormatFromRow, StatementFormatRepo } from "./repository";

const asAccount = Schema.decodeSync(AccountId);
const asId = Schema.decodeSync(StatementFormatId);

/** Green-Got's own rules — the vocabulary's proof case, used as the default. */
const RULES = {
  sign: {
    strategy: "direction-column",
    amountColumn: "Montant",
    directionColumn: "Direction",
    debitValue: "DEBIT",
  },
  dateOrder: "iso",
  decimalSeparator: "dot",
  filter: { column: "Statut", equals: "COMPLETE" },
} as const;

const MAPPING = {
  date: "Date",
  rawIssuerString: ["Intitulé"],
  counterpartyIban: "IBAN du tiers",
} as const;

/**
 * A valid create payload for a CSV format; override any field per test. Typed
 * to the CSV half rather than to the union, so an override cannot widen `kind`
 * and quietly turn the factory's `headers` into a payload for neither half.
 */
type CsvFormatCreate = Extract<StatementFormatCreate, { kind: "csv" }>;

const csvFormat = (over: Partial<CsvFormatCreate> = {}): CsvFormatCreate => ({
  accountId: asAccount(1),
  name: "Green-Got",
  kind: "csv",
  headers: ["Statut", "Date", "Montant", "Direction", "Intitulé"],
  mapping: MAPPING,
  rules: RULES,
  ...over,
});

/**
 * The **row codec**, driven as a pure codec: no database, no repository, no
 * Effect runtime beyond the schema itself.
 *
 * This is where JSON-in-TEXT earns its test. The nested mapping and value rules
 * are opaque to sqlite, so the *only* thing standing between a stored format and
 * a wizard reading back a different bank's rules is this transform — and its
 * encode half is otherwise dead code, since the write path builds its row by
 * hand like every other repository here.
 */
describe("StatementFormatFromRow storage codec", () => {
  const decode = Schema.decodeSync(StatementFormatFromRow);
  const encode = Schema.encodeSync(StatementFormatFromRow);

  const row = {
    id: 1,
    accountId: 7,
    name: "Green-Got",
    kind: "csv" as const,
    declaredColumns: JSON.stringify(["Statut", "Date", "Montant"]),
    mapping: JSON.stringify(MAPPING),
    rules: JSON.stringify(RULES),
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
  };

  it("decodes the JSON columns into nested objects", () => {
    const format = decode(row);
    assert.instanceOf(format, CsvStatementFormat);
    assert.deepStrictEqual(format.mapping, MAPPING);
    assert.deepStrictEqual(format.rules, RULES);
    assert.deepStrictEqual(format.kind === "csv" ? format.headers : [], [
      "Statut",
      "Date",
      "Montant",
    ]);
    assert.strictEqual(format.createdAt.toISOString(), row.createdAt);
  });

  it("encodes the nested objects back to the JSON columns", () => {
    assert.deepStrictEqual(encode(decode(row)), row);
  });

  // `declaredColumns` is one column whose meaning `kind` decides: the header
  // fingerprint for a CSV, the columns to ask a model for in a PDF. The codec
  // is the only place that fold happens, in both directions.
  it("folds `declaredColumns` onto the field its kind names", () => {
    const pdf = decode({ ...row, kind: "pdf" });
    assert.instanceOf(pdf, PdfStatementFormat);
    assert.deepStrictEqual(pdf.kind === "pdf" ? pdf.columns : [], ["Statut", "Date", "Montant"]);
    assert.deepStrictEqual(encode(pdf).declaredColumns, row.declaredColumns);
  });

  // The filter is the one optional rule, and the two spellings of "no filter"
  // must not both exist: a stored `null` decodes to a `null` and encodes back
  // to one, never to an absent key that a later reader would have to guess at.
  it("round-trips an absent row filter in both directions", () => {
    const unfiltered = { ...RULES, filter: null };
    const format = decode({ ...row, rules: JSON.stringify(unfiltered) });
    assert.strictEqual(format.rules.filter, null);
    assert.strictEqual(encode(format).rules, JSON.stringify(unfiltered));
  });

  // Every mapped target but the counterparty IBAN is required, and that one is
  // nullable rather than optional — a bank writing no counterparty account
  // number has to say so.
  it("round-trips a mapping that promotes no counterparty IBAN", () => {
    const mapping = { ...MAPPING, counterpartyIban: null };
    const format = decode({ ...row, mapping: JSON.stringify(mapping) });
    assert.strictEqual(format.mapping.counterpartyIban, null);
    assert.strictEqual(encode(format).mapping, JSON.stringify(mapping));
  });

  it("round-trips each sign strategy", () => {
    for (const sign of [
      { strategy: "signed-column", amountColumn: "Montant" },
      RULES.sign,
      { strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" },
    ] as const) {
      const rules = { ...RULES, sign };
      const format = decode({ ...row, rules: JSON.stringify(rules) });
      assert.deepStrictEqual(format.rules.sign, sign);
      assert.strictEqual(encode(format).rules, JSON.stringify(rules));
    }
  });
});

// The repository over a fresh `:memory:` DB. `StatementFormatRepo.Default` needs
// a SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = StatementFormatRepo.Default.pipe(Layer.provide(DatabaseTest));

describe("StatementFormatRepo", () => {
  it.effect("create assigns an id and timestamps, then getById returns it", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      const created = yield* repo.create(csvFormat());
      assert.strictEqual(created.name, "Green-Got");
      assert.ok(created.id > 0);
      assert.strictEqual(created.createdAt.getTime(), created.updatedAt.getTime());

      const fetched = yield* repo.getById(created.id);
      assert.deepStrictEqual(fetched, created);
    }).pipe(Effect.provide(RepoTest)),
  );

  // The round trip that matters: the nested rules survive the JSON-in-TEXT
  // columns intact, read back through a real database rather than the codec
  // alone.
  it.effect("create-and-read preserves the nested mapping and rules", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      const created = yield* repo.create(csvFormat());
      const fetched = yield* repo.getById(created.id);

      assert.deepStrictEqual(fetched.mapping, MAPPING);
      assert.deepStrictEqual(fetched.rules, RULES);
      assert.deepStrictEqual(fetched.kind === "csv" ? fetched.headers : [], [
        "Statut",
        "Date",
        "Montant",
        "Direction",
        "Intitulé",
      ]);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("create stores a format that promotes no counterparty IBAN", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      const created = yield* repo.create(
        csvFormat({ mapping: { ...MAPPING, counterpartyIban: null } }),
      );

      const fetched = yield* repo.getById(created.id);
      assert.strictEqual(fetched.mapping.counterpartyIban, null);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("create stores a format that filters no rows", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      const created = yield* repo.create(csvFormat({ rules: { ...RULES, filter: null } }));

      const fetched = yield* repo.getById(created.id);
      assert.strictEqual(fetched.rules.filter, null);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list is scoped to one account", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      yield* repo.create(csvFormat({ accountId: asAccount(1), name: "Mine" }));
      yield* repo.create(csvFormat({ accountId: asAccount(2), name: "Theirs" }));

      const mine = yield* repo.list({ limit: 50, offset: 0, accountId: asAccount(1) });
      assert.strictEqual(mine.total, 1);
      assert.deepStrictEqual(
        mine.items.map((f) => f.name),
        ["Mine"],
      );

      // `total` is the count of the scoped set, not of the table — otherwise a
      // picker would page past the end of the account it is showing.
      const all = yield* repo.list({ limit: 50, offset: 0 });
      assert.strictEqual(all.total, 2);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("list honors limit/offset while total stays the full scoped set", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      yield* repo.create(csvFormat({ name: "A" }));
      yield* repo.create(csvFormat({ name: "B" }));
      yield* repo.create(csvFormat({ name: "C" }));

      const page = yield* repo.list({ limit: 1, offset: 1, accountId: asAccount(1) });
      assert.strictEqual(page.total, 3);
      assert.deepStrictEqual(
        page.items.map((f) => f.name),
        ["B"],
      );
    }).pipe(Effect.provide(RepoTest)),
  );

  // A bank publishing both a CSV and a PDF export is the ordinary case, and the
  // two are separate formats for the same account (PRD #180).
  it.effect("holds formats of both kinds on one account", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      yield* repo.create(csvFormat({ name: "Green-Got CSV" }));
      yield* repo.create({
        accountId: asAccount(1),
        name: "Green-Got PDF",
        kind: "pdf",
        columns: ["Date", "Libellé", "Débit", "Crédit"],
        mapping: MAPPING,
        rules: RULES,
      });

      const page = yield* repo.list({ limit: 50, offset: 0, accountId: asAccount(1) });
      assert.deepStrictEqual(
        page.items.map((f) => f.kind),
        ["csv", "pdf"],
      );
      const pdf = page.items[1];
      assert.deepStrictEqual(pdf?.kind === "pdf" ? pdf.columns : [], [
        "Date",
        "Libellé",
        "Débit",
        "Crédit",
      ]);
    }).pipe(Effect.provide(RepoTest)),
  );

  it.effect("getById fails NotFound on a missing id", () =>
    Effect.gen(function* () {
      const repo = yield* StatementFormatRepo;
      const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "statement format", id: asId(404) }));
    }).pipe(Effect.provide(RepoTest)),
  );
});
