import { assert, describe, it } from "@effect/vitest";
import {
  AccountId,
  IssuerId,
  Rule,
  RuleId,
  Transaction,
  TransactionId,
} from "@mamen/shared/contract";
import {
  derive,
  deleteLists,
  issuerAssignmentDiff,
  type MatchOutcome,
  ownedCounts,
  previewLists,
} from "./issuer-matcher";

/**
 * The **pure matching engine** (issue #158) — `derive`, `ownedCounts`,
 * `previewLists`, `deleteLists` and `issuerAssignmentDiff` (issue #160), called
 * directly.
 *
 * Everything below is a plain function over domain objects, so there is no
 * server, no database and no Effect layer anywhere in this file. That is what
 * makes the matrices **exhaustive** rather than sampled: a case costs a
 * `new RegExp` and an array scan, roughly a thousandth of the HTTP round trip
 * the same assertion needed when the engine was only reachable through its
 * endpoints.
 *
 * What the engine owns, and therefore what is pinned here:
 * - the **specificity** order two competing rules are ranked by, including
 *   every tie-break under it — a wrong tie-break raises no error, it just hands
 *   the row to a different rule;
 * - the **skipped rule**: an uncompilable pattern is reported, never thrown and
 *   never silently dropped;
 * - the **Issuer invariant** — manual wins, else the specificity winner among
 *   the matching rules, else unmatched — across every predicate family and
 *   combination, and the owned counts derived from those outcomes;
 * - the two dry-runs, whose whole job is to say what a save or a delete *would*
 *   do before it does it;
 * - the **recompute diff** — which rows a settled derivation actually has to
 *   write, and, above all, that a recompute settling on what is already stored
 *   writes nothing at all (issue #160).
 */

const asAccount = AccountId.make;
const asIssuer = IssuerId.make;

/** The default rule birthday; the tie-break cases state their own. */
const CREATED = new Date("2026-01-01T00:00:00.000Z");
const NEWER = new Date("2026-06-01T00:00:00.000Z");
const IMPORTED = new Date("2026-07-15T12:00:00.000Z");

/**
 * A Matching Rule with the three optional predicates absent by default — the
 * plain regex rule every predicate case below is a narrowing of.
 */
const rule = (over: {
  id: number;
  pattern?: string;
  issuerId?: number;
  matchValue?: number;
  matchAccountId?: number;
  matchSign?: "positive" | "negative";
  createdAt?: Date;
}): Rule =>
  new Rule({
    id: RuleId.make(over.id),
    issuerId: asIssuer(over.issuerId ?? 10),
    pattern: over.pattern ?? "amazon",
    matchValue: over.matchValue,
    matchAccountId: over.matchAccountId === undefined ? undefined : asAccount(over.matchAccountId),
    matchSign: over.matchSign,
    createdAt: over.createdAt ?? CREATED,
  });

/** A transaction: a debit on account 1, unmatched and not hand-assigned. */
const row = (over: {
  id: number;
  rawIssuerString?: string;
  amount?: number;
  accountId?: number;
  issuerId?: number;
  manualIssuer?: boolean;
}): Transaction =>
  new Transaction({
    id: TransactionId.make(over.id),
    accountId: asAccount(over.accountId ?? 1),
    date: IMPORTED,
    amount: over.amount ?? -42.5,
    rawIssuerString: over.rawIssuerString ?? "AMAZON EU SARL",
    issuerId: over.issuerId === undefined ? undefined : asIssuer(over.issuerId),
    manualIssuer: over.manualIssuer,
    importedAt: IMPORTED,
    importMonth: "2026-07",
  });

/** The id of the rule that won `r`, or `null` when none did. */
const winnerOf = (r: Transaction, rules: ReadonlyArray<Rule>): number | null =>
  derive([r], rules).outcomes[0]?.matchedRuleId ?? null;

/** Whether the lone `rule` claims `r` — the four-part predicate, read alone. */
const matches = (r: Transaction, only: Rule): boolean => winnerOf(r, [only]) !== null;

const ids = (rows: ReadonlyArray<Transaction>): ReadonlyArray<number> => rows.map((t) => t.id);

/** Branded ids widened to plain numbers, so an expectation reads as literals. */
const plain = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs];

/** A `MatchOutcome` built from plain numbers — the whole verdict, compared at once. */
const outcome = (transactionId: number, issuerId: number | null, matchedRuleId: number | null) => ({
  transactionId: TransactionId.make(transactionId),
  issuerId: issuerId === null ? null : asIssuer(issuerId),
  matchedRuleId: matchedRuleId === null ? null : RuleId.make(matchedRuleId),
});

/** The verdict every "no rule claimed this row" case expects. */
const unmatched = (transactionId: number) => outcome(transactionId, null, null);

// ---------------------------------------------------------------------------
// 1. Specificity and compilation
// ---------------------------------------------------------------------------

/**
 * The comparator, exercised through the only door it has: which of two rules
 * that both match a row is handed that row. Three tiers, in order — predicate
 * count, then literal pattern length, then `createdAt`.
 *
 * This is the thinnest logic in the feature and the most likely to be silently
 * wrong, because getting it wrong produces no error: the row simply lands on a
 * different issuer. Every pair below is asserted in **both input orders**, so a
 * comparator that accidentally depended on array position would fail rather
 * than pass half the time.
 */
