import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AccountId,
  Api,
  IssuerId,
  NotFound,
  type RuleCreate,
  RuleId,
  type TransactionCreate,
  TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

// What this suite is for, and what it is deliberately NOT for (issue #161).
//
// Every case here costs a fresh server and a migrated database, so it only
// earns its keep asserting something a plain function call cannot: the
// **transport** (status codes, path decoding, pagination, the payload
// round-trips that tell an explicit `null` from an absent key) and the
// **wiring** (that the handler reaches `IssuerMatcher`, in a transaction,
// against the live tables, and hands its answer back on the wire).
//
// Which rule wins a row is not asserted here. That whole decision matrix —
// specificity and its tie-breaks, each predicate's semantics, manual
// precedence, the preview bucketing rules — lives in
// `src/matching/issuer-matcher.test.ts`, which calls the pure exports
// directly and runs the exhaustive version in single-digit milliseconds.
// Restating a decision here buys a second, slower copy of an assertion and
// costs diagnosability: a matching bug should fail one named engine case, not
// a dozen wire cases that name nothing. Add decisions there, effects here.

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(ClaudeCodeStub),
  Layer.provide(OutboundStub),
  Layer.provide(DatabaseTest),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const asIssuer = Schema.decodeSync(IssuerId);
const asRule = Schema.decodeSync(RuleId);
const asAccount = Schema.decodeSync(AccountId);
const asTxId = Schema.decodeSync(TransactionId);

/** A valid create payload; override any field per test. */
const make = (over: Partial<RuleCreate> = {}): RuleCreate => ({
  issuerId: asIssuer(1),
  pattern: "ACME",
  ...over,
});

const DATE = new Date("2026-03-01T00:00:00.000Z");

/** A valid transaction-create payload; override any field per test. */
const tx = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
  accountId: asAccount(1),
  date: DATE,
  amount: 10,
  rawIssuerString: "RAW",
  importedAt: DATE,
  importMonth: "2026-03",
  ...over,
});

/** The ids of a preview list, in order — what the dry-run assertions compare. */
const ids = (rows: ReadonlyArray<{ id: unknown }>) => rows.map((r) => r.id);

