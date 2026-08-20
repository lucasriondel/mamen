import { SqlClient, SqlSchema } from "@effect/sql";
import type {
  IssuerId,
  RuleCreate,
  RuleDeletePreviewResult,
  RulePreviewInput,
  RulePreviewResult,
  RuleUpdate,
} from "@mamen/shared/contract";
import {
  AccountId,
  mergeRuleUpdate,
  NotFound,
  Rule,
  RuleId,
  type RuleSign,
  RuleView,
  Transaction,
  TransactionId,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";
import { RuleFromRow } from "../rules/repository";
import { TransactionFromRow } from "../transactions/repository";

/**
 * A rule whose regex compiled cleanly, paired with its live `RegExp` (built once
 * per matching pass, `"i"` for case-insensitivity).
 */
type CompiledRule = { rule: Rule; regex: RegExp };

/**
 * The outcome of compiling the current rule set: the ones that compiled, and the
 * ids of the ones whose pattern threw (surfaced to the user as *skipped rules*,
 * never a 500). Order of `compiled` follows the input rule order.
 */
type CompiledSet = {
  compiled: ReadonlyArray<CompiledRule>;
  skippedRuleIds: ReadonlyArray<typeof RuleId.Type>;
};

/**
 * The per-row match verdict from {@link derive}. `issuerId` is the resolved
 * issuer (`null` = unmatched); `matchedRuleId` is the winning rule (`null` when
 * manual or unmatched) — used to tally each rule's owned rows
 * ({@link ownedCounts}), never stored on the row (the engine is stateless: a row
 * records *that* a rule set its issuer via `manualIssuer = false`, not *which*).
 */
export type MatchOutcome = {
  transactionId: typeof Transaction.Type.id;
  issuerId: typeof IssuerId.Type | null;
  matchedRuleId: typeof RuleId.Type | null;
};

/**
 * A {@link MatchOutcome} a rule actually won: both `issuerId` and `matchedRuleId`
 * present. The subset that drives the import path's issuer writes (manual and
 * unmatched outcomes have no rule behind them).
 */
type AssignedOutcome = MatchOutcome & {
  issuerId: typeof IssuerId.Type;
  matchedRuleId: typeof RuleId.Type;
};

/** Regex metacharacters stripped when measuring a pattern's literal length. */
const META = /[.*+?^${}()|[\]\\]/g;

/** Specificity = count of literal (non-metachar) characters left in the pattern. */
const literalLength = (pattern: string): number => pattern.replace(META, "").length;

/** An amount magnitude in whole cents — the sign-agnostic key value-matching compares. */
const cents = (amount: number): number => Math.round(Math.abs(amount) * 100);

/**
 * How many of the three optional predicates a rule carries (0–3) — the
 * comparator's top tier (issue #90). Each one narrows the rule's matched set to
 * a strict subset, so more predicates means more specific.
 */
const predicateCount = (rule: Rule): number =>
  (rule.matchValue != null ? 1 : 0) +
  (rule.matchAccountId != null ? 1 : 0) +
  (rule.matchSign != null ? 1 : 0);

/**
 * Whether a rule's Value matcher admits a row's amount: a rule without one
 * admits every amount; a value-rule admits only amounts whose magnitude equals
 * `matchValue` to the cent (never a float `===`; sign-agnostic — magnitude vs
 * magnitude). Issue #42 / ADR 0004.
 */
const valueMatches = (rule: Rule, amount: number): boolean =>
  rule.matchValue == null || cents(amount) === cents(rule.matchValue);

/**
 * Whether a rule's Account matcher admits a row's account: a rule without one
 * admits every account; an account-rule admits only its own. The account is part
 * of the *match*, not merely of a query scope, so a rule can never claim a row
 * outside the account it names (issue #90).
 */
const accountMatches = (rule: Rule, accountId: typeof Transaction.Type.accountId): boolean =>
  rule.matchAccountId == null || rule.matchAccountId === accountId;

/**
 * Whether a rule's Sign matcher admits a row's amount: a rule without one admits
 * every amount; `positive` admits `amount > 0`, `negative` admits `amount < 0`.
 * **Zero matches neither** — a bundle netting out is not income, so it falls
 * through to the user's sign-less rule (issue #90 / ADR 0009).
 */
const signMatches = (rule: Rule, amount: number): boolean =>
  rule.matchSign == null || (rule.matchSign === "positive" ? amount > 0 : amount < 0);

/**
 * Order two matching rules by specificity: the rule carrying **more optional
 * predicates** outranks the one carrying fewer (it matches a strict subset —
 * issue #90's generalisation of #42's binary value-tier), *above* literal
 * length; then the longer literal; then the newer rule (`createdAt`). `< 0` means
 * `a` wins, `> 0` means `b` wins.
 *
 * Two rules with the same pattern and the same *number* of *different*
 * predicates (`amazon`+account vs `amazon`+sign) tie here and fall through to
 * literal length, then `createdAt`. Accepted: neither matched set is a subset of
 * the other, so there is no correct winner to compute, and a declared priority
 * between predicate kinds would hide an arbitrary choice in a constant.
 */
const compareSpecificity = (a: Rule, b: Rule): number => {
  const pa = predicateCount(a);
  const pb = predicateCount(b);
  if (pa !== pb) return pb - pa;
  const la = literalLength(a.pattern);
  const lb = literalLength(b.pattern);
  if (la !== lb) return lb - la;
  return b.createdAt.getTime() - a.createdAt.getTime();
};

/**
 * Compile a rule set: `new RegExp(pattern, "i")` per rule, each guarded by
 * try/catch so an invalid pattern becomes a *skipped rule* instead of throwing.
 */
const compile = (rules: ReadonlyArray<Rule>): CompiledSet => {
  const compiled: Array<CompiledRule> = [];
  const skippedRuleIds: Array<typeof RuleId.Type> = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, regex: new RegExp(rule.pattern, "i") });
    } catch {
      skippedRuleIds.push(rule.id);
    }
  }
  return { compiled, skippedRuleIds };
};