describe("specificity: which of two matching rules wins", () => {
  // Every predicate on these rules is satisfied by `contested`, so a rule with
  // any subset of them matches it — which is what makes the counts comparable.
  const contested = row({ id: 1, amount: -42.5, accountId: 1 });

  /** A rule carrying exactly `n` of the three optional predicates. */
  const withPredicates = (id: number, n: number): Rule =>
    rule({
      id,
      matchValue: n >= 1 ? 42.5 : undefined,
      matchAccountId: n >= 2 ? 1 : undefined,
      matchSign: n >= 3 ? "negative" : undefined,
    });

  /**
   * Assert `expected` wins over the pair, whichever order they arrive in.
   *
   * Both rules are first checked to claim the row on their own: a comparator
   * case where the loser never matched — because its pattern was mistyped, or
   * did not compile — would otherwise pass without comparing anything.
   */
  const beats = (expected: Rule, loser: Rule, why: string) => {
    assert.ok(matches(contested, expected), `${why}: the winner matches the row at all`);
    assert.ok(matches(contested, loser), `${why}: the loser matches the row at all`);
    assert.strictEqual(winnerOf(contested, [expected, loser]), expected.id, why);
    assert.strictEqual(winnerOf(contested, [loser, expected]), expected.id, `${why} (reversed)`);
  };

  // Tier 1, exhaustively: all six ordered pairs of distinct predicate counts.
  // More predicates means a strictly narrower matched set, so the narrower rule
  // takes the row (issue #90's generalisation of #42's binary value tier).
  it("hands the row to the rule carrying more predicates, for every pair of counts", () => {
    for (let fewer = 0; fewer <= 3; fewer++) {
      for (let more = fewer + 1; more <= 3; more++) {
        beats(
          withPredicates(more, more),
          withPredicates(fewer, fewer),
          `${more} predicates over ${fewer}`,
        );
      }
    }
  });

  // Tier 1 sits *above* tier 2: a one-predicate rule with a three-letter
  // pattern still outranks a predicate-less rule with a long one.
  it("weighs predicate count above literal length", () => {
    beats(
      rule({ id: 1, pattern: "ama", matchValue: 42.5 }),
      rule({ id: 2, pattern: "amazon eu sarl" }),
      "one predicate over eleven more literal characters",
    );
  });

  // Two rules carrying the same *number* of *different* predicates are not
  // ordered by kind — neither matched set is a subset of the other, so there is
  // no correct winner to compute. They fall through to the tiers below, and
  // here the account-scoped rule's longer pattern settles it.
  it("does not rank predicate kinds against each other", () => {
    beats(
      rule({ id: 1, pattern: "amazon eu", matchAccountId: 1 }),
      rule({ id: 2, pattern: "amazon", matchSign: "negative" }),
      "same count, different kinds — literal length decides",
    );
  });

  // Tier 2: at equal predicate count, the longer literal wins — the more of the
  // string a pattern spells out, the fewer rows it can match.
  it("breaks a predicate-count tie on literal pattern length", () => {
    beats(
      rule({ id: 1, pattern: "amazon eu" }),
      rule({ id: 2, pattern: "amazon" }),
      "nine literal characters over six",
    );
    // The same tie, one tier up: predicates equal at one each.
    beats(
      rule({ id: 1, pattern: "amazon eu", matchValue: 42.5 }),
      rule({ id: 2, pattern: "amazon", matchValue: 42.5 }),
      "nine literal characters over six, both value-scoped",
    );
  });

  // Length is measured in *literal* characters: metacharacters spell out
  // nothing, so a longer pattern string can be the less specific rule.
  it("counts only non-metacharacter length, so a longer pattern can lose", () => {
    // "a.*n eu" is 7 characters but spells out 5; "amazon" is 6 and spells 6.
    beats(
      rule({ id: 1, pattern: "amazon" }),
      rule({ id: 2, pattern: "a.*n eu" }),
      "six literal characters over a longer pattern spelling five",
    );
    // Every metacharacter the measure strips, in one 22-character pattern that
    // spells out exactly "amazon" — so it ties the plain six-character rule on
    // length and loses on createdAt rather than winning on length.
    beats(
      rule({ id: 1, pattern: "amazon", createdAt: NEWER }),
      rule({ id: 2, pattern: "^(a)m[a]z\\.?.*o+|n?${}", createdAt: CREATED }),
      "every metacharacter is stripped before the lengths are compared",
    );
  });

  // Tier 3: with nothing left to separate them, the newer rule wins — the last
  // thing the user wrote is the thing they most recently meant.
  it("breaks a full tie on the newer rule", () => {
    beats(
      rule({ id: 1, issuerId: 11, createdAt: NEWER }),
      rule({ id: 2, issuerId: 12, createdAt: CREATED }),
      "the newer of two identical rules",
    );
  });

  // Past the last tier there is nothing left to compare, so the winner is the
  // first of the two in the rule set. Pinned because it is the one case where
  // the answer is positional: two rules identical down to the millisecond can
  // only be separated arbitrarily, and it should at least be stable.
  it("keeps the first rule when even createdAt ties", () => {
    const first = rule({ id: 1, issuerId: 11 });
    const second = rule({ id: 2, issuerId: 12 });
    assert.strictEqual(winnerOf(contested, [first, second]), 1);
    assert.strictEqual(winnerOf(contested, [second, first]), 2);
  });

  // The winner is the *most specific* matching rule, not the most specific rule
  // in the set: a narrower rule that does not match the row never displaces one
  // that does.
  it("ranks only the rules that actually match the row", () => {
    const narrow = rule({ id: 1, pattern: "amazon", matchValue: 9.99, issuerId: 11 });
    const broad = rule({ id: 2, pattern: "amazon", issuerId: 12 });
    assert.strictEqual(winnerOf(contested, [narrow, broad]), 2);
  });
});

