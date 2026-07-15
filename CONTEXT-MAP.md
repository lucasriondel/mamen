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
  screen. A category reads as its **Category leaf** name alone (*Groceries*); the
  folder is navigation, not identity, and never appears in a table cell.

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

- **Category folder** — a Category with no parent, used purely to group and
  navigate (*Food*, *Transport*). A folder is **never assignable** to a
  transaction; it exists so its children read well in a list. Its total is the
  sum of its children's, with no directly-assigned transactions of its own to
  double-count.
  _Avoid_: Parent category, group, top-level category.

- **Category leaf** — a Category with a parent, and the **only** kind that can be
  assigned to a transaction or to an Issuer (*Food > Groceries*).
  _Avoid_: Subcategory, child category.

- **Two-level invariant** — every assignable Category sits at depth 2 exactly: a
  **Category leaf** may not own children, a **Category folder** may not be
  assigned. Enforced at the API boundary, not merely in the UI, because the
  totals on the category page are silently wrong if it is ever violated and the
  UI is not the only writer (seeds, imports, future auto-categorisation).

- **Guarded delete** — deleting a Category is refused while anything depends on
  it: a folder with children, or a leaf still assigned to transactions or held as
  an **Issuer default category**. The refusal names what depends on it, so the
  user can re-assign first. Neither cascading the delete nor nulling the
  references is acceptable — both silently drop money out of every total, which
  is the failure the **Two-level invariant** exists to prevent. Mirrors the
  guarded delete already used for Issuers.

- **Category total** — the signed sum of every transaction in a category, over
  the **whole filtered set** rather than the current page, served alongside the
  row count so the two can never disagree. It follows the view's filters
  (account, month): a total that ignored them would be a number the user cannot
  reconcile with the list beneath it. Signed and net per the **amount sign
  convention** — a refunded purchase nets to zero, and an income category totals
  positive.

- **Seeded categories** — the base two-level tree shipped with a fresh database
  by a one-shot migration. **Starting data, not schema**: the user may rename,
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
