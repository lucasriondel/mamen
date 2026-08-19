# Skip rows from a filterable import table

> Depends on #180 (Statement Formats), which depends on #175 (raw source).
> Author-now, implement-after.

## Problem Statement

A Trade Republic statement is mostly rows the user does not want. Of the
twenty-two operations on a real one, fifteen are `Exécution d'ordre` — stock
purchases, where money leaves the cash account to buy an asset. They are not
spending, and the user does not want a single one of them in their ledger.

The **side-by-side validation** view offers exactly one way to hold a row out:
delete it, one row at a time, fifteen times, with no way back if the wrong row
goes. There is nothing to sort by, nothing to filter by, and no way to act on
more than one row at once. The rows that differ only in a column the view does
not render look identical on screen.

That column exists. The statement prints a `TYPE` for every operation —
`Virement`, `Exécution d'ordre`, `Rendement`, `Impôt` — and it is precisely the
value that separates the rows the user wants from the ones they do not. Neither
the extraction nor the view has any notion of it, so the one piece of
information that would make this a single decision is discarded before the user
ever sees the table.

The same statement carries a second surprise: it is two accounts in one file, a
`Compte PEA` and a `Compte courant`, and the extraction is currently instructed
to treat everything outside one account as noise.

## Solution

The right-hand panel of the **side-by-side validation** view becomes a real
table, built on the same primitives the transactions table already uses.

Every row carries a checkbox that marks it a **skipped row** — held out of this
commit, struck through, its editable fields disabled, and restorable with a
second click. This replaces deleting the row outright, which is the same
recourse the CSV preview has always offered and which the PDF path has never
had.

Above the table sit **facets**: one per raw-source column whose values repeat,
each listing that column's distinct values. Narrowing to `TYPE` =
`Exécution d'ordre` leaves fifteen rows on screen, and the header checkbox skips
exactly those fifteen — the filtered rows, never the hidden ones. The columns
the extraction returned but the table does not show by default are available
from a column toggle, so the user can see the value they are filtering on.

Because the rows are now filtered and sorted rather than rendered in extraction
order, every row gains a **stable identity** minted when it is parsed or
extracted. A skip names a row, not a position, so narrowing the table can never
skip a different row than the one clicked.

## User Stories

1. As a mamen user importing a Trade Republic statement, I want to hold its
   order-execution rows out of my ledger, so that buying an asset does not read
   as spending money.
2. As a mamen user, I want to skip a row with a checkbox rather than delete it,
   so that changing my mind costs one click instead of re-importing the file.
3. As a mamen user, I want a skipped row to stay on screen struck through, so
   that I can see what I have held out rather than watch it vanish.
4. As a mamen user, I want a skipped row's fields disabled, so that I do not
   waste edits on a row that will not commit.
5. As a mamen user, I want to restore a skipped row, so that a mis-click is
   recoverable.
6. As a mamen user, I want the PDF path to skip rows the same way the CSV path
   does, so that the two previews do not teach me two different habits.
7. As a mamen user, I want to still add a row the extraction missed, so that a
   model that dropped an operation is still correctable.
8. As a mamen user, I want the statement's own operation type available in the
   table, so that I can tell an order execution from a dividend.
9. As a mamen user, I want to filter the table by an exact column value, so that
   selecting every order execution is one choice rather than fifteen.
10. As a mamen user, I want the filters offered to me derived from the file I
    dropped, so that a bank whose columns mamen has never seen still gets them.
11. As a mamen user, I want a filter only on columns whose values repeat, so
    that I am not offered a useless filter listing every description on the
    statement.
12. As a mamen user, I want to skip every row currently filtered in one action,
    so that a narrowed table is actionable.
13. As a mamen user, I want the select-all control to act only on rows I can
    see, so that it never skips a row hidden by a filter.
14. As a mamen user, I want to restore every filtered row in one action, so that
    undoing a bulk skip is as cheap as making one.
15. As a mamen user, I want to see how many rows a filter is hiding, so that a
    narrowed table does not read as a short statement.
16. As a mamen user, I want to clear every filter at once, so that I can get back
    to the whole statement without undoing each choice.
17. As a mamen user, I want the columns the extraction returned available to
    show, so that I can read the value I am filtering on.
18. As a mamen user, I want those extra columns hidden by default, so that the
    common import is not a wall of columns.
19. As a mamen user, I want date, operation label and amount always shown, so
    that the table is readable before I configure anything.
20. As a mamen user, I want to edit a row's date, label and amount as I can
    today, so that correcting a misread value still works.
21. As a mamen user, I want the **already imported** mark to keep working, so
    that re-importing an overlapping statement is still guarded.
22. As a mamen user, I want the commit bar to count only the rows that will
    commit, so that the number I confirm is the number I get.
23. As a mamen user, I want the reconciliation check to judge what the model
    read, not what I chose to keep, so that skipping rows does not make it cry
    wolf.
24. As a mamen user, I want my filters gone when I import the next statement, so
    that a choice I made last month does not silently hide rows this month.
25. As a mamen user importing a statement covering two of my products, I want
    every operation returned, so that I can decide which ones belong to the
    account I am importing into.