/**
 * Compilation. A pattern is the user's text, so an unfinishable one is an
 * ordinary state to be reported — not a 500, and not a rule that quietly stops
 * working. `derive` names the rules it could not compile, and carries on with
 * the rest.
 */
describe("compilation: a pattern that will not compile", () => {
  const BROKEN = "[unclosed";

  it("skips the rule and reports it by id", () => {
    const { outcomes, skippedRuleIds } = derive(
      [row({ id: 1 })],
      [rule({ id: 7, pattern: BROKEN })],
    );
    assert.deepStrictEqual(plain(skippedRuleIds), [7]);
    // Reported *and* skipped: the row it would have claimed is unmatched.
    assert.deepStrictEqual(outcomes, [unmatched(1)]);
  });

  it("leaves every rule that did compile working", () => {
    const { outcomes, skippedRuleIds } = derive(
      [row({ id: 1 })],
      [rule({ id: 7, pattern: BROKEN, issuerId: 11 }), rule({ id: 8, issuerId: 12 })],
    );
    assert.deepStrictEqual(plain(skippedRuleIds), [7]);
    assert.strictEqual(outcomes[0]?.matchedRuleId, 8);
    assert.strictEqual(outcomes[0]?.issuerId, 12);
  });

  // A broken rule is not merely unable to win — it takes no part at all, so the
  // row falls to the next-best *matching* rule rather than becoming unmatched
  // because the specificity winner happened to be the broken one.
  it("does not let a broken rule out-specify a working one", () => {
    // Were it compiled, `amazon eu(` would win on literal length.
    const { outcomes } = derive(
      [row({ id: 1 })],
      [rule({ id: 7, pattern: "amazon eu(", issuerId: 11 }), rule({ id: 8, issuerId: 12 })],
    );
    assert.strictEqual(outcomes[0]?.matchedRuleId, 8);
  });

  it("reports several broken rules in rule-set order", () => {
    const { skippedRuleIds } = derive(
      [],
      [
        rule({ id: 7, pattern: BROKEN }),
        rule({ id: 8 }),
        rule({ id: 9, pattern: "*nope" }),
        rule({ id: 10, pattern: "(?<" }),
      ],
    );
    assert.deepStrictEqual(plain(skippedRuleIds), [7, 9, 10]);
  });

  it("reports nothing when every pattern compiles", () => {
    const { skippedRuleIds } = derive([row({ id: 1 })], [rule({ id: 1 }), rule({ id: 2 })]);
    assert.deepStrictEqual(plain(skippedRuleIds), []);
  });
});

// ---------------------------------------------------------------------------
// 2. Rule ownership
// ---------------------------------------------------------------------------

/**
 * The four-part match predicate — pattern, Value, Account, Sign — one family at
 * a time, then every combination of the three optional ones.
 */
describe("ownership: the pattern", () => {
  it("matches case-insensitively", () => {
    assert.ok(matches(row({ id: 1, rawIssuerString: "AMAZON EU SARL" }), rule({ id: 1 })));
    assert.ok(matches(row({ id: 1, rawIssuerString: "amazon eu sarl" }), rule({ id: 1 })));
    assert.ok(matches(row({ id: 1, rawIssuerString: "AmAzOn" }), rule({ id: 1 })));
  });

  it("matches anywhere in the raw string, not only at its start", () => {
    assert.ok(matches(row({ id: 1, rawIssuerString: "CB 0912 AMAZON EU" }), rule({ id: 1 })));
  });

  it("leaves a row no pattern matches unmatched", () => {
    const { outcomes } = derive([row({ id: 1, rawIssuerString: "CARREFOUR" })], [rule({ id: 1 })]);
    assert.deepStrictEqual(outcomes, [unmatched(1)]);
  });

  it("reads the pattern as a regex, not as a literal", () => {
    const r = rule({ id: 1, pattern: "^(amazon|amzn)" });
    assert.ok(matches(row({ id: 1, rawIssuerString: "AMZN MKTP" }), r));
    assert.ok(
      !matches(row({ id: 1, rawIssuerString: "CB AMZN MKTP" }), r),
      "anchored at the start",
    );
  });
});

