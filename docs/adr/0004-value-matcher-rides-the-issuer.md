# The value matcher rides the issuer; a rule never carries a category

A **Matching Rule** may gain an optional **Value matcher** (`matchValue`), so a
single issuer-string can fork by amount — an Amazon `6.99` (Prime) routed to a
*different* Issuer than a general Amazon charge (issue #39). The re-categorisation
the issue asks for ("a rule overrides the category imposed by the issuer") is
delivered **through the issuer**, not by putting a category on the rule: the
narrow rule points at a narrower Issuer (*Amazon Prime*) whose
`defaultCategoryId` is the desired category (*subscription*). The rule keeps its
one job — assign an issuer — and category stays **derived**.

## Why not put the category on the rule

Because that path was already built and deliberately torn out. The `rules` table
carried a `categoryOverride` column (migration `0005`) that **no derivation ever
read**, dropped in migration `0008`. The category is derived at query time from
exactly two inputs (`transactions/repository.ts`):

```sql
CASE WHEN t.manualCategory = 1 THEN t.categoryId ELSE i.defaultCategoryId END
```

A rule-carried category would be a **third** input, reopening the precedence
question (does a rule-category beat a manual override? an issuer default?) and
forcing every category read — display, count, and the category **filter** that
must match display (ADR 0002) — to grow a join to `rules` and re-run the regex in
SQL. The engine deliberately runs regex in JS, never SQL (`issuer-matcher.ts`),
so an invalid pattern is a *skipped rule*, not a 500; a category derivation that
depended on rule-matching would have to either duplicate that JS matching into
the read path or move it into SQL and lose that property. Riding the issuer costs
none of this: the existing two-input derivation is untouched, and *Amazon Prime*
being its own row is not a workaround — it **is** the model. Prime is a distinct
payee with a distinct default category; the value matcher is just how the import
tells the two Amazons apart.

## Considered options

**Category on the `Rule` (resurrect `categoryOverride`)** — rejected. Reintroduces
the exact dead column, adds a third derivation input, and drags rule-matching into
the category read path (or into SQL). The one concrete pull toward it — "the user
thinks *one Amazon, conditional category*" — is a UI framing, answerable with a
label, not a schema.

**A separate value-rule pass above the regex pass** — rejected as control-flow
dressed as ordering. Deriving value-rules first and falling through to regex-only
rules yields the same result as making "has a value matcher" the top specificity
term, but forks `derive` into two passes instead of extending the one comparator
that is already the single specificity seam.

**Range / operator matchers (`>`, `<`, between)** — deferred, not rejected. The
driving cases are fixed subscription prices (Prime `6.99`, Netflix `13.49`), so
exact-to-the-cent ships first. Exact is a degenerate range; adding operators later
widens `matchValue` without breaking any exact rule, so nothing here forecloses it.

## Consequences

- **Value is a new specificity tier, above literal length.** A rule *with* a value
  matcher matches a strict subset of what its pattern alone would, so it is
  genuinely more specific and outranks a regex-only rule it ties or loses to on
  literal length. Without this tier the Prime rule (`amazon` + `6.99`) beats the
  broad `amazon` rule only by newer-`createdAt` luck — recreate the broad rule and
  it silently steals the row back. The tier makes it robust. The cost: *any*
  value-rule outranks *any* longer plain regex (`amazon prime video` loses to
  `amazon` + `6.99`); accepted as correct — the amount is the sharper signal.

- **Comparison is in integer cents, never float `===`.**
  `round(abs(amount)·100) == round(matchValue·100)`. `amount` is a SQLite `REAL`
  and `matchValue` is user-typed; a bit-level `6.99 !== 6.99` would make a rule
  **silently never match** — the worst failure mode, no error, just nothing.
  Cents are exact by construction and need no epsilon to justify.

- **`matchValue` stores a positive magnitude, sign-agnostic.** The user matches
  "6.99"; the engine compares `abs(amount)`. Storing the magnitude keeps the DEBIT
  = negative / CREDIT = positive convention out of the matcher entirely.

- **The three pure matchers thread a scalar `amount`.** `winnerFor`, `derive`,
  `previewLists`, `deleteLists` gain the amount alongside the raw string; the scope
  guard `regex.test(raw)` becomes `regex.test(raw) && valueOk(rule, amount)`. The
  preview keeps its **three** buckets — a value narrows scope exactly as a
  non-matching pattern does, so a matched-text-wrong-value row is simply out of
  scope, not a new list. `RulePreviewResult` is unchanged; `RulePreviewInput`
  gains `matchValue`.

- **The workflow is two-step, and the issue's framing is not how it feels.** To
  re-categorise Prime the user creates the Issuer *Amazon Prime* (default category
  *subscription*), then a rule `amazon` + `6.99` pointing at it — not a single
  "override this row's category" gesture. The issuer grid and its counts
  (issue #39's sibling work) now show *Amazon* and *Amazon Prime* as separate
  rows. Accepted: they are separate payees. The **category** recap is already
  correct for free, since it reads through the issuer.

- **Migration `0012` adds `matchValue REAL` nullable, no backfill.** Existing rows
  are `NULL` ⇒ regex-only ⇒ byte-identical behaviour to before. The field is named
  `matchValue`, not `amount`/`value`, so it never reads as the transaction's own
  amount.