/**
 * The row fields the match predicate reads — the raw issuer string plus the two
 * columns the optional predicates ask about. A whole `Transaction` satisfies it;
 * naming it keeps the predicate from growing another positional parameter each
 * time a predicate is added.
 *
 * These three are the *per-row* part of the Owned count's input set; the whole
 * set (six things, with the two counter-example lists) is stated on
 * {@link derive}.
 */
type MatchRow = Pick<typeof Transaction.Type, "rawIssuerString" | "amount" | "accountId">;

/**
 * Whether a compiled rule matches a row — the **four-part** predicate every
 * match path routes through (issue #90, extending #42's two-part one): the
 * pattern matches the raw issuer string, **and** the Value matcher admits the
 * amount magnitude, **and** the Account matcher admits the row's account,
 * **and** the Sign matcher admits the amount's sign. An absent predicate admits
 * everything.
 */
const ruleMatchesRow = (c: CompiledRule, row: MatchRow): boolean =>
  c.regex.test(row.rawIssuerString) &&
  valueMatches(c.rule, row.amount) &&
  accountMatches(c.rule, row.accountId) &&
  signMatches(c.rule, row.amount);

/**
 * The specificity-winner among the rules that match a row (see
 * {@link ruleMatchesRow}), or `undefined` when none match. Pure — the core of
 * the Issuer invariant's step (b).
 */
const winnerFor = (row: MatchRow, compiled: ReadonlyArray<CompiledRule>): Rule | undefined => {
  const matching = compiled.filter((c) => ruleMatchesRow(c, row));
  if (matching.length === 0) return undefined;
  return matching.reduce((best, cur) => (compareSpecificity(best.rule, cur.rule) <= 0 ? best : cur))
    .rule;
};

/**
 * Derive the correct issuer for a set of rows against a rule set, per the
 * **Issuer invariant**: (a) a `manualIssuer` row keeps its issuer (manual wins);
 * else (b) the specificity-winner among matching rules; else (c) unmatched
 * (`issuerId: null`). Pure and mode-agnostic — the single routine both dry-run
 * and commit paths call. Exported for direct unit reasoning; the feature's
 * behaviour is tested at the API boundary.
 *
 * **The Owned count's input set is this function's, and it is six things**
 * (issue #166): row existence, `manualIssuer`, `rawIssuerString`, `amount`,
 * `accountId`, and the rule set itself. The count is derived on every read
 * ({@link ownedCounts}) and never stored — the `matchCount` column went in
 * migration `0017_drop_rules_match_count` — so it is a function of those six as
 * they stand *now*, and of nothing else.
 *
 * The inverse is the half worth writing down, because it has been derived and
 * refuted twice: **a write touching none of the six cannot change an Owned
 * count.** `transferGroupId` (transfer link / unlink / dismiss), `categoryId`
 * and `manualCategory` (a category override), `excludedFromRecap` and
 * `manualExcluded` (recap exclusion), and an issuer's own `excludedFromRecap`
 * recap flag all change how a row is *displayed or aggregated* — none is read
 * here, so none moves ownership, and the mutations confined to them correctly
 * invalidate the transactions cache without the rules one.
 *
 * The same six-field list, in the same words, is in `packages/api/CONTEXT.md`
 * (**Owned-count input set**) and — since issue #170 replaced the "any mutation
 * that moves rows" superset this comment exists to narrow — in
 * `packages/web/CONTEXT.md`, which holds the cache-invalidation rule that
 * follows from it.
 */