describe("ownership: the Value matcher", () => {
  const valued = rule({ id: 1, matchValue: 6.99 });

  it("admits an amount whose magnitude equals it to the cent", () => {
    assert.ok(matches(row({ id: 1, amount: -6.99 }), valued));
  });

  // Sign-agnostic by design (ADR 0004): the matcher is a magnitude, so one rule
  // covers a subscription and its refund.
  it("is sign-agnostic — a credit of the same magnitude matches", () => {
    assert.ok(matches(row({ id: 1, amount: 6.99 }), valued));
  });

  it("rejects any other magnitude", () => {
    assert.ok(!matches(row({ id: 1, amount: -6.98 }), valued));
    assert.ok(!matches(row({ id: 1, amount: -69.9 }), valued));
    assert.ok(!matches(row({ id: 1, amount: 0 }), valued));
  });

  // Money is compared in integer cents everywhere in this app. A float `===`
  // would miss the row below, which is a perfectly ordinary 0.30.
  it("compares in integer cents, never as floats", () => {
    assert.ok(matches(row({ id: 1, amount: -(0.1 + 0.2) }), rule({ id: 1, matchValue: 0.3 })));
  });

  it("admits every amount when absent", () => {
    for (const amount of [-6.99, 0, 6.99, -1234.56]) {
      assert.ok(matches(row({ id: 1, amount }), rule({ id: 1 })), `${amount}`);
    }
  });
});

describe("ownership: the Account matcher", () => {
  const scoped = rule({ id: 1, matchAccountId: 1 });

  it("admits a row in the account it names", () => {
    assert.ok(matches(row({ id: 1, accountId: 1 }), scoped));
  });

  // The account is part of the *match*, not of a query scope — so the rule can
  // never claim the same raw issuer string in another account (issue #90).
  it("rejects a row in any other account", () => {
    assert.ok(!matches(row({ id: 1, accountId: 2 }), scoped));
  });

  it("admits every account when absent", () => {
    assert.ok(matches(row({ id: 1, accountId: 2 }), rule({ id: 1 })));
  });
});

describe("ownership: the Sign matcher", () => {
  const positive = rule({ id: 1, matchSign: "positive" });
  const negative = rule({ id: 1, matchSign: "negative" });

  it("splits money-in from money-out", () => {
    assert.ok(matches(row({ id: 1, amount: 42.5 }), positive));
    assert.ok(!matches(row({ id: 1, amount: -42.5 }), positive));
    assert.ok(matches(row({ id: 1, amount: -42.5 }), negative));
    assert.ok(!matches(row({ id: 1, amount: 42.5 }), negative));
  });

  // Zero matches neither (ADR 0009): a bundle that nets out is not income, and
  // falling through to the user's sign-less rule is the safe direction.
  it("gives a zero amount to neither sign", () => {
    assert.ok(!matches(row({ id: 1, amount: 0 }), positive));
    assert.ok(!matches(row({ id: 1, amount: 0 }), negative));
  });

  it("lets a zero amount fall through to a sign-less rule", () => {
    const zero = row({ id: 1, amount: 0 });
    assert.strictEqual(winnerOf(zero, [negative, rule({ id: 2, issuerId: 12 })]), 2);
  });

  it("admits every sign when absent", () => {
    for (const amount of [-42.5, 0, 42.5]) {
      assert.ok(matches(row({ id: 1, amount }), rule({ id: 1 })), `${amount}`);
    }
  });
});

/**
 * All eight combinations of the three optional predicates, each against a row
 * that satisfies every one of them and against the three rows that break
 * exactly one. A rule must claim a row iff every predicate it *carries* admits
 * it — the predicates it does not carry admit everything, which is the half a
 * sampled test tends to leave unstated.
 */
describe("ownership: every predicate combination", () => {
  /** The row every predicate admits. */
  const conforming = row({ id: 1, amount: -42.5, accountId: 1 });

  // Each entry breaks exactly one predicate and satisfies the other two: the
  // +42.5 row still has magnitude 42.5 and sits in account 1, and the -42.51
  // row is still a negative in account 1.
  const FAMILIES = [
    {
      name: "Value",
      on: { matchValue: 42.5 },
      breaker: row({ id: 2, amount: -42.51, accountId: 1 }),
    },
    {
      name: "Account",
      on: { matchAccountId: 1 },
      breaker: row({ id: 3, amount: -42.5, accountId: 2 }),
    },
    {
      name: "Sign",
      on: { matchSign: "negative" as const },
      breaker: row({ id: 4, amount: 42.5, accountId: 1 }),
    },
  ];

  for (let mask = 0; mask < 8; mask++) {
    const carried = FAMILIES.filter((_, i) => (mask & (1 << i)) !== 0);
    const name = carried.length === 0 ? "no predicate" : carried.map((f) => f.name).join(" + ");

    it(`claims what ${name} admits, and nothing else`, () => {
      const combined = rule({
        id: 1,
        ...Object.assign({}, ...carried.map((f) => f.on)),
      });
      assert.ok(matches(conforming, combined), "the conforming row");
      for (const family of FAMILIES) {
        const claimed = matches(family.breaker, combined);
        // Carried ⇒ the breaker is out of scope; not carried ⇒ still admitted.
        assert.strictEqual(
          claimed,
          !carried.includes(family),
          `${family.name}-breaking row under "${name}"`,
        );
      }
      // The pattern is never optional: no predicate combination rescues a row
      // the regex does not match.
      assert.ok(!matches(row({ id: 5, rawIssuerString: "CARREFOUR" }), combined));
    });
  }
});

/**
 * Step (a) of the Issuer invariant, which sits above all of the above: a hand-
 * assigned issuer is never touched by a rule, however specific.
 */
