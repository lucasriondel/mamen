# Context map

Multi-context monorepo. Each package owns its own domain vocabulary in a
`CONTEXT.md`. This map points at them. System-wide decisions live in
`docs/adr/`.

| Context | Path | Role |
|---|---|---|
| shared | `packages/shared/CONTEXT.md` | The HTTP API contract + shared schemas/types. Source of truth for domain entities. |
| api | `packages/api/CONTEXT.md` | Effect `HttpApi` server implementing the contract. |
| sdk | `packages/sdk/CONTEXT.md` | Typed client derived from the contract, wired to TanStack Query. |
| web | `packages/web/CONTEXT.md` | React frontend. Uploads CSV bank statements, displays transactions, manages issuers. |

The legacy `server` (Fastify API) and `web-api-legacy` (old web client) packages were deleted at
the Effect API rework cutover (`docs/issues/0020-cutover.md`).

## Cross-context terms

These terms mean the same thing in every context — defined once here, not
repeated per package.

- **Issuer** — an entity describing a place money goes **to or from** (a payee
  *or* an income source; bidirectional by design). Supersedes the earlier term
  **Merchant**, which was payee-flavoured and a poor fit for income (salary,
  rent received). The rename is total: contract, DB, SDK, and web all say
  *issuer* / `IssuerId`.

- **Matching Rule** — a single regex `pattern` owned by one Issuer that
  auto-assigns that Issuer to any transaction whose **raw issuer string**
  matches. An Issuer may own several (one regex each); together they are the
  Issuer's rule set. *In code the entity is `Rule` / `RuleId` / `rules` — the
  "Matching Rule" name is UI/glossary-only, chosen so users don't confuse it
  with other kinds of rule.* A rule assigns **only an issuer**, never a category
  (category is derived — see **Derived category**).

- **Manual assignment** — a human directly choosing a transaction's issuer or
  category, recorded by the `manualIssuer` / `manualCategory` flags. Manual
  assignments are **sticky**: Matching Rules never overwrite them. The issuer
  flag mirrors the pre-existing category flag.

- **Issuer invariant** — a transaction's issuer is, in priority order: its
  **manual assignment** if `manualIssuer` is set; else the **specificity-winner**
  among all Matching Rules whose pattern matches its raw issuer string; else
  **unmatched** (no issuer). Specificity = longest literal (regex metachars
  stripped), tiebreak newest rule. This invariant holds after every operation —
  import, and rule create / edit / delete — each of which re-derives the affected
  rows and (except manual) makes the table reflect the best current rule.

- **Derived category** — a transaction's category is read *through* its issuer
  (`issuer.defaultCategoryId`) at query time, not copied onto the transaction —
  so re-categorising an issuer reclassifies all its history for free. The
  exception is a **Category override** on a single transaction
  (`manualCategory` + `categoryId`), which wins over the issuer's default.
  This is what powers the category-spend recap graphs.

- **Inherited category** — the display state of a transaction showing its
  **Issuer default category**: the common, quiet case, rendered plain. Contrasts
  with a **Category override**, which is marked — the exception gets the ink, so
  that when re-categorising an Issuer visibly skips a row, the reason is on
  screen. A category reads as its **Category leaf** name alone (*Groceries*,
  *Netflix*); the folder is navigation, not identity, and never appears in a
  table cell — not even as a path, and no more so now that folders nest. Depth
  adds navigation, not identity, so a deeper tree argues *for* the rule: the path
  grows longer and less worth its ink. Should users start hand-disambiguating
  leaf names (*Tesla connect*), that is the signal to show the immediate parent
  on collision — and only on collision.

- **Category override** — a **manual category** on one transaction
  (`manualCategory` + `categoryId`), understood as an *exception* to the issuer's
  default rather than an independent value. Removing an override reverts the
  transaction to its issuer's default; it never forces the transaction to have no
  category. A transaction that should carry no meaningful category gets a real
  Category (e.g. *Uncategorised*) assigned to it, so the intent is explicit and
  visible in the recap.
  _Avoid_: Clearing the category, unsetting (both suggest a null result).
  _Code note_: not `transactions.categoryOverride` — a vestigial free-text column
  no derivation ever read, dropped along with `subcategoryId` (which `parentId`
  supersedes) when categories reached the frontend.

- **Category folder** — a Category that **has children**, used purely to group and
  navigate (*Food*, *Life > Subscriptions*). A folder is **never assignable** to a
  transaction; it exists so its children read well in a list. Its total is the
  sum of its **descendants'**, with no directly-assigned transactions of its own
  to double-count. Folders nest: a folder may sit inside another folder.
  _Avoid_: Parent category, group, top-level category, root (a folder need not be
  one).