export const derive = (
  rows: ReadonlyArray<Transaction>,
  rules: ReadonlyArray<Rule>,
): {
  outcomes: ReadonlyArray<MatchOutcome>;
  skippedRuleIds: ReadonlyArray<typeof RuleId.Type>;
} => {
  const { compiled, skippedRuleIds } = compile(rules);
  const outcomes = rows.map((row): MatchOutcome => {
    if (row.manualIssuer) {
      // (a) manual assignment wins — never touched by a rule.
      return {
        transactionId: row.id,
        issuerId: row.issuerId ?? null,
        matchedRuleId: null,
      };
    }
    const winner = winnerFor(row, compiled);
    return winner === undefined
      ? { transactionId: row.id, issuerId: null, matchedRuleId: null } // (c)
      : {
          transactionId: row.id,
          issuerId: winner.issuerId,
          matchedRuleId: winner.id,
        }; // (b)
  });
  return { outcomes, skippedRuleIds };
};

/**
 * Tally how many rows each rule *won*, keyed by rule id — every rule in `rules`
 * is present (a rule that won nothing maps to `0`, never a missing key). Manual
 * and unmatched outcomes carry no rule and so count for nobody.
 */
const tally = (
  outcomes: ReadonlyArray<MatchOutcome>,
  rules: ReadonlyArray<Rule>,
): Map<number, number> => {
  const counts = new Map<number, number>(rules.map((r) => [r.id as number, 0]));
  for (const o of outcomes) {
    if (o.matchedRuleId === null) continue;
    counts.set(o.matchedRuleId, (counts.get(o.matchedRuleId) ?? 0) + 1);
  }
  return counts;
};

/**
 * How many transactions each rule **currently owns** (issue #63): re-derive the
 * whole table against the whole rule set and count the rows each rule wins.
 *
 * Derived, never stored — the number is a function of the rows and the rule set
 * as they are *now*, so it falls of its own accord when a more specific sibling
 * out-specifies the rule, a row is hand-assigned away, or a transaction is
 * deleted. The whole rule set must be passed even when only some rules' counts
 * are wanted: ownership is decided by specificity across every matching rule.
 */
export const ownedCounts = (
  rows: ReadonlyArray<Transaction>,
  rules: ReadonlyArray<Rule>,
): Map<number, number> => tally(derive(rows, rules).outcomes, rules);

/**
 * The three preview lists for one scoped pattern — `Transaction`s bucketed by how
 * the prospective rule would touch them. Pure; the API surface decides the shape.
 */
export type PreviewLists = {
  willMatch: ReadonlyArray<Transaction>;
  willReassign: ReadonlyArray<Transaction>;
  manualCollisions: ReadonlyArray<Transaction>;
  skipped: boolean;
};

/**
 * Dry-run the scoped edit of a **single rule** against the current table, per the
 * Issuer invariant — the pure core behind the `rules` preview endpoint. `prospective`
 * is the rule in its edited state (its own `RegExp` decides scope); `isUpdate`
 * means it *replaces* the same-`id` rule in `currentRules` (an edit), otherwise it
 * is *added* as a new, newest rule (a create). Every bucket is scoped to rows the
 * prospective pattern matches:
 * - `manualCollisions` — the row is `manualIssuer` (rule never touches it);
 * - `willMatch` / `willReassign` — the prospective rule is the **full-set
 *   specificity winner** for the row (beats every matching rule), splitting on
 *   whether the row is currently unmatched (`issuerId == null`) or owned by a
 *   *different* issuer. A row already owned by this rule's issuer is no visible
 *   change and appears in neither list.
 *
 * An invalid prospective pattern compiles to nothing (`skipped: true`) → all lists
 * empty, mirroring the skipped-rule path (never a throw).
 */
