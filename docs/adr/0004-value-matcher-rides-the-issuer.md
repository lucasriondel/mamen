# The Value matcher rides the issuer

A Matching Rule gains an optional **Value matcher** — a positive amount magnitude
`matchValue`. When set, the rule matches a row only if its `pattern` matches the
raw issuer string **and** the row's amount magnitude equals `matchValue` to the
cent. When absent, the rule is a plain regex rule, byte-identical to the pre-#42
behaviour. The point is to let one issuer-string fork by amount — the recurring
Amazon `6.99` subscription goes to a narrow issuer while the rest of Amazon stays
on the broad one.

## The category rides the issuer, never the rule

A rule assigns **only an issuer** (the **Issuer invariant** / **Derived
category** in `CONTEXT-MAP.md`), and the Value matcher does not change that. To
give the `6.99` rows their own category you point the value-rule at a **narrower
Issuer** carrying its own `defaultCategoryId` — the category is derived through
that issuer, exactly as for every other row. No category is ever carried on the
rule, so there is no second derivation path to keep in sync, and re-categorising
the narrow issuer reclassifies its whole history for free.

## Specificity: the value tier sits on top

A rule *with* a Value matcher matches a strict subset of what the same pattern
without one matches, so it **outranks** a regex-only rule — placed *above*
literal length in the comparator, then literal length, then newest rule. This is
what makes the Amazon-`6.99` rule beat the broad `amazon` rule **robustly**
rather than by `createdAt` luck: an older value-rule still wins over a newer
regex-only rule of equal literal length. Without the tier, the two would tie on
literal length and the winner would flip with insertion order.

## Cents, never float `===`

Amounts are compared as **whole cents** — `round(abs(amount)·100) ==
round(matchValue·100)` — never a float `===`, which `6.99` would fail against its
own round-trip. The comparison is **sign-agnostic**: both sides are magnitudes,
so a `6.99` rule matches a `-6.99` debit and a `+6.99` credit alike. `matchValue`
is stored and compared as a magnitude; the sign lives on the transaction, not the
rule.

## Considered options

**A category column on the rule** was rejected: it duplicates the issuer's
`defaultCategoryId` as a second, rule-local derivation path, and the two drift
the moment an issuer is re-categorised. Deriving through a narrower issuer keeps
one source of truth.

**Value-only rules** (a `matchValue` with no `pattern`) were rejected: `pattern`
stays required, both must match when value is present. A rule that fires on an
amount alone, across every issuer-string, is a footgun with no motivating case.

**Tie value into literal length** (e.g. count a value as N literal chars) was
rejected as a fudge: it makes specificity depend on an arbitrary constant and
still ties against a long-enough pattern. A distinct tier above literal length is
the honest encoding of "matches a strict subset".

## Consequences

- **A new nullable migration**, `matchValue REAL`, no backfill — existing rows
  read as regex-only. One null↔absent fold on the rule row codec (the only
  nullable column on the entity now that `categoryOverride` is gone).

- **The match predicate is now two-part** everywhere it runs: `regex.test(raw) &&
  valueMatches(rule, amount)`. Threaded through create/update/delete recompute,
  import matching, and both preview paths — the amount now rides into
  `winnerFor`, which previously took only the raw string.

- **Preview narrows, it does not add a bucket.** A present `matchValue` tightens
  the existing scope guard; the three preview buckets stay the same, so
  `RulePreviewResult` is unchanged and only `RulePreviewInput` gains `matchValue`.
