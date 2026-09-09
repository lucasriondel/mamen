# The Account matcher and the Sign matcher ride the rule

A Matching Rule gains two further optional predicates alongside the **Value
matcher**: an **Account matcher** (`matchAccountId`, a single account) and a
**Sign matcher** (`matchSign`, `positive` | `negative`). Each is independently
optional; a rule may carry any combination, and a rule carrying none of the three
is a plain regex rule, byte-identical to today.

The two gaps they close are the ones a regex cannot honestly express. The same
issuer-string means different things in different accounts — a `virement` on the
joint account is rent, the same string on the personal account is a transfer to
savings — and the same issuer-string appears on both sides of the ledger, a card
refund against a card purchase. Encoding either into the pattern makes the regex
stand in for data it has no access to.

## This amends ADR 0004

ADR 0004 says "the sign lives on the transaction, not the rule". That is now
half-true: **sign may ride the rule**, as its own predicate. What has not
changed is `matchValue` itself — it stays a positive **magnitude** and stays
sign-agnostic, so an existing `6.99` rule still matches the `-6.99` debit it was
written for.

Folding sign *into* `matchValue` (dropping `Schema.positive()`, letting `-6.99`
mean "exactly minus 6.99") was rejected. It silently reinterprets every stored
rule — today's `6.99` means either sign and would start meaning credit-only —
and no honest backfill exists, because the user's intended sign is unrecoverable.
It is also strictly less expressive: "any negative Amazon charge" has no
magnitude to hang a sign on.

## Zero is neither money in nor money out

`positive` matches `amount > 0`, `negative` matches `amount < 0`, and a **zero
amount matches neither** — it is claimable only by a rule with no Sign matcher.

This is not hypothetical: a **bundle** parent carries its members' summed amount,
so a `+50 / -50` bundle is exactly zero, and a fully refunded purchase nets to
zero. Filing zero under "positive" would let an income rule claim a bundle that
nets out. Falling through to the sign-less rule is the safe direction — the
user's broader rule rather than a wrong narrow one. A third `zero` enum value was
rejected as unmotivated, on the same ground ADR 0004 used to reject value-only
rules.

## Specificity counts the predicates

The comparator's top tier becomes **the number of optional predicates a rule
carries** (0–3), descending; then literal length; then newest rule. This replaces
the binary has-`matchValue` tier, and it is ADR 0004's own justification
generalised: a rule with more predicates matches a strict subset, so it is more
specific.

It is behaviour-preserving for every existing rule set. With only `matchValue` in
play a count of 1 beats a count of 0 exactly as the binary tier did, so no
current winner changes — pinned by a test written before the comparator moved.

Two rules with the same pattern and the same *number* of *different* predicates
— `amazon`+account against `amazon`+sign — tie at this tier and fall through to
literal length, then `createdAt`. **Accepted.** Neither rule's matched set is a
subset of the other's, so there is no correct winner to compute; a declared
priority between predicate kinds would hide an arbitrary choice in a constant
rather than in a timestamp. A weighted score was rejected on ADR 0004's stated
ground that specificity must not depend on an arbitrary constant.

## One account, not a set

The Account matcher names **one** account. A row lives in exactly one account, so
N rules cover N accounts and can never compete for the same row; a set would need
a join table or a JSON column to buy nothing.

## Deleting an account deletes the rules scoped to it

The account delete, the delete of every rule whose Account matcher names it, and
the whole-table recompute run in **one** `withTransaction` — all-or-nothing.

The recompute is the load-bearing half. `applyRuleDelete` already pairs every
rule delete with a recompute precisely so the rows that rule had won fall back to
the next-best rule or become unmatched; a cascade that deleted rules without
recomputing would leave those rows holding a stale `issuerId` that no surviving
rule justifies, breaking the **Issuer invariant** silently until an unrelated
edit happened to fix it.

A **guarded delete** — refusing to delete an account while rules depend on it, as
Categories and Issuers do — was considered and rejected: account delete is
currently unguarded (a bare `DELETE FROM accounts WHERE id = ?`), so adding a
guard would be a larger behaviour change than this feature warrants. **Nulling
the reference** was rejected as the worst option: it makes a rule silently
*broader*, suddenly claiming rows across every account.

## Consequences

- **A new nullable migration**, `matchAccountId INTEGER` + `matchSign TEXT`, no
  backfill — every existing rule reads as carrying neither predicate. Two more
  null↔absent folds on the rule row codec. `matchAccountId` carries **no FK**,
  consistent with `transactions.accountId`; the cascade is enforced in the delete
  path, not by the database.

- **The match predicate is now four-part** everywhere it runs: pattern, value,
  account, sign. The row's `accountId` rides into `winnerFor` as `amount` did at
  #42 — the predicate now takes the row rather than a growing parameter list.

- **The account delete moved off `AccountRepo`** onto the `IssuerMatcher`
  (`applyAccountDelete`), which is what owns the recompute. The repository's bare
  `remove` is gone rather than left unused: it would be a way to bypass the
  cascade and strand rows on an issuer nothing justifies.

- **Each new field gets the three-way patch** `matchValue` already had (#43):
  absent leaves it unchanged, an explicit `null` clears it, a value sets it.
  Absent-means-clear was rejected outright — it would make every partial update
  silently drop predicates the caller never mentioned, which is data loss in a
  PUT.

- **Preview narrows, it does not add a bucket.** `RulePreviewResult` is
  unchanged; the two new predicates tighten the existing scope guard.

- **A known diagnosis gap, accepted.** A rule can now be empty by construction —
  pattern `amazon` scoped to an account holding no Amazon rows. The preview
  correctly shows three empty lists but cannot say *which* predicate eliminated
  the rows, so an over-narrow rule is indistinguishable on screen from a wrong
  regex. With one predicate this was tolerable; with three it is easier to hit.
  A per-predicate diagnostic — how many rows survive each predicate in turn — is
  the named future fix, deferred because it is a new response shape plus new UI,
  and because which predicate users actually get wrong is not yet known. The
  form's named opt-outs ("Any account", "Any") are the partial mitigation: a
  rule's scope is stated rather than inferred from an empty list.