describe("ownership: manual assignment", () => {
  it("keeps a hand-picked issuer against a matching rule", () => {
    const manual = row({ id: 1, issuerId: 99, manualIssuer: true });
    const { outcomes } = derive([manual], [rule({ id: 1, issuerId: 10 })]);
    assert.deepStrictEqual(outcomes, [outcome(1, 99, null)]);
  });

  // No rule id, even though a rule matched: the row is nobody's, so it counts
  // toward nobody's owned total.
  it("beats even the most specific rule in the set", () => {
    const manual = row({ id: 1, issuerId: 99, manualIssuer: true, amount: -42.5 });
    const { outcomes } = derive(
      [manual],
      [
        rule({ id: 1, issuerId: 10 }),
        rule({ id: 2, issuerId: 11, matchValue: 42.5, matchAccountId: 1, matchSign: "negative" }),
      ],
    );
    assert.strictEqual(outcomes[0]?.issuerId, 99);
    assert.strictEqual(outcomes[0]?.matchedRuleId, null);
  });

  // A row can be manual *and* issuer-less — the flag says "the rules are not in
  // charge of this row", which is a decision in its own right.
  it("reports a manual row with no issuer as unmatched, not as rule-matched", () => {
    const { outcomes } = derive([row({ id: 1, manualIssuer: true })], [rule({ id: 1 })]);
    assert.deepStrictEqual(outcomes, [unmatched(1)]);
  });

  it("leaves an ordinary row's stored issuer to be re-derived", () => {
    // `manualIssuer` absent: the stored issuer is a rule's past output, so the
    // current rule set decides afresh — here, that it belongs to nobody.
    const stale = row({ id: 1, issuerId: 99, rawIssuerString: "CARREFOUR" });
    const { outcomes } = derive([stale], [rule({ id: 1 })]);
    assert.deepStrictEqual(outcomes, [unmatched(1)]);
  });
});

/**
 * `ownedCounts` — the tally of the outcomes above, and the number every rules
 * endpoint reports. Derived on read, so it must fall of its own accord when a
 * more specific sibling takes the rows away.
 */
describe("owned counts", () => {
  const rows = [
    row({ id: 1, rawIssuerString: "AMAZON EU", amount: -42.5 }),
    row({ id: 2, rawIssuerString: "AMAZON MKTP", amount: -6.99 }),
    row({ id: 3, rawIssuerString: "AMAZON PRIME", amount: -6.99 }),
    row({ id: 4, rawIssuerString: "CARREFOUR", amount: -30 }),
    row({ id: 5, rawIssuerString: "AMAZON EU", issuerId: 99, manualIssuer: true }),
  ];
  const broad = rule({ id: 1, pattern: "amazon", issuerId: 10 });
  const valued = rule({ id: 2, pattern: "amazon", matchValue: 6.99, issuerId: 11 });

  it("counts the rows each rule actually won", () => {
    const counts = ownedCounts(rows, [broad, valued]);
    // The two 6.99 rows go to the value rule; only the 42.5 one is left broad.
    assert.strictEqual(counts.get(1), 1);
    assert.strictEqual(counts.get(2), 2);
  });

  it("agrees with the outcomes it is derived from", () => {
    const { outcomes } = derive(rows, [broad, valued]);
    const counted = new Map<number, number>();
    for (const o of outcomes) {
      if (o.matchedRuleId === null) continue;
      counted.set(o.matchedRuleId, (counted.get(o.matchedRuleId) ?? 0) + 1);
    }
    assert.deepStrictEqual(ownedCounts(rows, [broad, valued]), counted);
  });

  // Manual and unmatched rows belong to no rule, so the totals do not add up to
  // the row count — and should not.
  it("counts neither the manual row nor the unmatched one", () => {
    const counts = ownedCounts(rows, [broad, valued]);
    assert.strictEqual(
      [...counts.values()].reduce((a, b) => a + b, 0),
      3,
    );
  });

  it("reports zero for a rule that won nothing, rather than nothing at all", () => {
    const counts = ownedCounts(rows, [broad, valued, rule({ id: 3, pattern: "spotify" })]);
    assert.ok(counts.has(3), "the rule is present");
    assert.strictEqual(counts.get(3), 0);
  });

  it("gives a rule zero once a more specific sibling out-specifies it", () => {
    assert.strictEqual(ownedCounts(rows, [broad]).get(1), 3);
    const sharper = rule({ id: 3, pattern: "amazon", matchSign: "negative", issuerId: 12 });
    assert.strictEqual(ownedCounts(rows, [broad, sharper]).get(1), 0);
    assert.strictEqual(ownedCounts(rows, [broad, sharper]).get(3), 3);
  });

  it("reads an empty rule set and an empty table as an empty tally", () => {
    assert.strictEqual(ownedCounts(rows, []).size, 0);
    assert.deepStrictEqual(ownedCounts([], [broad]), new Map([[1, 0]]));
  });
});

// ---------------------------------------------------------------------------
// 3. Dry runs
// ---------------------------------------------------------------------------

/**
 * `previewLists` — what saving one rule *would* do, per bucket. The split that
 * matters is create versus update: an edit **replaces** its stored self in the
 * rule set, a create is **added** beside every rule already there. Get that
 * wrong and an edit previews as changing nothing, because the rule's own
 * pre-edit self is sitting in the set out-specifying it.
 */