describe("rules endpoints", () => {
  it.effect("list is empty initially", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const page = yield* client.rules.list({
        urlParams: { limit: 50, offset: 0 },
      });
      assert.deepStrictEqual(page, { items: [], total: 0 });
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("create returns 201 body and getById round-trips it", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: make({ pattern: "AMAZON", issuerId: asIssuer(3) }),
      });
      assert.strictEqual(created.pattern, "AMAZON");
      assert.strictEqual(created.issuerId, asIssuer(3));
      // Nothing imported yet, so the rule owns nothing.
      assert.strictEqual(created.ownedCount, 0);

      const fetched = yield* client.rules.getById({
        path: { id: created.id },
      });
      assert.deepStrictEqual(fetched, created);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("list paginates and reports the full total", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({ payload: make({ pattern: "a" }) });
      yield* client.rules.create({ payload: make({ pattern: "b" }) });
      yield* client.rules.create({ payload: make({ pattern: "c" }) });

      const page = yield* client.rules.list({
        urlParams: { limit: 2, offset: 0 },
      });
      assert.strictEqual(page.total, 3);
      assert.strictEqual(page.items.length, 2);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("list filters by issuerId over the wire", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: make({ issuerId: asIssuer(1), pattern: "a" }),
      });
      yield* client.rules.create({
        payload: make({ issuerId: asIssuer(1), pattern: "b" }),
      });
      yield* client.rules.create({
        payload: make({ issuerId: asIssuer(2), pattern: "c" }),
      });

      const page = yield* client.rules.list({
        urlParams: { limit: 50, offset: 0, issuerId: asIssuer(1) },
      });
      assert.strictEqual(page.total, 2);
      assert.deepStrictEqual(page.items.map((r) => r.pattern).sort(), ["a", "b"]);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("count returns the total, and the issuer-scoped count", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({ payload: make({ issuerId: asIssuer(1) }) });
      yield* client.rules.create({ payload: make({ issuerId: asIssuer(1) }) });
      yield* client.rules.create({ payload: make({ issuerId: asIssuer(2) }) });

      const total = yield* client.rules.count({ urlParams: {} });
      assert.strictEqual(total.count, 3);

      const scoped = yield* client.rules.count({
        urlParams: { issuerId: asIssuer(1) },
      });
      assert.strictEqual(scoped.count, 2);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getByIssuerPattern decodes the two-segment path and finds the rule", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: make({ issuerId: asIssuer(5), pattern: "NETFLIX" }),
      });
      const found = yield* client.rules.getByIssuerPattern({
        path: { issuerId: asIssuer(5), pattern: "NETFLIX" },
      });
      assert.strictEqual(found.pattern, "NETFLIX");
      assert.strictEqual(found.issuerId, asIssuer(5));
    }).pipe(Effect.provide(HttpLive)),
  );

  // A pattern with spaces round-trips through the `:pattern` segment via the
  // client's percent-encoding (space → `%20`). A literal `/` is deliberately
  // NOT tested: it would split the path into extra segments and can't survive a
  // single path param — patterns with slashes are out of scope for this route
  // (faithful to the old single-segment param).
  it.effect("getByIssuerPattern handles a pattern with spaces", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const pattern = "ACME STORE 1";
      yield* client.rules.create({
        payload: make({ issuerId: asIssuer(6), pattern }),
      });
      const found = yield* client.rules.getByIssuerPattern({
        path: { issuerId: asIssuer(6), pattern },
      });
      assert.strictEqual(found.pattern, pattern);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update applies a partial change and keeps createdAt", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: make({ pattern: "old", issuerId: asIssuer(1) }),
      });
      const updated = yield* client.rules.update({
        path: { id: created.id },
        payload: { issuerId: asIssuer(9) },
      });
      assert.strictEqual(updated.issuerId, asIssuer(9));
      assert.strictEqual(updated.pattern, "old");
      assert.strictEqual(updated.id, created.id);
      assert.strictEqual(updated.createdAt.getTime(), created.createdAt.getTime());
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("remove deletes the rule (then getById 404s)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: make({ pattern: "temp" }),
      });
      yield* client.rules.remove({ path: { id: created.id } });

      const error = yield* client.rules.getById({ path: { id: created.id } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: created.id }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getById 404s on a missing id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules.getById({ path: { id: asRule(999) } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("getByIssuerPattern 404s on a missing pattern", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules
        .getByIssuerPattern({
          path: { issuerId: asIssuer(1), pattern: "nope" },
        })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: "nope" }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update 404s on a missing id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules
        .update({ path: { id: asRule(999) }, payload: { pattern: "X" } })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("remove 404s on a missing id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules.remove({ path: { id: asRule(999) } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );
});

// The matching dry-run (PRD #8 stories 7–11), at its two branches. What the
// buckets *contain* is the engine's business; what these pin is that the
// endpoint reads the live tables and reaches `previewLists` down each branch —
// create (rule synthesised as newest, off the `Clock`) and update (stored rule
// loaded by `ruleId` and swapped for the prospective one) — that a missing
// `ruleId` survives `orDieSql` as a 404 rather than a 500, and that an
// uncompilable pattern comes back as a 200 carrying `skipped`.
describe("rule preview (dry-run)", () => {
  it.effect("create: will-match lists the unmatched rows the pattern claims", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      // No rules yet ⇒ the row imports unmatched.
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });

      const preview = yield* client.rules.preview({
        payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
      });
      assert.strictEqual(preview.skipped, false);
      assert.deepStrictEqual(ids(preview.willMatch), [row?.id]);
      assert.deepStrictEqual(preview.willReassign, []);
      assert.deepStrictEqual(preview.manualCollisions, []);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update: previews the edited pattern against the stored rule set", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const rule = yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "OLD" },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "NEWPATTERN CO" })] },
      });

      // Editing this rule's pattern to NEWPATTERN would claim the currently
      // unmatched row (the old pattern no longer competes — same-id swap).
      const preview = yield* client.rules.preview({
        payload: {
          ruleId: rule.id,
          issuerId: asIssuer(1),
          pattern: "NEWPATTERN",
        },
      });
      assert.deepStrictEqual(ids(preview.willMatch), [row?.id]);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update: 404s when the ruleId names a missing rule", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules
        .preview({
          payload: {
            ruleId: asRule(999),
            issuerId: asIssuer(1),
            pattern: "X",
          },
        })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("an invalid regex is a skipped rule → empty lists, not a 500", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      const preview = yield* client.rules.preview({
        payload: { issuerId: asIssuer(1), pattern: "AMAZON[" },
      });
      assert.strictEqual(preview.skipped, true);
      assert.deepStrictEqual(preview.willMatch, []);
      assert.deepStrictEqual(preview.willReassign, []);
      assert.deepStrictEqual(preview.manualCollisions, []);
    }).pipe(Effect.provide(HttpLive)),
  );
});