26. As a mamen user, I want the product name available as a filter, so that
    holding out the rows for my other account is one choice.
27. As a mamen user importing a statement with no printed totals, I want no
    reconciliation warning, so that an absent total does not read as a mismatch.
28. As a mamen user, I want the CSV preview to gain the same table, so that both
    paths filter and skip identically.
29. As a mamen user, I want skipping to remain a decision about this commit
    alone, so that nothing is stored and nothing outlives the wizard.
30. As a mamen developer, I want each candidate row to carry a stable identity,
    so that filtering the table cannot skip the wrong row.
31. As a mamen developer, I want that identity minted deterministically, so that
    the reducer stays pure and its tests stay fixture-driven.
32. As a mamen developer, I want skips keyed by identity rather than position,
    so that adding and removing rows cannot shift what is skipped.
33. As a mamen developer, I want both paths to use one identity model, so that
    the reducer does not carry two.
34. As a mamen developer, I want the facet rule expressed as a pure function, so
    that which columns become filters is testable without a table.
35. As a mamen developer, I want selection, faceting and column visibility
    extracted as shared primitives, so that the two previews compose them rather
    than duplicate them.
36. As a mamen developer, I want the two previews to stay separate components,
    so that one editable path and one read-only path are not one component
    behind a pile of flags.
37. As a mamen developer, I want the raw-source dependency on #180 stated, so
    that the table is not built against a column bag nothing produces.

## Implementation Decisions

### Row identity

- Every candidate row carries a **stable row id**, minted when the row is parsed
  (CSV) or extracted (PDF), and again when a blank row is added. Ids come from a
  **monotonic counter held in wizard state**, not a UUID and not a content hash:
  the reducer is pure and heavily fixture-tested, so identity must be
  deterministic, and two identical rows on one statement are legitimate.
- `skippedRows` becomes a **set of row ids** rather than ascending indices. Skip
  and restore actions name a row id.
- **Both paths adopt this**, not just the PDF one. The CSV preview gains the same
  filtering, so index-addressing breaks there for the same reason; two identity
  models in one reducer is worse than migrating both at once.
- Ids are cleared exactly where `skippedRows` is cleared today — a new file, a
  parse error, a different **Parser**, a new extraction.

### Skipping replaces deleting

- The PDF path's row deletion is **removed**. Skipping subsumes it and is
  reversible.
- The PDF path's **add-row is kept**. It solves the opposite problem — the model
  missed an operation — which skipping cannot.
- A skipped row's editable fields are **disabled**, and it is struck through, as
  the CSV preview already does. This reverses the glossary's stated rationale for
  deleting on the PDF path ("a PDF's rows are editable there anyway"), which
  stops being true once a skipped row's inputs are inert.
- Skipping remains what it is today: it writes nothing, stores nothing, and is
  gone with the wizard.

### The table

- Built on **TanStack Table**, already a direct dependency and already in
  production in the transactions table, over the existing table and checkbox
  primitives.
- The transactions table is **not reused**. It renders persisted rows — it keys
  on a database id, joins issuer and category, and expands bundles. Candidate
  rows have none of that. The shared thing is the primitives and the pattern, not
  the component.
- **Shared primitives, two thin components.** Row identity, selection, faceting
  and column visibility are extracted so both previews compose them. The two
  previews stay separate components: one is editable with an add-row control and
  a reconciliation banner, the other is neither, and collapsing them would mean a
  component steered by four capability flags.
- **Default columns**: skip checkbox, date, operation label, amount. Every
  raw-source key is additionally available as a **hidden, toggleable column**,
  following the column-visibility pattern the transactions table already uses.

### Filtering

- Filters are **exact-value facets**, one per eligible raw-source column, listing
  that column's distinct values. Substring search is deliberately rejected: on a
  control that removes rows from an import, over-matching silently drops the
  wrong ones.
- A column is **facet-eligible** by a stated rule — its distinct-value count is at
  or below a named threshold constant, and strictly below the row count. This
  facets the operation type and the product name while skipping the description
  and the running balance, with no configuration and no user setup.
- The header checkbox and any bulk restore act on **filtered rows only**, which
  is both TanStack's default and the transactions table's existing behaviour.
- Filters are **ephemeral** — cleared with the wizard, never persisted. A durable
  "always hold out this type" rule belongs to the **Statement Format**'s row
  filter, not to a remembered UI state; two mechanisms for one intent would
  compete.

### Counting

- The **commit bar counts kept rows** — what will actually be written.
- The **reconciliation check sums every extracted row**, skipped ones included.
  Its job is to judge whether the model read the statement correctly, not whether
  the user chose to import everything. Summing kept rows would fire the banner on
  every deliberate skip and train the user to ignore it. This is deliberate and
  counter-intuitive, and it is why the two counts differ.

### Dependencies on #180

The table filters on columns that do not exist yet. #180 owns all three, and this
spec is blocked on them:

- **PDF rows gain a raw source** — the extraction returns the statement's declared
  columns per row, and they persist as the row's archive exactly as the CSV path's
  do. #180 records this as a divergence from #175 to be raised there; it resolves
  as *#175 stays CSV-only, #180 adds the PDF archive*.