describe("save preview: the update branch", () => {
  // The stored rule spells out the whole string; the edit shortens it. Under
  // the correct branch the shortened rule is the only rule and wins its rows;
  // if it competed against its stored self, that self would win on length.
  const stored = rule({ id: 1, pattern: "amazon prime", issuerId: 10 });
  const edited = rule({ id: 1, pattern: "amazon", issuerId: 20 });
  const rows = [row({ id: 1, rawIssuerString: "AMAZON PRIME VIDEO", issuerId: 10 })];

  it("replaces the stored rule rather than competing against it", () => {
    const lists = previewLists(rows, [stored], edited, true);
    assert.deepStrictEqual(ids(lists.willReassign), [1], "the row moves to the new issuer");
    assert.deepStrictEqual(lists.willMatch, []);
  });

  // The same inputs down the create branch: the stored rule stays in the set
  // and out-specifies the prospective one, so the row is in no bucket. This is
  // the branch itself, isolated — the only difference between the two calls.
  it("differs from the create branch on exactly that point", () => {
    const asCreate = previewLists(rows, [stored], edited, false);
    assert.deepStrictEqual(asCreate.willMatch, []);
    assert.deepStrictEqual(asCreate.willReassign, []);
  });

  // Only its *own* stored self is swapped out: every other rule still competes,
  // so an edit that stays less specific than a sibling correctly previews as
  // changing nothing.
  it("still competes against every other rule", () => {
    const sibling = rule({ id: 2, pattern: "amazon prime video", issuerId: 30 });
    const lists = previewLists(rows, [stored, sibling], edited, true);
    assert.deepStrictEqual(lists.willMatch, []);
    assert.deepStrictEqual(lists.willReassign, []);
  });

  it("reports a widened edit's new rows as willMatch", () => {
    const newlyCovered = row({ id: 2, rawIssuerString: "AMAZON EU" });
    const lists = previewLists([...rows, newlyCovered], [stored], edited, true);
    assert.deepStrictEqual(ids(lists.willMatch), [2]);
    assert.deepStrictEqual(ids(lists.willReassign), [1]);
  });
});

describe("save preview: the create branch", () => {
  // A create's rule is synthesised as the newest rule, exactly as the insert
  // will be — so it takes the rows it ties for.
  const prospective = rule({ id: 0, pattern: "amazon", issuerId: 20, createdAt: NEWER });

  it("adds the rule beside the existing set", () => {
    const existing = rule({ id: 1, pattern: "amazon", issuerId: 10, createdAt: CREATED });
    const rows = [row({ id: 1, rawIssuerString: "AMAZON EU", issuerId: 10 })];
    const lists = previewLists(rows, [existing], prospective, false);
    assert.deepStrictEqual(ids(lists.willReassign), [1], "newer rule takes the tie");
  });

  it("splits unmatched rows from rows another issuer holds", () => {
    const rows = [
      row({ id: 1, rawIssuerString: "AMAZON EU" }),
      row({ id: 2, rawIssuerString: "AMAZON MKTP", issuerId: 10 }),
    ];
    const existing = rule({ id: 1, pattern: "amazon mktp", issuerId: 10, createdAt: CREATED });
    // The prospective rule out-specifies nothing here — it is shorter than the
    // existing rule, so row 2 stays where it is and only row 1 moves.
    const lists = previewLists(rows, [existing], prospective, false);
    assert.deepStrictEqual(ids(lists.willMatch), [1]);
    assert.deepStrictEqual(lists.willReassign, []);
  });

  // A row already sitting on this rule's issuer is no visible change, so it
  // belongs to neither list — the preview reports consequences, not coverage.
  it("leaves a row already on this issuer out of both lists", () => {
    const rows = [row({ id: 1, rawIssuerString: "AMAZON EU", issuerId: 20 })];
    const lists = previewLists(rows, [], prospective, false);
    assert.deepStrictEqual(lists.willMatch, []);
    assert.deepStrictEqual(lists.willReassign, []);
    assert.deepStrictEqual(lists.manualCollisions, []);
  });

  it("collects the hand-assigned rows it will not touch", () => {
    const rows = [
      row({ id: 1, rawIssuerString: "AMAZON EU", issuerId: 99, manualIssuer: true }),
      row({ id: 2, rawIssuerString: "AMAZON MKTP" }),
    ];
    const lists = previewLists(rows, [], prospective, false);
    assert.deepStrictEqual(ids(lists.manualCollisions), [1]);
    assert.deepStrictEqual(ids(lists.willMatch), [2]);
  });

  // Scope is the *whole* predicate, not the pattern alone: a row the rule's
  // Account or Value matcher excludes is in no bucket at all.
  it("scopes every bucket by the rule's own predicates", () => {
    const scoped = rule({
      id: 0,
      pattern: "amazon",
      issuerId: 20,
      matchAccountId: 2,
      createdAt: NEWER,
    });
    const rows = [
      row({ id: 1, rawIssuerString: "AMAZON EU", accountId: 1 }),
      row({ id: 2, rawIssuerString: "AMAZON EU", accountId: 2 }),
      row({ id: 3, rawIssuerString: "AMAZON EU", accountId: 1, manualIssuer: true, issuerId: 99 }),
    ];
    const lists = previewLists(rows, [], scoped, false);
    assert.deepStrictEqual(ids(lists.willMatch), [2]);
    assert.deepStrictEqual(lists.manualCollisions, [], "the manual row is out of scope too");
  });

  // A rule that matches nothing previews as three empty lists — a legitimate
  // answer ("this rule would do nothing"), and deliberately not a skipped rule.
  it("previews an empty rule as empty lists, not as a skipped one", () => {
    const lists = previewLists(
      [row({ id: 1, rawIssuerString: "CARREFOUR" })],
      [],
      prospective,
      false,
    );
    assert.strictEqual(lists.skipped, false);
    assert.deepStrictEqual(lists.willMatch, []);
  });

  it("reports an uncompilable prospective pattern as skipped, with empty lists", () => {
    const broken = rule({ id: 0, pattern: "[unclosed", issuerId: 20 });
    const lists = previewLists([row({ id: 1 })], [], broken, false);
    assert.deepStrictEqual(lists, {
      willMatch: [],
      willReassign: [],
      manualCollisions: [],
      skipped: true,
    });
  });
});