export const previewLists = (
  rows: ReadonlyArray<Transaction>,
  currentRules: ReadonlyArray<Rule>,
  prospective: Rule,
  isUpdate: boolean,
): PreviewLists => {
  // The prospective rule set: an edit swaps the same-id rule in place; a create
  // appends the (newest) rule. Specificity is decided over this whole set.
  const ruleSet = isUpdate
    ? currentRules.map((r) => (r.id === prospective.id ? prospective : r))
    : [...currentRules, prospective];

  const { compiled } = compile(ruleSet);
  // Reference-identity, not id: `compile` preserves each rule object, so the
  // prospective's compiled entry is the one whose `.rule` *is* `prospective`.
  // Absent ⇒ its pattern failed to compile → skipped rule, empty lists.
  const prospectiveEntry = compiled.find((c) => c.rule === prospective);
  if (prospectiveEntry === undefined) {
    return {
      willMatch: [],
      willReassign: [],
      manualCollisions: [],
      skipped: true,
    };
  }

  const willMatch: Array<Transaction> = [];
  const willReassign: Array<Transaction> = [];
  const manualCollisions: Array<Transaction> = [];
  for (const row of rows) {
    // Scope: only rows this one rule matches — pattern AND each predicate it
    // carries (issues #42, #90) — are ever in a bucket. A present predicate
    // narrows the scope, leaving the three buckets as-is; a rule that is empty
    // by construction (say, a pattern scoped to an account holding no such rows)
    // previews as three empty lists, not as a skipped rule.
    if (!ruleMatchesRow(prospectiveEntry, row)) continue;
    if (row.manualIssuer) {
      manualCollisions.push(row);
      continue;
    }
    // The full-set winner must be *this* rule, else the edit changes nothing
    // for the row (a more-specific rule already/still owns it).
    if (winnerFor(row, compiled) !== prospective) continue;
    if (row.issuerId == null) {
      willMatch.push(row);
    } else if (row.issuerId !== prospective.issuerId) {
      willReassign.push(row);
    }
  }
  return { willMatch, willReassign, manualCollisions, skipped: false };
};

/**
 * The two consequence lists of deleting one rule (PRD #8 stories 17–18) — pure
 * core behind the `rules` delete-preview endpoint and the shape the commit
 * settles to. Re-derives every row against the **remaining** rules (the target
 * removed) and diffs it against the row's current issuer:
 * - `willReassign` — the row falls back to a *different* issuer (the next-best
 *   specificity winner among the rules that remain);
 * - `willUnmatch` — the row becomes unmatched (no other rule matches).
 *
 * Only rows the deleted rule had won can move: removing a non-winning rule never
 * changes a row's winner. Manual rows (`manualIssuer = true`) are skipped
 * outright — a delete never touches a hand-picked issuer (the Issuer invariant).
 */
export type DeletePreviewLists = {
  willReassign: ReadonlyArray<Transaction>;
  willUnmatch: ReadonlyArray<Transaction>;
};

export const deleteLists = (
  rows: ReadonlyArray<Transaction>,
  currentRules: ReadonlyArray<Rule>,
  ruleId: typeof RuleId.Type,
): DeletePreviewLists => {
  const remaining = currentRules.filter((r) => r.id !== ruleId);
  // Re-derive the whole table without the target rule; the outcome is the
  // row's issuer *after* the delete.
  const after = new Map(
    derive(rows, remaining).outcomes.map((o) => [o.transactionId as number, o.issuerId ?? null]),
  );

  const willReassign: Array<Transaction> = [];
  const willUnmatch: Array<Transaction> = [];
  for (const row of rows) {
    if (row.manualIssuer) continue; // a delete never touches a manual pick.
    const before = row.issuerId ?? null;
    const now = after.get(row.id) ?? null;
    if (before === now) continue; // the target wasn't this row's winner.
    if (now === null) willUnmatch.push(row);
    else willReassign.push(row);
  }
  return { willReassign, willUnmatch };
};

/** A rule paired with its owned-row count — the {@link RuleView} on the wire. */
const toView = (rule: Rule, counts: Map<number, number>): RuleView =>
  new RuleView({ ...rule, ownedCount: counts.get(rule.id) ?? 0 });