- **Category leaf** — a Category with **no children**, and the **only** kind that
  can be assigned to a transaction or to an Issuer (*Food > Groceries*,
  *Life > Subscriptions > Netflix*). Nothing about its depth or its parent makes
  it a leaf — only the absence of children.
  _Avoid_: Subcategory, child category.

- **Leaf-assignable invariant** — a Category is assignable **iff it has no
  children**, at any depth. Supersedes the earlier *two-level invariant*, which
  fixed every assignable Category at depth 2 — see
  `docs/adr/0003-categories-nest-to-any-depth-assignability-is-childlessness.md`.
  Enforced at the API boundary, not merely in the UI, because the totals on the
  category page are silently wrong if it is ever violated and the UI is not the
  only writer (seeds, imports, future auto-categorisation) — the one part of the
  old invariant that survives its own reversal.
  _Code note_: the test is *"has no children"*, never `parentId === null`. That
  null-check was the old invariant's shortcut and reads as an equivalent
  simplification; under nesting it silently admits mid-tier folders as
  assignable.

- **Kind flip** — a **Category leaf** becoming a **Category folder** by gaining
  its first child (or the reverse, by losing its last). A Category's kind is a
  property of its children, so it is *mutable* — the tree is reshaped by ordinary
  edits, not fixed at creation. A flip that would strand money is **refused**:
  a leaf holding transactions, or held as an **Issuer default category**, cannot
  take a child until those are moved, because they would hang off a node the
  rollup visits but does not count.
  _Avoid_: Promotion, demotion (both imply a hierarchy of status, not of shape).

- **Spill** — the offered fix for a refused **kind flip**: moving a leaf's
  transactions into a new child leaf beneath it, so the node becomes a folder and
  its money keeps a home (*Subscriptions* gains *Streaming services*, and its 40
  existing transactions land in a new leaf rather than nowhere). Offered as one
  gesture on the categories page and never performed silently — the user names
  the destination, because an auto-named leaf is a guess about intent.

- **Guarded delete** — deleting a Category is refused while anything depends on
  it: a folder with children, or a leaf still assigned to transactions or held as
  an **Issuer default category**. The refusal names what depends on it, so the
  user can re-assign first. Neither cascading the delete nor nulling the
  references is acceptable — both silently drop money out of every total, which
  is the failure the **Leaf-assignable invariant** exists to prevent. Mirrors the
  guarded delete already used for Issuers.

- **Category total** — the signed sum of every transaction in a category, over
  the **whole filtered set** rather than the current page, served alongside the
  row count so the two can never disagree. For a **Category folder** this means
  every transaction in its **whole subtree**, however deep — a folder's total is
  assembled by descending to its leaves and asking for their ids as one set, not
  by looking one hop down. A one-hop expansion is the classic wrong answer here:
  it understates by exactly the money held below the second level, silently. It follows the view's filters
  (account, month): a total that ignored them would be a number the user cannot
  reconcile with the list beneath it. Signed and net per the **amount sign
  convention** — a refunded purchase nets to zero, and an income category totals
  positive.

- **Seeded categories** — the base tree shipped with a fresh database by a
  one-shot migration; two levels deep as seeded, which is starting shape rather
  than a limit — the user may nest it further. **Starting data, not schema**: the user may rename,
  re-parent, or delete any of it, and nothing ever restores or re-inserts it.
  Changing the base list for future databases means a new migration, never a
  boot-time write — an app that reconciles categories on startup would resurrect
  deliberate deletions and risk duplicating rows (`slug` has no unique
  constraint).

- **Issuer default category** — the Category an Issuer assigns to every
  transaction of its own that carries no **Category override**
  (`issuer.defaultCategoryId`). The bulk lever: changing it reclassifies the
  Issuer's whole history, past and future. Set only on the Issuer, never from a
  transaction — the two surfaces are deliberately split, so the gesture that
  touches one row and the gesture that touches a history cannot be confused.

- **Unassigned** — the display state of a transaction whose derived category is
  absent: its issuer has no `defaultCategoryId` **and** it carries no override
  (this includes transactions with no issuer at all). It means *nobody has
  categorised this yet* — a data-completeness signal, never a user's decision.
  Because it has exactly one cause, it is always actionable: set the issuer's
  default, or override this row.
  _Avoid_: Uncategorised (reserve that for a real Category), none, null.