/**
 * `deleteLists` — the consequences of removing one rule, split by what happens
 * to each row it had won: another rule catches it (`willReassign`), or nothing
 * does (`willUnmatch`). The two are a different conversation with the user, so
 * they are two lists rather than one count.
 */
describe("delete preview", () => {
  const broad = rule({ id: 1, pattern: "amazon", issuerId: 10 });
  const specific = rule({ id: 2, pattern: "amazon prime", issuerId: 11 });
  // The table as the current rule set leaves it: row 1 to the specific rule,
  // row 2 to the broad one.
  const rows = [
    row({ id: 1, rawIssuerString: "AMAZON PRIME VIDEO", issuerId: 11 }),
    row({ id: 2, rawIssuerString: "AMAZON EU", issuerId: 10 }),
  ];

  it("lists the rows another rule catches as willReassign", () => {
    const lists = deleteLists(rows, [broad, specific], RuleId.make(2));
    assert.deepStrictEqual(ids(lists.willReassign), [1], "falls back to the broad rule");
    assert.deepStrictEqual(lists.willUnmatch, []);
  });

  it("lists the rows nothing catches as willUnmatch", () => {
    const lists = deleteLists(rows, [broad, specific], RuleId.make(1));
    assert.deepStrictEqual(ids(lists.willUnmatch), [2]);
    // Row 1 keeps the specific rule, so deleting the broad one leaves it alone.
    assert.deepStrictEqual(lists.willReassign, []);
  });

  it("splits both ways in one delete", () => {
    // Two rows on the broad rule: one also matched by a narrower survivor, one
    // matched by nothing else.
    const survivor = rule({ id: 3, pattern: "prime", issuerId: 12 });
    const lists = deleteLists(rows, [broad, survivor], RuleId.make(1));
    assert.deepStrictEqual(ids(lists.willReassign), [1]);
    assert.deepStrictEqual(ids(lists.willUnmatch), [2]);
  });

  // The lists are about the issuer, not the rule: a fallback rule pointing at
  // the same issuer changes nothing the user would see.
  it("omits a row whose fallback rule carries the same issuer", () => {
    const sameIssuer = rule({ id: 2, pattern: "amazon prime", issuerId: 10 });
    const onSameIssuer = [row({ id: 1, rawIssuerString: "AMAZON PRIME VIDEO", issuerId: 10 })];
    const lists = deleteLists(onSameIssuer, [broad, sameIssuer], RuleId.make(2));
    assert.deepStrictEqual(lists.willReassign, []);
    assert.deepStrictEqual(lists.willUnmatch, []);
  });

  // A delete never touches a hand-picked issuer, so a manual row cannot appear
  // in either list — even one the deleted rule's pattern matches.
  it("never lists a hand-assigned row", () => {
    const manual = row({ id: 3, rawIssuerString: "AMAZON EU", issuerId: 99, manualIssuer: true });
    const lists = deleteLists([...rows, manual], [broad, specific], RuleId.make(1));
    // Row 2 is unmatched by the delete; row 3 carries the same raw string and
    // an issuer no rule would give it, and is still in neither list.
    assert.deepStrictEqual(ids(lists.willUnmatch), [2]);
    assert.deepStrictEqual(lists.willReassign, []);
  });

  it("reports nothing for a rule that owns nothing", () => {
    const idle = rule({ id: 4, pattern: "spotify", issuerId: 13 });
    const lists = deleteLists(rows, [broad, specific, idle], RuleId.make(4));
    assert.deepStrictEqual(lists.willReassign, []);
    assert.deepStrictEqual(lists.willUnmatch, []);
  });
});

// ---------------------------------------------------------------------------
// 4. The recompute diff
// ---------------------------------------------------------------------------

/** The diff as plain `[id, issuer]` pairs, so an expectation reads as literals. */
const pairs = (
  rows: ReadonlyArray<Transaction>,
  outcomes: ReadonlyArray<MatchOutcome>,
): ReadonlyArray<readonly [number, number | null]> =>
  issuerAssignmentDiff(rows, outcomes).map((a) => [a.transactionId as number, a.issuerId] as const);

/** The rows as the diff's writes would leave them — what the next recompute reads. */
const applied = (
  rows: ReadonlyArray<Transaction>,
  outcomes: ReadonlyArray<MatchOutcome>,
): ReadonlyArray<Transaction> => {
  const byId = new Map(
    issuerAssignmentDiff(rows, outcomes).map((a) => [a.transactionId as number, a.issuerId]),
  );
  return rows.map((r) =>
    byId.has(r.id) ? new Transaction({ ...r, issuerId: byId.get(r.id) ?? undefined }) : r,
  );
};