// Apply-on-save (PRD #8 stories 12, 16, 22): create/update write the rule AND
// recompute every transaction's issuer against the resulting rule set atomically.
// Asserted through the client: the transactions table is invariant-correct after
// each save, and matches what the matching preview promised.
describe("rule apply-on-save", () => {
  it.effect("create retroactively claims a previously unmatched row", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      assert.strictEqual(row?.issuerId, undefined);

      // Preview promises the claim; save must deliver exactly it.
      const preview = yield* client.rules.preview({
        payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
      });
      assert.deepStrictEqual(
        preview.willMatch.map((r) => r.id),
        [row?.id],
      );

      yield* client.rules.create({
        payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
      });

      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, asIssuer(42));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("a manual row is never reassigned by a rule save", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const [row] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({
              rawIssuerString: "AMAZON EU SARL",
              issuerId: asIssuer(5),
              manualIssuer: true,
            }),
          ],
        },
      });

      yield* client.rules.create({
        payload: { issuerId: asIssuer(10), pattern: "AMAZON" },
      });

      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, asIssuer(5));
      assert.strictEqual(after.manualIssuer, true);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update re-derives the table against the edited pattern", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      // Rule initially matches nothing; the row imports unmatched.
      const rule = yield* client.rules.create({
        payload: { issuerId: asIssuer(7), pattern: "OLD" },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "NEWPATTERN CO" })] },
      });
      assert.strictEqual(row?.issuerId, undefined);

      // Editing the pattern to match the row applies retroactively on save.
      yield* client.rules.update({
        path: { id: rule.id },
        payload: { pattern: "NEWPATTERN" },
      });

      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, asIssuer(7));
    }).pipe(Effect.provide(HttpLive)),
  );
});