- **The extraction returns every operation row.** Today's rule instructs the model
  to drop other accounts as noise, which on a two-product statement discards half
  the document and makes user story 25 impossible. It becomes: return every
  operation row, drop only balance and summary lines, and carry the product name
  as a column so it is filterable.
- **Declared totals become optional.** A statement that prints no totals line
  yields none, and the reconciliation check skips rather than reporting a
  mismatch against zero.

## Testing Decisions

A good test here states what a module produces, not how it does it. The reducer
tests should read as statements about which rows survive a commit; the facet
tests as statements about which columns become filters; the wizard tests as
statements about what a user sees and clicks. None should reach past an
interface to observe internals. Seams are the existing ones wherever they exist.

**The reducer seam — the primary one.** The wizard reducer's test file already
splits by path and already has a block for skipping previewed rows on the CSV
path; this work extends it. Pure, driven directly, no mocking. Pin here: a row id
surviving an in-place edit; ids staying unique across an added row; skipping and
restoring by id on **both** paths; a skip naming the same row after the row order
changes; ids and skips cleared on a new file, a parse error and a **Parser**
change; and add-row still minting a blank row. The existing case asserting that a
phantom extracted row is deleted **changes meaning** and must be rewritten as a
skip rather than quietly left passing.

**The facet seam — rows to facetable columns.** A new pure module, tested without
a table, in the style the existing pure import helpers set. Table-driven over the
threshold rule: a low-cardinality column faceted, a column whose every value is
distinct not faceted, a column at exactly the threshold, a single-row statement,
and rows whose raw sources disagree on which keys they carry.

**The wizard seam — user-visible behaviour.** The wizard's component test file is
the house pattern: the SDK mocked wholesale, role-based queries, mounted in a
memory router. Cover: a facet narrowing the visible rows; the header checkbox
skipping only filtered rows and not hidden ones; a skipped row struck through
with its inputs disabled; restoring it; a hidden raw-source column toggling on;
the commit bar counting kept rows while the reconciliation banner reflects every
extracted row; filters absent again on the next import; and the CSV preview
exercising the same table. The repo's own recorded trap applies — web fixtures
are cast through `unknown` and absorb new fields silently, so raw-source coverage
must be written deliberately rather than discovered by a failing type.

**The column-visibility seam.** Reuse the existing hook and its test file if the
dynamic columns fit it; a sibling test file if the unknown-key case needs its own.

**Not a seam.** The extracted shell and hooks are exercised through the reducer
and wizard seams rather than directly. Testing them in isolation would assert
implementation, and fewer seams is the goal.

**Inherited from #180.** The reconciliation module needs a case for absent
declared totals. That is #180's contract change and is noted here as a dependency
rather than specified.

## Out of Scope

- **Promoting the operation type to a transaction property.** It stays in the
  row's raw source. It exists to be filtered on at import; nothing in the ledger
  reads it, and ADR 0012 says a column is earned when something needs to reach a
  value.
- **A standing rule that always holds out a type.** Every import repeats the
  filter-and-skip. The durable version is the **Statement Format**'s row filter,
  which would need a not-equals comparison it does not currently have — its
  vocabulary is equals-only. Deferred to a follow-up.
- **Splitting a two-product statement across two accounts in one commit.** An
  import binds one file to one account. The user holds out the other product's
  rows by hand — which this work makes a deliberate, filterable action rather
  than luck. A format that declares which product it reads is the right eventual
  answer and belongs with the format work.
- **Substring or free-text search over the table.** Facets only.
- **Persisting filters or column visibility across imports.**
- **Sorting the table.** Rows stay in statement order; filtering is what this
  work adds.
- **Row virtualisation.** The virtualiser is installed but unused, and a
  statement's row count does not warrant it.
- **Changing what commits, when, or how.** The commit rail, the additive commit
  and the **already imported** mark are untouched.

## Further Notes

- **#180 is a hard blocker, and #175 blocks #180.** Building this against today's
  extraction would mean filtering on a column bag nothing produces.
- **The vocabulary is settled and it is not the one this started with.** The web
  glossary defines a **skipped row** and explicitly rules out *excluded* — that
  word is reserved for **excluded from recap**, a stored decision about a
  transaction already in the table. The checkbox says *skip*, and the glossary
  entry gets edited rather than added to, because its stated reason for the PDF
  path deleting instead of skipping stops being true here.
- **The reconciliation asymmetry is the thing most likely to be "fixed" by
  mistake.** A future reader will see the commit bar counting kept rows and the
  banner counting all of them and assume it is a bug. It is not: they answer
  different questions.
- **Row identity is the highest-risk change**, and it is why it is decided
  explicitly rather than discovered. Introducing filtering over an index-addressed
  array is how a user skips one row and silently loses another — a data-loss bug
  that looks like a rendering bug.
- The Trade Republic statement that motivated this work is held in the local
  statement scratch directory, not in the repo. Any fixture derived from it must
  be synthetic and carry the reserved IBAN prefix the repo's bank-statement scan
  requires.