/**
 * `issuerAssignmentDiff` — the decision half of the recompute (issue #160):
 * given the rows as stored and the outcomes derived over them, which rows have
 * actually changed issuer and therefore need writing. The service builds one
 * `UPDATE` per entry and executes them; nothing else decides what is written.
 *
 * The case worth having is the empty one. A recompute runs after every rule
 * create, edit and delete, over the whole table, and derives every row whether
 * it moved or not — so the difference between a no-op and a table-wide rewrite
 * is this filter and nothing else.
 */
describe("the recompute diff", () => {
  it("skips a row whose derived issuer is the one it already stores", () => {
    const settled = row({ id: 1, issuerId: 10 });
    assert.deepStrictEqual(pairs([settled], [outcome(1, 10, 1)]), []);
  });

  it("writes a row that has just gained an issuer", () => {
    const orphan = row({ id: 1 });
    assert.deepStrictEqual(pairs([orphan], [outcome(1, 10, 1)]), [[1, 10]]);
  });

  it("writes a null onto a row that has lost its issuer", () => {
    const owned = row({ id: 1, issuerId: 10 });
    // The column is cleared, not left holding an issuer no rule justifies.
    assert.deepStrictEqual(pairs([owned], [unmatched(1)]), [[1, null]]);
  });

  it("writes a row that has changed hands between two issuers", () => {
    const owned = row({ id: 1, issuerId: 10 });
    assert.deepStrictEqual(pairs([owned], [outcome(1, 11, 2)]), [[1, 11]]);
  });

  // A stored `null` and a derived `null` are the same decision, however each
  // side spells it — the row is nobody's, and no `UPDATE` says so again.
  it("skips a row that was unmatched and stayed unmatched", () => {
    assert.deepStrictEqual(pairs([row({ id: 1 })], [unmatched(1)]), []);
  });

  it("keeps only the rows that moved, in the order the outcomes came in", () => {
    const rows = [
      row({ id: 1, issuerId: 10 }), // settled
      row({ id: 2 }), // gains
      row({ id: 3, issuerId: 12 }), // loses
      row({ id: 4, issuerId: 13 }), // changes hands
    ];
    assert.deepStrictEqual(
      pairs(rows, [outcome(1, 10, 1), outcome(2, 11, 2), unmatched(3), outcome(4, 14, 3)]),
      [
        [2, 11],
        [3, null],
        [4, 14],
      ],
    );
  });

  it("reads an empty table as an empty diff", () => {
    assert.deepStrictEqual(pairs([], []), []);
  });

  /**
   * The same filter, fed from a real derivation rather than hand-written
   * outcomes — a recompute of a table the current rule set has already settled.
   */
  describe("a recompute that changes nothing", () => {
    const broad = rule({ id: 1, pattern: "amazon", issuerId: 10 });
    const valued = rule({ id: 2, pattern: "amazon", matchValue: 6.99, issuerId: 11 });
    const rules = [broad, valued];
    // The table exactly as those two rules leave it: the 6.99 row on the value
    // rule, the other on the broad one, one row nothing matches, and one hand-
    // assigned row carrying an issuer no rule would ever give it.
    const settled = [
      row({ id: 1, rawIssuerString: "AMAZON EU", amount: -42.5, issuerId: 10 }),
      row({ id: 2, rawIssuerString: "AMAZON MKTP", amount: -6.99, issuerId: 11 }),
      row({ id: 3, rawIssuerString: "CARREFOUR", amount: -30 }),
      row({ id: 4, rawIssuerString: "AMAZON EU", issuerId: 99, manualIssuer: true }),
    ];

    it("produces no writes at all", () => {
      const { outcomes } = derive(settled, rules);
      assert.deepStrictEqual(issuerAssignmentDiff(settled, outcomes), []);
    });

    it("still produces none on the pass after one that did write", () => {
      // The unsettled table: every row's issuer is wrong or missing.
      const unsettled = [
        row({ id: 1, rawIssuerString: "AMAZON EU", amount: -42.5 }),
        row({ id: 2, rawIssuerString: "AMAZON MKTP", amount: -6.99, issuerId: 10 }),
        row({ id: 3, rawIssuerString: "CARREFOUR", amount: -30, issuerId: 10 }),
        row({ id: 4, rawIssuerString: "AMAZON EU", issuerId: 99, manualIssuer: true }),
      ];
      const first = derive(unsettled, rules).outcomes;
      assert.deepStrictEqual(
        issuerAssignmentDiff(unsettled, first).map((a) => a.transactionId as number),
        [1, 2, 3],
        "three rows move; the manual one never does",
      );
      // Recompute over the rows those writes leave behind: the derivation is a
      // fixed point, so the second pass writes nothing.
      const written = applied(unsettled, first);
      const second = derive(written, rules).outcomes;
      assert.deepStrictEqual(issuerAssignmentDiff(written, second), []);
    });

    it("never writes a hand-assigned row, whatever the rules say", () => {
      // The manual row alone, against a rule whose pattern matches it and whose
      // issuer differs: `derive` hands back the row's own issuer, so no write.
      const manual = settled[3];
      assert.ok(manual !== undefined);
      const { outcomes } = derive([manual], rules);
      assert.deepStrictEqual(issuerAssignmentDiff([manual], outcomes), []);
    });
  });
});
