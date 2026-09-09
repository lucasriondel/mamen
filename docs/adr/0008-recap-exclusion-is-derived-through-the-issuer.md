# Recap exclusion is derived through the issuer

A transaction is **excluded from recap** — held out of every spend total — by a
value that is *derived at read time*, not stored on the row:

```sql
CASE WHEN t.manualExcluded = 1 THEN t.excludedFromRecap
     ELSE i.excludedFromRecap END
```

A per-row `manualExcluded` flag marks the row's own exclusion state as
deliberate and wins; otherwise the row inherits the default carried by its
issuer. This is the **derived category** rule
([ADR 0002](./0002-category-filter-matches-the-derivation.md)) applied to a
second field, deliberately: same `CASE WHEN manual… THEN … ELSE issuer… END`
shape, resolved through the `LEFT JOIN issuers` the read path already carries,
`manualExcluded` standing to `excludedFromRecap` exactly as `manualCategory`
stands to `categoryId`.

Nothing implements this yet. The columns land in #67, the derivation in #69, and
this ADR exists first so the two slices cannot disagree about what exclusion
means.

## Why derive rather than stamp

Exclusion has a **bulk lever** and a **per-row lever**, and the bulk one is the
common case: the standing transfer to a joint account, the savings sweep, the
internal movement that arrives every month under the same name. Those are
recognised by their issuer, so the default belongs on the issuer — and a default
that is *read* rather than *copied* buys two properties a stamped column cannot:

- **New rows are already right.** A transaction imported under an excluded issuer
  is excluded the moment it lands, with nothing to re-run. A stamped column would
  need every import, and every issuer edit, to sweep the affected rows — the
  re-derivation machinery the **issuer invariant** already needs for rules,
  duplicated for a boolean.
- **Un-excluding an issuer cannot clobber a decision.** The per-row flag is the
  override, so pulling an issuer back into the recap leaves a row the user
  deliberately excluded still excluded. With a stamped column the two writes are
  indistinguishable after the fact: "excluded because its issuer was" and
  "excluded because I said so" are the same `1`.

The override works in both directions — a row from an excluded issuer can be
forced back into the recap, and a row from an included issuer can be pulled out.

## `manualExcluded` is not redundant

Read alone, `excludedFromRecap` on the transaction says everything #67 needs, and
the second flag looks like ceremony. It is what makes #69 possible: without it
there is no way to tell a row that is excluded *because of its issuer* from one
excluded *by the user*, and inheritance collapses into stamping. The flag is
introduced in the slice before the one that needs it precisely so no migration
has to invent the distinction retroactively — after the fact, the information is
gone.

## The filter must match the derivation

ADR 0002 exists because a filter matched the stored column while the read
returned the derived value, so filtering by category silently omitted every row
categorised through its issuer — the common case — while looking like it worked.
Exclusion has the identical failure available to it: a filter on
`t.excludedFromRecap` would return only manually-flagged rows and quietly drop
every row excluded by inheritance.

So the expression is defined **once** in the transactions repository, beside the
`derivedCategory` fragment it mirrors, and reused by the projection, the filter,
the **uncurated** predicate (#70 — an excluded row is never uncurated) and the
server-side recap aggregation's `countsTowardRecap` (#71). One definition, one
place; every surface that asks "does this row count" asks the same SQL.

## Considered options

**Stamp exclusion onto the row on write** was rejected for the two properties
above: it needs a backfill on every issuer edit and a sweep on every import, and
it erases the difference between an inherited and a deliberate exclusion, which
is the thing the feature has to remember.

**A nullable `excludedFromRecap` where `null` means *inherit*** — the encoding
**inherited colour** uses for categories
([ADR 0006](./0006-category-colour-is-inherited-icons-are-lucide-names.md)) —
was rejected here, though it is the same idea. Colour has no manual-flag family
to join; transactions do (`manualIssuer`, `manualCategory`), and a third
inherit-encoding in the same table means every reader has to know which of two
conventions a given column follows. Matching the neighbours keeps the
transaction's override story uniform and the `CASE` identical to the one beside
it.

**Reusing `isDuplicateExcluded`** was rejected: it claims *this row is a
duplicate of another*, a provenance fact, not *this row is not spending*. That no
aggregation currently honours it makes it look free to repurpose; overloading it
would fuse two meanings into one column and lose the ability to say a row is both.

## Consequences

- **No migration backfills anything.** Both new columns default to not-excluded,
  and existing rows read as included through the same expression.
- **A `CASE` in a `WHERE` cannot use an index**, so exclusion-filtered queries
  scan the joined set — the same cost ADR 0002 already accepted for category, on
  the same grounds (one person's bank statements) and the same trigger to
  revisit.
- **Projection, filter, uncurated predicate and recap aggregation must keep the
  same join and the same expression.** They drifted apart once already for
  category, which is what caused ADR 0002; sharing one fragment is the guard.
- **Writes must never round-trip the derived value into storage.** The update
  path already merges against the *stored* row rather than the derived read for
  exactly this reason with `categoryId`; `excludedFromRecap` joins that rule.
- **The uncurated predicate gains a dependency on exclusion** (#70), which also
  settles row-colour precedence: an excluded bare row shows the exclusion colour
  and not the uncurated tint.