// The per-row "remove manual issuer" action (PRD #8 story 10): clear the manual
// flag and re-derive the row against the current rule set — it becomes unmatched,
// or is immediately claimed by a matching rule.
describe("remove manual issuer", () => {
  it.effect("clears the manual flag and lets an existing rule claim the row", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      // A rule exists but the row was assigned by hand to a different issuer.
      yield* client.rules.create({
        payload: { issuerId: asIssuer(10), pattern: "AMAZON" },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({
              rawIssuerString: "AMAZON EU SARL",
              issuerId: asIssuer(5),
              manualIssuer: true,
            }),
          ],
        },
      });
      assert.strictEqual(row?.issuerId, asIssuer(5));

      const cleared = yield* client.transactions.removeManualIssuer({
        path: { id: row?.id ?? asTxId(0) },
      });
      // Manual dropped; the matching rule now owns the row.
      // Manual flag cleared (the wire may carry `false` or omit it).
      assert.notStrictEqual(cleared.manualIssuer, true);
      assert.strictEqual(cleared.issuerId, asIssuer(10));

      // Persisted, not just returned.
      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, asIssuer(10));
      assert.strictEqual(after.manualIssuer, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("makes the row unmatched when no rule matches", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const [row] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({
              rawIssuerString: "SQ *BLUE BOTTLE",
              issuerId: asIssuer(5),
              manualIssuer: true,
            }),
          ],
        },
      });

      const cleared = yield* client.transactions.removeManualIssuer({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(cleared.issuerId, undefined);
      assert.notStrictEqual(cleared.manualIssuer, true);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("404s on a missing transaction id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.transactions
        .removeManualIssuer({ path: { id: asTxId(999) } })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "transaction", id: asTxId(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );
});

// Delete preview + next-best fall-back re-eval (PRD #8 stories 17–18, issue #12).
// Deleting a rule previews the rows it re-homes and, on commit, re-derives them
// against the REMAINING rules — driven end-to-end through the client.
describe("rule delete preview + re-eval", () => {
  it.effect("preview: deleting the only matching rule lists rows as will-unmatch", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const only = yield* client.rules.create({
        payload: { issuerId: asIssuer(9), pattern: "AMAZON" },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      assert.strictEqual(row?.issuerId, asIssuer(9));

      const preview = yield* client.rules.previewDelete({
        path: { id: only.id },
      });
      assert.deepStrictEqual(ids(preview.willUnmatch), [row?.id]);
      assert.deepStrictEqual(preview.willReassign, []);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("preview: 404s when the ruleId names a missing rule", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules
        .previewDelete({ path: { id: asRule(999) } })
        .pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("delete: winning rule's rows move to the next-best rule", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "AMAZON" },
      });
      const specific = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(2),
          pattern: "AMAZON EU SARL",
        },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      assert.strictEqual(row?.issuerId, asIssuer(2));

      yield* client.rules.remove({ path: { id: specific.id } });

      // Falls back to the broad rule that remains.
      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, asIssuer(1));
      assert.notStrictEqual(after.manualIssuer, true);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("delete: rows become unmatched when no rule remains", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const only = yield* client.rules.create({
        payload: { issuerId: asIssuer(9), pattern: "AMAZON" },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      assert.strictEqual(row?.issuerId, asIssuer(9));

      yield* client.rules.remove({ path: { id: only.id } });

      const after = yield* client.transactions.getById({
        path: { id: row?.id ?? asTxId(0) },
      });
      assert.strictEqual(after.issuerId, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("delete: 404s when the rule is missing", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.rules.remove({ path: { id: asRule(999) } }).pipe(Effect.flip);
      assert.deepStrictEqual(error, new NotFound({ resource: "rule", id: asRule(999) }));
    }).pipe(Effect.provide(HttpLive)),
  );
});

// Owned-row counts (issue #63). A rule reports how many transactions it
// *currently* owns — derived from the live table on every read, never a stored
// tally, so it is right the moment anything else moves. Driven through the
// client: seed history, write rules, and read the count back off the rule.
describe("rule owned counts", () => {
  it.effect("a rule created against existing history counts the rows it claims", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      // History first, rule second — the case a stored import-time tally missed.
      yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({ rawIssuerString: "AMAZON EU SARL" }),
            tx({ rawIssuerString: "AMAZON FRESH" }),
            tx({ rawIssuerString: "SQ *BLUE BOTTLE" }),
          ],
        },
      });

      const created = yield* client.rules.create({
        payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
      });
      assert.strictEqual(created.ownedCount, 2);

      const page = yield* client.rules.list({
        urlParams: { limit: 50, offset: 0 },
      });
      assert.deepStrictEqual(
        page.items.map((r) => r.ownedCount),
        [2],
      );
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("a deleted transaction stops counting", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const [first, second] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({ rawIssuerString: "AMAZON EU SARL" }),
            tx({ rawIssuerString: "AMAZON FRESH" }),
          ],
        },
      });
      const rule = yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "AMAZON" },
      });
      assert.strictEqual(rule.ownedCount, 2);

      yield* client.transactions.remove({
        path: { id: first?.id ?? asTxId(0) },
      });

      // The count follows the table down — a stored tally never could.
      const after = yield* client.rules.getById({ path: { id: rule.id } });
      assert.strictEqual(after.ownedCount, 1);
      assert.ok(second);
    }).pipe(Effect.provide(HttpLive)),
  );

  // A rule's count is decided against the *whole* rule set, so a page scoped to
  // one issuer must still report what a rule outside that page took from it.
  it.effect("an issuer-scoped list still counts against every rule", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.transactions.bulkCreate({
        payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
      });
      yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "AMAZON" },
      });
      // A rule of a *different* issuer wins the row.
      yield* client.rules.create({
        payload: { issuerId: asIssuer(2), pattern: "AMAZON EU SARL" },
      });

      const page = yield* client.rules.list({
        urlParams: { limit: 50, offset: 0, issuerId: asIssuer(1) },
      });
      assert.deepStrictEqual(
        page.items.map((r) => r.ownedCount),
        [0],
      );
    }).pipe(Effect.provide(HttpLive)),
  );

  // The two sides of the coverage bar, in one case (issue #199). Its numerator
  // is the sum of these counts and its denominator `transactions.count` scoped
  // to the issuer — whose default hides **bundle members**, the parent standing
  // for them. The numbers are only a fraction if both count one population, so
  // they are asserted against each other rather than only against literals.
  it.effect("counts the rows the issuer's transaction count counts, bundles and all", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const first = yield* client.transactions.create({
        payload: tx({ rawIssuerString: "AMAZON EU SARL", amount: -20 }),
      });
      const second = yield* client.transactions.create({
        payload: tx({ rawIssuerString: "AMAZON FRESH", amount: -30 }),
      });
      // A third row stays loose. The other two go behind a parent labelled
      // something the rule cannot match, so the bundle contributes nothing.
      yield* client.transactions.create({
        payload: tx({ rawIssuerString: "AMAZON PRIME", amount: -6.99 }),
      });
      yield* client.transactions.createBundle({
        payload: { ids: [first.id, second.id], label: "Weekend away" },
      });

      const created = yield* client.rules.create({
        payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
      });
      const counted = yield* client.transactions.count({
        urlParams: { issuerId: asIssuer(42) },
      });

      // The loose row, and only it: the members are hidden behind their parent
      // on both sides of the fraction.
      assert.strictEqual(counted.count, 1);
      // The 201 body's count comes off the recompute, the re-read off a fresh
      // derivation — the same population, or the bar's numerator outruns its
      // denominator the moment a rule's rows are bundled.
      assert.strictEqual(created.ownedCount, counted.count);
      const reread = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(reread.ownedCount, counted.count);
    }).pipe(Effect.provide(HttpLive)),
  );
});

