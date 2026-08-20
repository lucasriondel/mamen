import { HttpApiBuilder, HttpApiClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AccountId,
  Api,
  type StatementFormatCreate,
  StatementFormatId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test so each gets an isolated,
// migrated database.
const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(ClaudeCodeStub),
  Layer.provide(OutboundStub),
  Layer.provide(DatabaseTest),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const asAccount = Schema.decodeSync(AccountId);
const asId = Schema.decodeSync(StatementFormatId);

const MAPPING = {
  date: "Date",
  rawIssuerString: "Intitulé",
  counterpartyIban: "IBAN du tiers",
} as const;

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

describe("statement-formats endpoints", () => {
  it.effect("list is empty initially", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const page = yield* client.statementFormats.list({ urlParams: { limit: 50, offset: 0 } });
      assert.deepStrictEqual(page, { items: [], total: 0 });
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("create returns 201 and getById round-trips the nested rules", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.statementFormats.create({ payload: csvFormat() });
      assert.strictEqual(created.name, "Green-Got");
      assert.strictEqual(created.kind, "csv");

      const fetched = yield* client.statementFormats.getById({ path: { id: created.id } });
      assert.deepStrictEqual(fetched, created);
      // The nested objects survive JSON-in-TEXT *and* the wire encode/decode —
      // which is the whole round trip a wizard will depend on.
      assert.deepStrictEqual(fetched.mapping, MAPPING);
      assert.deepStrictEqual(fetched.rules, RULES);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("create accepts a pdf format and keeps its declared columns", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.statementFormats.create({
        payload: {
          accountId: asAccount(1),
          name: "Green-Got PDF",
          kind: "pdf",
          columns: ["Date", "Libellé", "Débit", "Crédit"],
          mapping: MAPPING,
          rules: RULES,
        },
      });

      assert.deepStrictEqual(created.kind === "pdf" ? created.columns : [], [
        "Date",
        "Libellé",
        "Débit",
        "Crédit",
      ]);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("list scopes to the account it is given", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.statementFormats.create({
        payload: csvFormat({ accountId: asAccount(1), name: "Mine" }),
      });
      yield* client.statementFormats.create({
        payload: csvFormat({ accountId: asAccount(2), name: "Theirs" }),
      });

      const mine = yield* client.statementFormats.list({
        urlParams: { limit: 50, offset: 0, accountId: asAccount(1) },
      });
      assert.strictEqual(mine.total, 1);
      assert.deepStrictEqual(
        mine.items.map((f) => f.name),
        ["Mine"],
      );
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getById 404s with a NotFound tag on a missing id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.statementFormats
        .getById({ path: { id: asId(404) } })
        .pipe(Effect.flip);
      assert.strictEqual(error._tag, "NotFound");
      assert.strictEqual(
        error._tag === "NotFound" ? error.resource : undefined,
        "statement format",
      );
    }).pipe(Effect.provide(HttpLive)),
  );

  // The entity is a union on `kind`, and the framework fixes a union member's
  // status by AST identity across every endpoint that returns it — so `create`
  // answering 201 while `getById` answers 200 is a claim about the contract, not
  // a framework given. Both halves asserted together, since it is the *pair*
  // that a shared annotation would break.
  it.effect("create answers 201 and getById 200", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const created = yield* http.execute(
        HttpClientRequest.post("/api/statement-formats").pipe(
          HttpClientRequest.bodyUnsafeJson(csvFormat()),
        ),
      );
      assert.strictEqual(created.status, 201);

      const read = yield* http.get("/api/statement-formats/1");
      assert.strictEqual(read.status, 200);
    }).pipe(Effect.provide(HttpLive)),
  );

  /**
   * A format the vocabulary cannot express is refused at the schema boundary,
   * as a `400` decode error. There is no hand-written "invalid format" error and
   * there should not be: the closed unions *are* the validation, which is half
   * the reason for choosing them over an expression language.
   *
   * Posted as raw bytes rather than through the typed client, because the client
   * encodes the payload through the same contract and would refuse it locally
   * before the server ever saw it.
   */
  it.effect("refuses a sign strategy the vocabulary does not name with 400", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const res = yield* http.execute(
        HttpClientRequest.post("/api/statement-formats").pipe(
          HttpClientRequest.bodyUnsafeJson({
            ...csvFormat(),
            rules: { ...RULES, sign: { strategy: "guess", expression: "amount * -1" } },
          }),
        ),
      );
      assert.strictEqual(res.status, 400);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("refuses a format that says nothing about the counterparty IBAN with 400", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const res = yield* http.execute(
        HttpClientRequest.post("/api/statement-formats").pipe(
          HttpClientRequest.bodyUnsafeJson({
            ...csvFormat(),
            mapping: { date: "Date", rawIssuerString: "Intitulé" },
          }),
        ),
      );
      // Nullable, not optional: a bank carrying no counterparty account number
      // has to say so, so that "carries none" and "nobody got round to it"
      // cannot look alike in a stored row.
      assert.strictEqual(res.status, 400);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("refuses a csv format declaring pdf columns with 400", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const { headers: _headers, ...rest } = csvFormat();
      const res = yield* http.execute(
        HttpClientRequest.post("/api/statement-formats").pipe(
          HttpClientRequest.bodyUnsafeJson({ ...rest, columns: ["Date"] }),
        ),
      );
      // The discriminant decides which list a format declares. A CSV format
      // with no header fingerprint could never be detected against a file.
      assert.strictEqual(res.status, 400);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("refuses a non-numeric id in the path with 400", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const res = yield* http.get("/api/statement-formats/abc");
      assert.strictEqual(res.status, 400);
    }).pipe(Effect.provide(HttpLive)),
  );
});