/**
 * `IssuerMatcher` — the server-side matching engine (ADR 0001: matching over
 * stored transactions runs where the data lives). It owns the Issuer invariant
 * and the commit path; regex runs in JS (never SQL) so an invalid pattern is a
 * skipped rule, not a crash. Depends only on `SqlClient` — it reads the current
 * rule set and writes issuer assignments directly, so a whole commit fits in one
 * SQLite transaction. The **account** delete lives here too (issue #90): it
 * cascades into the rules scoped to that account, and the recompute those rule
 * deletes require is this service's own.
 *
 * Tested exclusively through the API boundary (import matching via `bulkCreate`),
 * per the PRD's single-seam bias — no isolated engine seam.
 */
export class IssuerMatcher extends Effect.Service<IssuerMatcher>()("api/IssuerMatcher", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // The whole rule set, decoded through the shared row codec. Small by
    // design (tens of rules); ordering is irrelevant to specificity.
    const allRulesQuery = SqlSchema.findAll({
      Request: Schema.Void,
      Result: RuleFromRow,
      execute: () => sql`SELECT * FROM rules`,
    });

    // The whole transaction table — the retroactive scope every rule
    // create/edit recomputes over (current volume is trivially small; PRD
    // #8 defers large-history perf). Decoded through the shared row codec.
    const allTransactionsQuery = SqlSchema.findAll({
      Request: Schema.Void,
      Result: TransactionFromRow,
      execute: () => sql`SELECT * FROM transactions`,
    });

    const ruleByIdQuery = SqlSchema.findOne({
      Request: RuleId,
      Result: RuleFromRow,
      execute: (id) => sql`SELECT * FROM rules WHERE id = ${id}`,
    });

    // The rule insert/update mirror `RuleRepo`'s, but live here so a rule
    // write and the recompute it triggers share one `withTransaction`.
    // The written columns: the rule's own fields, each optional predicate
    // null-folded (issues #42, #90).
    type RuleWriteRow = {
      issuerId: number;
      pattern: string;
      matchValue: number | null;
      matchAccountId: number | null;
      matchSign: RuleSign | null;
      createdAt: string;
    };

    const insertRuleQuery = SqlSchema.single({
      Request: Schema.Any as Schema.Schema<RuleWriteRow>,
      Result: RuleFromRow,
      execute: (row) => sql`INSERT INTO rules ${sql.insert(row)} RETURNING *`,
    });

    const updateRuleQuery = SqlSchema.single({
      Request: Schema.Any as Schema.Schema<RuleWriteRow & { id: typeof RuleId.Type }>,
      Result: RuleFromRow,
      execute: (row) =>
        sql`UPDATE rules SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
    });

    // The account lookup behind the cascading delete's 404 — it lives here
    // (like the rule insert/update above) so the account delete, the rule
    // deletes it cascades into and the recompute share one `withTransaction`.
    const accountByIdQuery = SqlSchema.findOne({
      Request: AccountId,
      Result: Schema.Struct({ id: Schema.Number }),
      execute: (id) => sql`SELECT id FROM accounts WHERE id = ${id}`,
    });

    const txByIdQuery = SqlSchema.findOne({
      Request: TransactionId,
      Result: TransactionFromRow,
      execute: (id) => sql`SELECT * FROM transactions WHERE id = ${id}`,
    });

    const nowIso = Clock.currentTimeMillis.pipe(
      Effect.map((millis) => new Date(millis).toISOString()),
    );

    /**
     * The `issuerId` writes that bring the whole table back to the Issuer
     * invariant — one `UPDATE` per row whose derived issuer differs from its
     * stored one (a `null` winner clears the column). Manual rows derive to
     * their current issuer, so they never produce a write.
     */
    const issuerWrites = (
      rows: ReadonlyArray<Transaction>,
      outcomes: ReadonlyArray<MatchOutcome>,
    ) => {
      const current = new Map(rows.map((r) => [r.id as number, r.issuerId ?? null]));
      return outcomes
        .filter((o) => (o.issuerId ?? null) !== current.get(o.transactionId))
        .map(
          (o) =>
            sql`UPDATE transactions SET issuerId = ${o.issuerId} WHERE id = ${o.transactionId}`,
        );
    };

    /**
     * Recompute every transaction's issuer against the (already-written) rule
     * set and apply the diff. Meant to run *inside* a caller's
     * `withTransaction` so the rule write and its retroactive fallout commit
     * atomically (all-or-nothing).
     *
     * Returns the settled owned-row tally ({@link ownedCounts}) — the same
     * derivation the writes come from, so the caller can report a saved rule's
     * `ownedCount` without a second pass over the table (issue #63).
     */
    const recomputeIssuers = Effect.gen(function* () {
      const rules = yield* allRulesQuery();
      const rows = yield* allTransactionsQuery();
      const { outcomes } = derive(rows, rules);
      const writes = issuerWrites(rows, outcomes);
      if (writes.length > 0) {
        yield* Effect.all(writes, { discard: true });
      }
      return tally(outcomes, rules);
    });

    /**
     * The current owned-row tally for **every** rule, off one pass over the
     * table — the read-side half of issue #63. The whole rule set is read even
     * when one rule's count is wanted: ownership is decided by specificity
     * across every matching rule, so a rule outside the caller's page can
     * still be the reason this one owns nothing.
     *
     * Costs the same pass every rule write already makes; at current volumes
     * that beats keeping a cached column honest.
     */
    const ownedCountsNow = Effect.gen(function* () {
      const rules = yield* allRulesQuery();
      const rows = yield* allTransactionsQuery();
      return ownedCounts(rows, rules);
    }).pipe(orDieSql);

    /**
     * Stamp each rule with the number of transactions it currently owns, the
     * shape every rules endpoint answers with. An empty input short-circuits,
     * so an issuer with no rules reads nothing.
     */
    const withOwnedCounts = (rules: ReadonlyArray<Rule>): Effect.Effect<ReadonlyArray<RuleView>> =>
      rules.length === 0
        ? Effect.succeed([])
        : ownedCountsNow.pipe(Effect.map((counts) => rules.map((rule) => toView(rule, counts))));

    /** {@link withOwnedCounts} for a single rule (the by-id style reads). */
    const withOwnedCount = (rule: Rule): Effect.Effect<RuleView> =>
      ownedCountsNow.pipe(Effect.map((counts) => toView(rule, counts)));

    /**
     * Match a freshly-imported batch of rows against the current rule set and
     * apply the result atomically: every winning rule sets its row's
     * `issuerId`. All writes run in a single `withTransaction` —
     * all-or-nothing. Returns the rows with their assigned issuers so the
     * `bulkCreate` 201 body reflects the DB state. A manual row
     * (`manualIssuer = true`) is never reassigned. Nothing is written *onto*
     * the rules: what each rule owns is derived on read (issue #63).
     */
    const matchImported = (rows: ReadonlyArray<Transaction>) =>
      Effect.gen(function* () {
        if (rows.length === 0) return rows;

        const rules = yield* allRulesQuery();
        const { outcomes } = derive(rows, rules);

        // The issuer writes — only rows a rule actually won.
        const assigned = outcomes.filter(
          (o): o is AssignedOutcome => o.matchedRuleId !== null && o.issuerId !== null,
        );

        if (assigned.length > 0) {
          yield* sql.withTransaction(
            Effect.all(
              assigned.map(
                // `manualIssuer = 0` is written alongside the issuer: a
                // rule-assigned row is, by definition, not a manual pick
                // (issue #10). Manual rows never reach here — `derive`
                // filters them out (the Issuer invariant, step (a)).
                (o) =>
                  sql`UPDATE transactions SET issuerId = ${o.issuerId}, manualIssuer = 0 WHERE id = ${o.transactionId}`,
              ),
              { discard: true },
            ),
          );
        }

        // Reflect the assignments onto the returned rows (issuer only —
        // `manualIssuer` stays false, matching set it).
        const byId = new Map(assigned.map((o) => [o.transactionId as number, o.issuerId]));
        return rows.map((row) => {
          const issuerId = byId.get(row.id);
          return issuerId === undefined ? row : new Transaction({ ...row, issuerId });
        });
        // A `SqlError` (query/tx) or `ParseError` (rule-row decode) is not
        // client-actionable → dies as a 500 ({@link orDieSql}), never leaked.
      }).pipe(orDieSql);

    /**
     * Dry-run a create/update of the single rule described by `input`
     * (`ruleId` present ⇒ edit, absent ⇒ create), returning the three scoped
     * lists ({@link previewLists}). Reads the current rules + whole table; a
     * create's prospective rule is synthesised as the newest rule (so it wins
     * specificity ties, exactly as the real insert will), an edit reuses the
     * stored rule's `id`/`createdAt` with the new pattern + issuer. `NotFound`
     * when an edit names a missing rule. Purely advisory — no writes.
     */
    const preview = (
      input: RulePreviewInput,
    ): Effect.Effect<typeof RulePreviewResult.Type, NotFound> =>
      // `orDieSql` covers only the reads (infra errors die); the `NotFound`
      // below is introduced *after* it, so it survives to the wire as a 404.
      Effect.all({
        rules: allRulesQuery(),
        rows: allTransactionsQuery(),
      }).pipe(
        orDieSql,
        Effect.flatMap(({ rules, rows }) =>
          Effect.gen(function* () {
            if (input.ruleId !== undefined) {
              const existing = rules.find((r) => r.id === input.ruleId);
              if (existing === undefined) {
                return yield* Effect.fail(new NotFound({ resource: "rule", id: input.ruleId }));
              }
              const prospective = new Rule({
                ...existing,
                issuerId: input.issuerId,
                pattern: input.pattern,
                // The input carries the rule's whole prospective state, so an
                // absent predicate means the edited rule doesn't carry it (not
                // "keep the stored one") — issues #42, #90.
                matchValue: input.matchValue,
                matchAccountId: input.matchAccountId,
                matchSign: input.matchSign,
              });
              return previewLists(rows, rules, prospective, true);
            }

            // A create's rule doesn't exist yet: synthesise it as the
            // newest rule (max `createdAt`) so specificity ties resolve to
            // it, mirroring the real insert. The sentinel `id` never
            // collides — the winner is matched by reference, not id.
            const now = yield* nowIso;
            const prospective = new Rule({
              id: RuleId.make(0),
              issuerId: input.issuerId,
              pattern: input.pattern,
              matchValue: input.matchValue,
              matchAccountId: input.matchAccountId,
              matchSign: input.matchSign,
              createdAt: new Date(now),
            });
            return previewLists(rows, rules, prospective, false);
          }),
        ),
      );

    /**
     * Apply-on-save for a **create**: insert the rule and recompute the whole
     * table against the resulting rule set, all in one `withTransaction` (the
     * commit is atomic and recomputes from *current* state, never trusting a
     * stale preview). Returns the created rule already carrying the rows it
     * just claimed (`ownedCount`, straight off the recompute — issue #63).
     */
    const applyRuleCreate = (payload: RuleCreate) =>
      nowIso.pipe(
        Effect.flatMap((now) =>
          sql.withTransaction(
            Effect.gen(function* () {
              const created = yield* insertRuleQuery({
                issuerId: payload.issuerId,
                pattern: payload.pattern,
                matchValue: payload.matchValue ?? null,
                matchAccountId: payload.matchAccountId ?? null,
                matchSign: payload.matchSign ?? null,
                createdAt: now,
              });
              const counts = yield* recomputeIssuers;
              return toView(created, counts);
            }),
          ),
        ),
        orDieSql,
      );

    /**
     * Apply-on-save for an **update**: merge `changes` onto the stored rule
     * (preserving `createdAt`), write it, and recompute the whole table — one
     * atomic `withTransaction`. The returned rule carries the post-edit
     * `ownedCount` off that same recompute (issue #63). 404s when `id` is
     * missing (`getById` semantics).
     */
    const applyRuleUpdate = (id: typeof RuleId.Type, changes: RuleUpdate) =>
      ruleByIdQuery(id).pipe(
        orDieSql,
        Effect.flatMap((found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new NotFound({ resource: "rule", id })),
            onSome: (current) =>
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    const merged = mergeRuleUpdate(current, changes);
                    const updated = yield* updateRuleQuery({
                      id,
                      issuerId: merged.issuerId,
                      pattern: merged.pattern,
                      matchValue: merged.matchValue ?? null,
                      matchAccountId: merged.matchAccountId ?? null,
                      matchSign: merged.matchSign ?? null,
                      createdAt: merged.createdAt.toISOString(),
                    });
                    const counts = yield* recomputeIssuers;
                    return toView(updated, counts);
                  }),
                )
                .pipe(orDieSql),
          }),
        ),
      );

    /**
     * Dry-run the **delete** of the rule `id`: read the current rules + whole
     * table and report the full consequence set ({@link deleteLists}) — the
     * rows that will change issuer (`willReassign`) or become unmatched
     * (`willUnmatch`) once the rule is gone. `NotFound` when `id` names a
     * missing rule. Purely advisory — no writes.
     */
    const previewDelete = (
      id: typeof RuleId.Type,
    ): Effect.Effect<typeof RuleDeletePreviewResult.Type, NotFound> =>
      // `orDieSql` covers only the reads; the `NotFound` introduced after it
      // survives to the wire as a 404 (mirrors `preview`).
      Effect.all({
        rules: allRulesQuery(),
        rows: allTransactionsQuery(),
      }).pipe(
        orDieSql,
        Effect.flatMap(({ rules, rows }) =>
          rules.some((r) => r.id === id)
            ? Effect.succeed(deleteLists(rows, rules, id))
            : Effect.fail(new NotFound({ resource: "rule", id })),
        ),
      );

    /**
     * Apply-on-save for a **delete**: remove the rule and recompute the whole
     * table against the remaining rules, all in one `withTransaction` (atomic;
     * recomputes from *current* state, never a stale preview). Rows the rule
     * had won fall back to the next-best rule or become unmatched; manual rows
     * are untouched (`recomputeIssuers` derives them to their own issuer → no
     * write). 404s when `id` is missing. Returns void (204).
     */
    const applyRuleDelete = (id: typeof RuleId.Type) =>
      ruleByIdQuery(id).pipe(
        orDieSql,
        Effect.flatMap((found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new NotFound({ resource: "rule", id })),
            onSome: () =>
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* sql`DELETE FROM rules WHERE id = ${id}`;
                    yield* recomputeIssuers;
                  }),
                )
                .pipe(orDieSql, Effect.asVoid),
          }),
        ),
      );

    /**
     * Delete the account `id`, cascading into the Matching Rules whose
     * **Account matcher** names it, and recompute the whole table — the
     * account delete, the rule deletes and `recomputeIssuers` in **one**
     * `withTransaction` (all-or-nothing), so the Issuer invariant never holds
     * transiently-wrong state (issue #90).
     *
     * The recompute is the load-bearing half: `applyRuleDelete` already pairs
     * every rule delete with one precisely so the rows that rule had won fall
     * back to the next-best rule or become unmatched. A cascade that deleted
     * rules without recomputing would leave those rows holding a stale
     * `issuerId` no surviving rule justifies.
     *
     * Rules are matched by column, not by the caller's list, so a rule scoped
     * to any other account is untouched. 404s when `id` is missing (the
     * pre-cascade `remove` semantics). Returns void (204).
     */
    const applyAccountDelete = (id: typeof AccountId.Type) =>
      accountByIdQuery(id).pipe(
        orDieSql,
        Effect.flatMap((found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new NotFound({ resource: "account", id })),
            onSome: () =>
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    yield* sql`DELETE FROM accounts WHERE id = ${id}`;
                    yield* sql`DELETE FROM rules WHERE matchAccountId = ${id}`;
                    yield* recomputeIssuers;
                  }),
                )
                .pipe(orDieSql, Effect.asVoid),
          }),
        ),
      );

    /**
     * The preview's per-row "remove manual issuer" action (PRD #8 story 10):
     * clear the row's manual flag, then re-derive *that row* against the
     * current rule set — it becomes unmatched, or is claimed by an existing
     * rule if one matches (the invariant still holds). Atomic; returns the
     * updated row. 404s when the id is missing.
     */
    const removeManualIssuer = (id: typeof TransactionId.Type) =>
      txByIdQuery(id).pipe(
        orDieSql,
        Effect.flatMap((found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new NotFound({ resource: "transaction", id })),
            onSome: (current) =>
              Effect.gen(function* () {
                const rules = yield* allRulesQuery();
                // Re-derive with the manual flag dropped: the row is now
                // rule-eligible, so `derive` gives it the current winner (or
                // null when no rule matches).
                const cleared = new Transaction({
                  ...current,
                  manualIssuer: false,
                  issuerId: undefined,
                });
                const { outcomes } = derive([cleared], rules);
                const resolved = outcomes[0]?.issuerId ?? null;
                // One atomic write clears the manual flag and sets the
                // re-derived issuer (`NULL` = unmatched).
                yield* sql.withTransaction(
                  sql`UPDATE transactions SET issuerId = ${resolved}, manualIssuer = 0 WHERE id = ${id}`,
                );
                // `cleared` already carries the dropped flag + null issuer;
                // only stamp the re-derived issuer when a rule claimed it.
                return resolved === null
                  ? cleared
                  : new Transaction({ ...cleared, issuerId: resolved });
              }).pipe(orDieSql),
          }),
        ),
      );

    return {
      derive,
      withOwnedCount,
      withOwnedCounts,
      matchImported,
      preview,
      previewDelete,
      applyRuleCreate,
      applyRuleUpdate,
      applyRuleDelete,
      applyAccountDelete,
      removeManualIssuer,
    } as const;
  }),
}) {}