// The optional Value matcher (issue #42, ADR 0004): a rule with a `matchValue`
// forks one issuer-string by amount. Here that predicate is followed along the
// wire only — decoded off the payload, stored, echoed back, cleared by an
// explicit `null` and left alone by an absent key, and read by the import path.
// What magnitudes it admits is the engine matrix's ("ownership: the Value
// matcher"), and is not restated below.
describe("rule value matcher", () => {
  // A freshly-imported matching-amount row is claimed by the value-rule at import
  // (the import matching path, not a later recompute).
  it.effect("import matches a fresh 6.99 row to the value-rule's issuer", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: {
          issuerId: asIssuer(7),
          pattern: "AMAZON",
          matchValue: 6.99,
        },
      });
      const [row] = yield* client.transactions.bulkCreate({
        payload: {
          records: [tx({ rawIssuerString: "AMAZON EU SARL", amount: 6.99 })],
        },
      });
      assert.strictEqual(row?.issuerId, asIssuer(7));
    }).pipe(Effect.provide(HttpLive)),
  );

  // A value-rule and getById round-trip carries the matchValue back on the wire.
  it.effect("create echoes matchValue and getById round-trips it", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "AMAZON",
          matchValue: 6.99,
        },
      });
      assert.strictEqual(created.matchValue, 6.99);
      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchValue, 6.99);
    }).pipe(Effect.provide(HttpLive)),
  );

  // An explicit `null` in the update payload clears a set Value matcher back to a
  // regex-only rule (issue #43) — the wire sentinel `undefined` can't express.
  it.effect("update clears matchValue when sent an explicit null", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "AMAZON",
          matchValue: 6.99,
        },
      });
      assert.strictEqual(created.matchValue, 6.99);

      const cleared = yield* client.rules.update({
        path: { id: created.id },
        payload: { matchValue: null },
      });
      assert.strictEqual(cleared.matchValue, undefined);

      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchValue, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  // Absent `matchValue` in an update leaves a set Value matcher untouched.
  it.effect("update leaves matchValue untouched when the key is absent", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "AMAZON",
          matchValue: 6.99,
        },
      });
      const updated = yield* client.rules.update({
        path: { id: created.id },
        payload: { pattern: "AMZN" },
      });
      assert.strictEqual(updated.pattern, "AMZN");
      assert.strictEqual(updated.matchValue, 6.99);
    }).pipe(Effect.provide(HttpLive)),
  );
});

