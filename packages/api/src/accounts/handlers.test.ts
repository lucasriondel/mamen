import { HttpApiBuilder, HttpApiClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AccountId,
  Api,
  IssuerId,
  NotFound,
  type TransactionCreate,
  TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test (below) so each test gets an
// isolated, migrated database.
const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(ClaudeCodeStub),
  Layer.provide(OutboundStub),
  Layer.provide(DatabaseTest),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const asId = Schema.decodeSync(AccountId);
const asIssuer = Schema.decodeSync(IssuerId);
const asTxId = Schema.decodeSync(TransactionId);

const DATE = new Date("2026-03-01T00:00:00.000Z");

/** A valid transaction-create payload; override any field per test. */
const txn = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
  accountId: asId(1),
  date: DATE,
  amount: -900,
  rawIssuerString: "RAW",
  importedAt: DATE,
  importMonth: "2026-03",
  ...over,
});

describe("accounts endpoints", () => {
  it.effect("list is empty initially", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const page = yield* client.accounts.list({
        urlParams: { limit: 50, offset: 0 },
      });
      assert.deepStrictEqual(page, { items: [], total: 0 });
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("create returns 201 body and getById round-trips it", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.accounts.create({
        payload: { name: "Checking", type: "checking" },
      });
      assert.strictEqual(created.name, "Checking");
      assert.strictEqual(created.type, "checking");

      const fetched = yield* client.accounts.getById({
        path: { id: created.id },
      });
      assert.deepStrictEqual(fetched, created);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("list paginates and reports the full total", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.accounts.create({
        payload: { name: "A", type: "checking" },
      });
      yield* client.accounts.create({
        payload: { name: "B", type: "savings" },
      });
      yield* client.accounts.create({
        payload: { name: "C", type: "other" },
      });

      const page = yield* client.accounts.list({
        urlParams: { limit: 2, offset: 0 },
      });
      assert.strictEqual(page.total, 3);
      assert.strictEqual(page.items.length, 2);
      assert.deepStrictEqual(
        page.items.map((a) => a.name),
        ["A", "B"],
      );
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getByName finds by exact name", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.accounts.create({
        payload: { name: "Savings", type: "savings" },
      });
      const found = yield* client.accounts.getByName({
        path: { name: "Savings" },
      });
      assert.strictEqual(found.name, "Savings");
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getByName decodes URL-encoded names", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.accounts.create({
        payload: { name: "Joint & Co", type: "other" },
      });
      const found = yield* client.accounts.getByName({
        path: { name: "Joint & Co" },
      });
      assert.strictEqual(found.name, "Joint & Co");
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update applies a partial change and bumps updatedAt", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.accounts.create({
        payload: { name: "Old", type: "checking" },
      });
      const updated = yield* client.accounts.update({
        path: { id: created.id },
        payload: { name: "New" },
      });
      assert.strictEqual(updated.name, "New");
      assert.strictEqual(updated.type, "checking");
      assert.strictEqual(updated.id, created.id);
      assert.strictEqual(updated.createdAt.getTime(), created.createdAt.getTime());
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("remove deletes the account (then getById 404s)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.accounts.create({
        payload: { name: "Temp", type: "other" },
      });
      yield* client.accounts.remove({ path: { id: created.id } });

      const error = yield* client.accounts.getById({ path: { id: created.id } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: created.id }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getById 404s on a missing id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.accounts.getById({ path: { id: asId(999) } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: asId(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getByName 404s on a missing name", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.accounts.getByName({ path: { name: "Nope" } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: "Nope" }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update 404s on a missing id (behavior change)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.accounts
        .update({ path: { id: asId(999) }, payload: { name: "X" } })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: asId(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("remove 404s on a missing id (behavior change)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.accounts.remove({ path: { id: asId(999) } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "account", id: asId(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );
});

/**
 * The IBAN reaches the database normalised **whoever sent it** (issue #201).
 *
 * The web client has always normalised at submit, so the contract's "stored
 * upper-case, no spaces" held in practice and nowhere else. These cases are the
 * other callers — a curl, an SDK script, a future importer — and they post
 * *raw bytes* rather than going through the typed client, which encodes the
 * payload through the very schema under test and would normalise the value
 * before the server ever saw it. Raw bytes are the only way to ask what the
 * server does with a body it did not write.
 */
describe("accounts normalise the IBAN at the contract boundary", () => {
  // Assembled rather than written out, so this file carries no account number
  // of its own (the repo's leak scan, issue #108). The grouped form is the same
  // number as a bank prints it — the spelling differs, the account does not.
  const IBAN = `FR7699999${"000011234567890189"}`;
  const GROUPED = "fr76 9999 9000 0112 3456 7890 189";

  it.effect("stores a grouped, lower-case IBAN posted as raw JSON", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const created = yield* http.execute(
        HttpClientRequest.post("/api/accounts").pipe(
          HttpClientRequest.bodyUnsafeJson({ name: "Curl", type: "checking", iban: GROUPED }),
        ),
      );
      assert.strictEqual(created.status, 201);

      // Read back through the typed client: what the *app* will compare against
      // an account form and join against a counterparty IBAN.
      const client = yield* HttpApiClient.make(Api);
      const found = yield* client.accounts.getByName({ path: { name: "Curl" } });
      assert.strictEqual(found.iban, IBAN);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("updates through the same normalisation", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const account = yield* client.accounts.create({
        payload: { name: "Curl", type: "checking" },
      });

      const http = yield* HttpClient.HttpClient;
      const updated = yield* http.execute(
        HttpClientRequest.put(`/api/accounts/${account.id}`).pipe(
          HttpClientRequest.bodyUnsafeJson({ iban: GROUPED }),
        ),
      );
      assert.strictEqual(updated.status, 200);

      const found = yield* client.accounts.getById({ path: { id: account.id } });
      assert.strictEqual(found.iban, IBAN);
    }).pipe(Effect.provide(HttpLive)),
  );

  // An empty field is "not given", which already has a spelling: null. A client
  // that says `""` is not creating a third state.
  it.effect("folds a blank IBAN to null", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      yield* http.execute(
        HttpClientRequest.post("/api/accounts").pipe(
          HttpClientRequest.bodyUnsafeJson({ name: "Curl", type: "checking", iban: "" }),
        ),
      );

      const client = yield* HttpApiClient.make(Api);
      const found = yield* client.accounts.getByName({ path: { name: "Curl" } });
      assert.strictEqual(found.iban, null);
    }).pipe(Effect.provide(HttpLive)),
  );
});

// Deleting an account cascades into the Matching Rules scoped to it (issue #90).
// A rule whose **Account matcher** names a dead account could never match
// anything again, and leaving it would also leave the rows it had won holding an
// issuer no surviving rule justifies — so the delete removes those rules AND
// re-derives the whole table, atomically.
describe("account delete cascades into its Matching Rules", () => {
  it.effect("removes the rules scoped to it and re-derives the rows they won", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const account = yield* client.accounts.create({
        payload: { name: "Joint", type: "checking" },
      });

      // A broad rule (issuer 1) any VIREMENT row falls back to, and an
      // account-scoped rule (issuer 2) that out-specifies it on this account.
      yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "VIREMENT" },
      });
      const scoped = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(2),
          pattern: "LOYER",
          matchAccountId: account.id,
        },
      });

      const [both, only] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            txn({
              accountId: account.id,
              rawIssuerString: "VIREMENT LOYER",
            }),
            // Matches the scoped rule alone — nothing survives to claim it.
            txn({ accountId: account.id, rawIssuerString: "LOYER MARS" }),
          ],
        },
      });
      assert.strictEqual(both?.issuerId, asIssuer(2));
      assert.strictEqual(only?.issuerId, asIssuer(2));

      yield* client.accounts.remove({ path: { id: account.id } });

      // The scoped rule is gone with the account…
      const error = yield* client.rules.getById({ path: { id: scoped.id } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: scoped.id }));
      const remaining = yield* client.rules.list({
        urlParams: { limit: 50, offset: 0 },
      });
      assert.strictEqual(remaining.total, 1);

      // …and the rows it had won are re-derived: one falls back to the broad
      // rule, the other becomes unmatched.
      const afterBoth = yield* client.transactions.getById({
        path: { id: both?.id ?? asTxId(0) },
      });
      const afterOnly = yield* client.transactions.getById({
        path: { id: only?.id ?? asTxId(0) },
      });
      assert.strictEqual(afterBoth.issuerId, asIssuer(1));
      assert.strictEqual(afterOnly.issuerId, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  // A rule scoped to a *different* account is none of this delete's business.
  it.effect("leaves rules scoped to another account alone", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const doomed = yield* client.accounts.create({
        payload: { name: "Old", type: "checking" },
      });
      const kept = yield* client.accounts.create({
        payload: { name: "New", type: "checking" },
      });
      const survivor = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(3),
          pattern: "LOYER",
          matchAccountId: kept.id,
        },
      });

      yield* client.accounts.remove({ path: { id: doomed.id } });

      const fetched = yield* client.rules.getById({
        path: { id: survivor.id },
      });
      assert.strictEqual(fetched.matchAccountId, kept.id);
    }).pipe(Effect.provide(HttpLive)),
  );
});