// The Account matcher, followed along the wire on the same terms as the Value
// matcher above — round-trip, null-vs-absent, and one import case proving the
// predicate reaches the matcher. Which accounts it admits: engine matrix.
describe("rule account matcher", () => {
  it.effect("create echoes matchAccountId and getById round-trips it", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "VIREMENT",
          matchAccountId: asAccount(2),
        },
      });
      assert.strictEqual(created.matchAccountId, asAccount(2));
      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchAccountId, asAccount(2));
    }).pipe(Effect.provide(HttpLive)),
  );

  // The headline AC: the same raw issuer string routes to a different issuer
  // depending on the account the row landed in.
  it.effect("an account-scoped rule claims only that account's rows", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: { issuerId: asIssuer(1), pattern: "VIREMENT" },
      });
      yield* client.rules.create({
        payload: {
          issuerId: asIssuer(2),
          pattern: "VIREMENT",
          matchAccountId: asAccount(7),
        },
      });

      const [joint, personal] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({ rawIssuerString: "VIREMENT LOYER", accountId: asAccount(7) }),
            tx({ rawIssuerString: "VIREMENT LOYER", accountId: asAccount(8) }),
          ],
        },
      });
      // Import matching itself routes the fresh rows by account.
      assert.strictEqual(joint?.issuerId, asIssuer(2));
      assert.strictEqual(personal?.issuerId, asIssuer(1));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update clears matchAccountId when sent an explicit null", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "VIREMENT",
          matchAccountId: asAccount(7),
        },
      });
      const cleared = yield* client.rules.update({
        path: { id: created.id },
        payload: { matchAccountId: null },
      });
      assert.strictEqual(cleared.matchAccountId, undefined);
      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchAccountId, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update leaves matchAccountId untouched when the key is absent", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "VIREMENT",
          matchAccountId: asAccount(7),
        },
      });
      const updated = yield* client.rules.update({
        path: { id: created.id },
        payload: { pattern: "VIRMT" },
      });
      assert.strictEqual(updated.pattern, "VIRMT");
      assert.strictEqual(updated.matchAccountId, asAccount(7));
    }).pipe(Effect.provide(HttpLive)),
  );
});

// The Sign matcher, same terms again. Zero-amount fall-through and the rest of
// the sign semantics are engine-matrix cases, not wire cases.
describe("rule sign matcher", () => {
  it.effect("create echoes matchSign and getById round-trips it", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "CARTE",
          matchSign: "negative",
        },
      });
      assert.strictEqual(created.matchSign, "negative");
      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchSign, "negative");
    }).pipe(Effect.provide(HttpLive)),
  );

  // A purchase and its refund share a raw issuer string; the two sign-scoped
  // rules split them at import.
  it.effect("sign-scoped rules split a purchase from its refund", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.rules.create({
        payload: {
          issuerId: asIssuer(4),
          pattern: "CARTE FNAC",
          matchSign: "negative",
        },
      });
      yield* client.rules.create({
        payload: {
          issuerId: asIssuer(5),
          pattern: "CARTE FNAC",
          matchSign: "positive",
        },
      });

      const [spend, refund] = yield* client.transactions.bulkCreate({
        payload: {
          records: [
            tx({ rawIssuerString: "CARTE FNAC PARIS", amount: -40 }),
            tx({ rawIssuerString: "CARTE FNAC PARIS", amount: 40 }),
          ],
        },
      });
      assert.strictEqual(spend?.issuerId, asIssuer(4));
      assert.strictEqual(refund?.issuerId, asIssuer(5));
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update clears matchSign when sent an explicit null", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "CARTE",
          matchSign: "negative",
        },
      });
      const cleared = yield* client.rules.update({
        path: { id: created.id },
        payload: { matchSign: null },
      });
      assert.strictEqual(cleared.matchSign, undefined);
      const fetched = yield* client.rules.getById({ path: { id: created.id } });
      assert.strictEqual(fetched.matchSign, undefined);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("update leaves matchSign untouched when the key is absent", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const created = yield* client.rules.create({
        payload: {
          issuerId: asIssuer(1),
          pattern: "CARTE",
          matchSign: "negative",
        },
      });
      const updated = yield* client.rules.update({
        path: { id: created.id },
        payload: { pattern: "CB" },
      });
      assert.strictEqual(updated.pattern, "CB");
      assert.strictEqual(updated.matchSign, "negative");
    }).pipe(Effect.provide(HttpLive)),
  );
});
