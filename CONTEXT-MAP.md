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

- **Matching Rule** — a regex `pattern`, optionally paired with a **Value
  matcher**, owned by one Issuer that auto-assigns that Issuer to any transaction
  whose **raw issuer string** matches (and whose amount matches, when a value is
  set). An Issuer may own several; together they are the Issuer's rule set. *In
  code the entity is `Rule` / `RuleId` / `rules` — the "Matching Rule" name is
  UI/glossary-only, chosen so users don't confuse it with other kinds of rule.* A
  rule assigns **only an issuer**, never a category (category is derived — see
  **Derived category**). A rule that should *re-categorise* a subset (Amazon Prime
  out of Amazon) does so by pointing at a **narrower issuer** carrying its own
  default category, never by carrying a category itself — see
  [ADR 0004](./docs/adr/0004-value-matcher-rides-the-issuer.md).

- **Owned count** — how many transactions a **Matching Rule** currently wins,
  i.e. the rows for which it is the specificity winner *right now*. Derived from
  the live table on every read (`RuleView.ownedCount`), never stored: it falls
  when a sibling rule out-specifies this one, a row is hand-assigned away, or a
  transaction is deleted. Supersedes the stored `matchCount` column, a lifetime
  tally of import-time wins that nothing displayed as such and that a rule
  written against existing history never accumulated (issue #63).
  _Avoid_: match count (it is not a count of matches — a rule can match a row and
  lose it to a more specific rule).

- **Value matcher** — an optional second predicate on a **Matching Rule**
  (`matchValue`, a positive amount magnitude): when set, the rule matches a row
  only if its pattern matches the raw issuer string **and** the row's amount
  magnitude equals `matchValue` to the cent (`round(abs(amount)·100) ==
  round(matchValue·100)` — money is integer cents, never a float `===`). Sign is
  irrelevant: the user matches "6.99", the engine compares magnitudes. A rule
  with no value is a plain regex rule (every rule before this feature). Its whole
  purpose is to let one issuer-string fork by amount — an Amazon `6.99` (Prime)
  routed to a different Issuer than a general Amazon charge.
  _Avoid_: amount matcher, price rule (the field is a match predicate, not the
  transaction's amount).

- **Manual assignment** — a human directly choosing a transaction's issuer or
  category, recorded by the `manualIssuer` / `manualCategory` flags. Manual
  assignments are **sticky**: Matching Rules never overwrite them. The issuer
  flag mirrors the pre-existing category flag.

- **Issuer invariant** — a transaction's issuer is, in priority order: its
  **manual assignment** if `manualIssuer` is set; else the **specificity-winner**
  among all Matching Rules that match the row (pattern matches the raw issuer
  string **and**, if the rule has a **Value matcher**, the amount matches too);
  else **unmatched** (no issuer). Specificity, in order: a rule *with* a value
  matcher outranks one without (a value predicate matches a strict subset, so it
  is more specific); then longest literal (regex metachars stripped); then newest
  rule. This ordering is what lets a value-rule (Amazon + `6.99`) win over the
  broad regex-only rule (Amazon) it shares a literal length with, robustly rather
  than by createdAt luck. The invariant holds after every operation — import, and
  rule create / edit / delete — each of which re-derives the affected rows and
  (except manual) makes the table reflect the best current rule.

- **Derived category** — a transaction's category is read *through* its issuer
  (`issuer.defaultCategoryId`) at query time, not copied onto the transaction —
  so re-categorising an issuer reclassifies all its history for free. The
  exception is a **Category override** on a single transaction
  (`manualCategory` + `categoryId`), which wins over the issuer's default.
  This is what powers the category-spend **recap** graphs.

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
  visible in the **recap**.
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

- **Extracted transaction** — one candidate operation lifted from a PDF bank
  statement by the extraction endpoint, before any account/batch/month is
  stamped: `{ date, amount, rawIssuerString }`. The field names mirror a
  transaction's core so the client can thread them straight into a create at
  commit. `amount` is **one signed number** folding the statement's separate
  Débit (negative) / Crédit (positive) columns; `date` is the **operation date**
  (not the value date) with the year inferred from the statement header;
  `rawIssuerString` is the merged operation label (multi-line descriptions
  collapse to one string). It is a *candidate*, never a persisted row — see
  [ADR 0005](./docs/adr/0005-pdf-extraction-runs-server-side.md).
  _Avoid_: parsed transaction, imported transaction (nothing is imported until
  the user commits, issue #45).

- **Declared totals** — the statement's own printed `TOTAL DES OPÉRATIONS`
  figures, echoed back beside the extracted rows (`{ debit, credit }`, both
  positive magnitudes exactly as printed). Not a sum the server computes — the
  bank's own total, carried so the review/commit step can reconcile the
  extracted rows against what the statement declared.

- **Server-side extraction** — PDF import extracts candidates on the API server
  (via the `claude` CLI through `claude-code-effect`), not in the browser: the
  OAuth token stays a server secret and the model reads the staged file through
  its own `Read` tool. The upload lives only in a **transient temp dir** deleted
  on every exit path — nothing persists, no row is written. The whole extraction
  failure taxonomy collapses to a single client-visible **`ExtractionFailed`**
  (real tag logged server-side); `InvalidFileType` is the one other, client-
  fixable, error. See [ADR 0005](./docs/adr/0005-pdf-extraction-runs-server-side.md).

- **Inherited colour** — a Category whose `color` is **null**, meaning *I never
  chose one*: the colour it paints is its nearest ancestor's, found by walking
  `parentId` up to the first non-null value (a neutral constant if the walk
  reaches a null root). Null is a *reference*, not a missing value — recolouring
  a **Category folder** recolours every descendant that never opted out, in one
  write. A Category that stores its own colour stops inheriting. Every leaf in the
  **seeded categories** is null after the migration, since each merely held a copy
  of its folder's colour. See
  [ADR 0006](./docs/adr/0006-category-colour-is-inherited-icons-are-lucide-names.md).
  _Avoid_: no colour, default colour (the colour is neither absent nor a default —
  it is the ancestor's).

- **Resolved colour** — the colour actually painted for a Category: its own
  `color`, or the result of the **inherited colour** walk. Every read site must
  resolve rather than read the field, which is why resolution takes the whole tree
  and not one row.

- **Icon name** — a Category's `icon`, holding a **Lucide** icon id in kebab-case
  (`shopping-cart`), not an emoji and not the PascalCase React export. The id is
  Lucide's own canonical key, so it survives export renames and matches what the
  picker searches. An unresolvable name renders a fallback glyph rather than
  nothing. Icons are assigned **only to categories** — never directly to an
  Issuer, which gets its icon through its **issuer default category**. See
  [ADR 0006](./docs/adr/0006-category-colour-is-inherited-icons-are-lucide-names.md).
  _Avoid_: emoji, icon key, icon component.

- **Avatar fallback chain** — what an issuer avatar paints, in priority order: its
  `imageUrl`; else the **icon name** of its **issuer default category** on that
  category's **resolved colour**; else a neutral grey `?`. The grey state is
  purely presentational — it is *not* the seeded *Uncategorised* Category, and an
  issuer with no category renders it without any lookup. See
  [ADR 0007](./docs/adr/0007-issuer-images-are-normalised-search-is-server-side.md).
  _Avoid_: uncategorised avatar (that name implies the real Category), initial
  fallback (the letter is gone).

- **Normalised issuer image** — the single stored form of every issuer image,
  whichever path it arrived by: **128×128 WebP, cover-cropped**, original
  discarded. Sized for a 48px avatar at 2×; cover-cropped because the avatar is a
  circle. Both the manual upload and the **Logo search** run the same pipeline, so
  there is exactly one class of image on disk. The 2 MiB upload cap survives as a
  *pre-resize* guard bounding what sharp is asked to decode. See
  [ADR 0007](./docs/adr/0007-issuer-images-are-normalised-search-is-server-side.md).

- **Logo search** — picking an issuer image from Google Programmable Search
  results instead of uploading a file. The query runs **server-side** (the API key
  is a server secret) and is pre-filled with `<issuer name> logo`; it fires only on
  **explicit submit**, never per keystroke and not on a debounce, because the free
  tier is 100 queries/day and a debounce bounds rate but not total spend. Quota
  exhaustion is reported as itself, since retrying cannot help. The download step
  is an **SSRF sink** — it fetches a URL from inside the API's network — and is
  guarded by HTTPS-only, private/loopback/link-local IP rejection at every redirect
  hop, a byte cap and a timeout. Auth and rate-limiting are **deferred** and must
  land before public deployment. See
  [ADR 0007](./docs/adr/0007-issuer-images-are-normalised-search-is-server-side.md).
  _Avoid_: image search (the intent is a logo), Google Images (no such API — it is
  Programmable Search with `searchType=image`).

- **Recap** — the spend summary over a **period** (a month, a calendar year, or
  all time), broken down by issuer and by category and narrowable by account. It
  answers *where did the money go*, so it sums **spend only**: debits, shown as
  positive magnitudes, ranked high→low. Not every row reaches it — a **transfer
  group**'s legs, a transaction **excluded from recap**, and a **bundle member**
  (its **bundle parent** stands in for it) are all held out. A **refund** is held
  out by nothing: its credit is simply not a debit, so the spend-only rule
  already drops it — whether it should also *reduce* the debit it repays is a
  question about netting (#65), not a fourth partition. Which rows count is
  one predicate, `countsTowardRecap`, defined once beside the **derived category**
  expression and never restated per surface: a second copy is a second definition
  of "counts toward spend", and the two drift. It states **every** one of those
  holdings-out itself, including the bundle one (#80) — a clause the predicate
  leaves to a default of the query around it is a rule that happens to hold,
  not one the predicate keeps. The totals are summed **in SQL over
  the whole period** (issue #71) — there is no page, no row cap and no partial
  answer; the client only names the buckets it is handed.
  A period is always a bound on the transaction **date**, never on the **import
  month**: import month is provenance (the statement a row arrived on, which is
  per-account-per-statement), while spend happens when the transaction happens.
  Bucketing the month view by it made the same row land in different buckets in
  the month and year views.
  _Avoid_: dashboard, report, stats, overview.

- **Excluded from recap** — a transaction that does not count toward spend
  totals: a movement between the user's own accounts the **transfer group**
  feature never caught, a correction, a row the user has decided is noise.
  Excluded rows stay **fully visible** in the transactions list, carrying their
  own row colour — exclusion is about arithmetic, not visibility. The state is
  **derived through the issuer**, exactly as **derived category** is: a per-row
  `manualExcluded` flag wins, else the row inherits its issuer's
  `excludedFromRecap` default — see
  [ADR 0008](./docs/adr/0008-recap-exclusion-is-derived-through-the-issuer.md).
  An excluded row is never **uncurated**: there is no review owed on money that
  is deliberately outside the totals.
  _Avoid_: ignored, hidden, archived, disabled (each says the row leaves the
  screen; only its money leaves the total). Distinct from `isDuplicateExcluded`,
  which claims *this row is a duplicate of another*, not *this row is not
  spending*.

- **Curation** — the work of turning a raw bank row into a reviewed one: giving
  it an issuer, a category, or a note. The user's day-to-day job in this app, and
  what the transactions table is laid out around.
  _Avoid_: tagging, cleaning, triage.

- **Uncurated** — a transaction on which **none** of the three has happened: no
  issuer, no **derived** category (so a row categorised through its issuer counts
  as curated, and the tint matches what the row displays), and no note (a
  whitespace-only note is not curation). Derived, never stored — one predicate in
  the transactions repository backs both the *Uncurated only* filter and the red
  row tint, so the filter and the tint cannot disagree. Narrower than
  **Unassigned**, which is about the category alone: a row with an issuer but no
  category is unassigned and *curated*. A row **excluded from recap** is exempt
  from the question altogether — not uncurated, and not curated either: the
  *Uncurated only* filter drops it, so does its complement, and the exclusion
  wash replaces the red tint on a bare excluded row.
  _Avoid_: unreviewed, untouched, incomplete, dirty; and *uncategorised* (that
  names a real Category, and curation is three fields, not one).

- **Transfer group** — a set of transactions that are one internal movement
  between the user's own accounts, linked by a shared `transferGroupId` (the
  smallest member id, so every leg carries the same value). Its legs sum to
  **zero** to the cent, which is what makes it safe to net out: the whole group
  vanishes from the **recap** rather than counting as a debit and an income. A
  leg belongs to at most one group; groups are suggested by date-and-amount
  proximity but only ever created by an explicit confirmation, and a group that
  falls below two legs is dissolved rather than left standing. A leg is never
  also a **bundle member** — the two groupings are mutually exclusive and each
  write path refuses the other's rows, so a row bundled or bundling is neither
  suggested as a counterpart nor accepted as a leg. Linking one is refused with
  `TransferInvalid` / `is-bundled`; the refusal from the other side carries the
  bundle's own error — see **Bundle**.
  _Avoid_: transfer bundle (a **bundle** is the other grouping), internal
  payment, move, self-payment.

- **Transfer leg** — one transaction inside a **transfer group**: the debit leg
  (money leaving) or the credit leg (money arriving). "Leg" is the unit the
  zero-sum check, the suggestion pairs and the netted-out summary all count in.
  A leg's **counterpart** is another leg of the same movement — the word the
  suggestion path already uses (`suggestTransferCounterparts`).
  _Avoid_: side, half, pair member (a group is **two or more** legs, never fixed
  at two, so any word implying exactly two mis-states the shape); transfer
  transaction (every leg is one — *leg* is the word carrying the information).

- **Refund** — a credit that repays an earlier debit: a reimbursement from a
  person, a returned purchase. Two fields carry the pairing — `isRefund` marks a
  row as one, `linkedRefundId` names the row it repays. Which side holds them is
  **not yet settled**: a single `linkedRefundId` fits the **credit** carrying
  both, with the debit found through the reverse filter that already exists, but
  #65 owns the choice. It is deliberately **not** a **transfer group**: a
  transfer moves the user's own money between their own accounts and nets to
  zero, while a refund is money arriving from outside and may be **partial**
  (20 € back against a 50 € spend), so the pair cannot simply be dropped the way
  a transfer is — 30 € of real spend survives it. Whether the **recap** nets
  that remainder inside the debit's own issuer and category buckets or drops
  both rows is likewise open (#65). Same-account is the ordinary case — the
  reimbursement lands where the spend left — and it is exactly what the transfer
  suggestion cannot express, since that only ever pairs rows in two *different*
  accounts. The two are kept disjoint at the write path: a row with either refund
  field set is refused as a **transfer leg** (`is-refund`), so a credit is never
  netted out twice. Modelled but not yet acted on — the columns, contract fields,
  list filters and detail-page display exist, while nothing sets the flags and
  the **recap** ignores them; issue #65 owns the write path and the netting rule.
  _Avoid_: reversal, chargeback, credit note (each names a bank-side mechanism,
  not the user's pairing), refund group (**group** is reserved — see **Category
  folder**), negative spend.

- **Bundle** — several transactions treated as **one** for the **recap**, for a
  cost the bank tells in more than one row: 200 € of groceries on a weekend away
  and 150 € paid back over the following week is one 50 € weekend, not a large
  debit filed apart from an unexplained credit. A bundle has a **bundle parent**
  carrying the label, issuer, category and notes, and two or more **bundle
  members**, which are the real bank rows. It is **not** a **transfer group**:
  a transfer nets to zero and disappears from the recap, while a bundle nets to
  a non-zero amount and counts as exactly one line. The two are mutually
  exclusive — a row that was both would be netted out by the transfer partition
  while still displaying its share of the bundle's total, which is a number that
  disagrees with itself — and the exclusion is **enforced on both write paths**:
  bundling refuses a **transfer leg** and transfer-linking refuses a **bundle
  member** *or* a **bundle parent** (a parent for a second reason too — its
  amount moves with its members, so a zero-sum group validated at link time
  could silently stop summing to zero). One rule, **two refusals**: each
  direction is answered by the error its own grouping already raises —
  `BundleInvalid` / `is-transfer-leg` from the bundling endpoints,
  `TransferInvalid` / `is-bundled` from `link-transfer` — never a third type for
  the one rule, and never one grouping's error raised by the other's endpoint.
  That split is deliberate (issue #81): the error tag is the client's
  discriminant and each endpoint declares only the errors it can produce, so a
  caller is told the refusal in the vocabulary of the endpoint it called. Every
  surface that offers either action shows it disabled with the reason rather
  than letting the request fail. Membership is
  **mutable**: a row can join an existing
  bundle or leave it, and every such change — including a member being deleted —
  recomputes the parent through one shared routine, the single point where a
  bundle's number could otherwise go stale. A bundle that would be left with
  fewer than two members **dissolves** rather than standing for a single
  transaction, exactly as an undersized **transfer group** does. A bundle never
  contains a bundle: only the inner parent would ever be recomputed, so the
  outer total would drift. A bundle is a **cost**, so its members sum to a
  debit; one that sums to zero (everyone paid back exactly) or to a credit
  (someone overpaid) is handled by the ordinary sign rules with no special case
  — it simply reaches no spend bucket — but it usually means a *mis-bundling*,
  so the parent carries an **anomaly flag** saying so. The flag warns and
  nothing more: the amount stays whatever the members say, and the fix is to add
  or remove a member. A bundle also **does not survive a delete** that takes any
  of its rows: every bundle the deleted scope touches is dissolved — including
  one only *partly* inside it, whose parent may sit in another month or account
  entirely — and the count is reported *before* the rows go. Re-attaching the
  members afterwards is manual: a transaction has no dedup key to re-match them
  by, and inventing one would silently mis-match a statement that genuinely
  changed. An **import** never triggers this (issue #88): committing one only
  ever adds rows.
  _Avoid_: group (already reserved — see **Category folder**, **Transfer
  group**), merge, combine, split.

- **Bundle parent** — the row that stands for a **bundle**: a *synthetic*
  transaction living in the `transactions` table beside the real ones (told apart
  by a `kind` discriminator), so it sorts, pages, filters, searches and is edited
  through every surface a transaction already has. It carries the bundle's
  identity — label (in `rawIssuerString`, which already means *the human-readable
  name of this row*), issuer, category, notes — and its amount is **always the
  sum of its members**, never stored independently of them: a late refund joining
  the bundle just changes the number — and is editable nowhere, since a total
  that could drift from the bank rows beneath it would stop being evidence. Its
  date defaults to the earliest member's and may be overridden (flagged
  `manualDate`, which is what carries the override through every later
  recompute), because the cost belongs to when the money was spent, not to when
  the last person settled up. In the transactions table it carries an
  **expand** affordance and a wash of its own — a *structural* colour, so it
  survives the parent's curation state (a fresh bundle is **uncurated** by
  construction) but yields to the **excluded from recap** wash, which is about
  arithmetic. One wash per row: excluded, then bundle parent, then uncurated.
  _Avoid_: virtual transaction, container, header row, master.

- **Bundle member** — a real bank row pointing at its **bundle parent** through
  `bundleId`. Members are hidden from the top level of the transactions list and
  from its signed total, since the parent already accounts for them and showing
  both double-counts; they stay reachable by expanding the parent, and are shown
  there for reading, not counted again. They travel with the page that holds
  their parent — the list envelope's own `bundleMembers` field, beside `items`
  rather than among them — so expanding costs no request and changes no total. Bundling never touches a member's own
  issuer, category or notes, so dissolving a bundle returns each member exactly
  as it was. A member can leave on its own, and deleting one goes through the
  same cleanup a deleted **transfer leg** does: the parent it left is
  recomputed, never left summing a row that is gone. **Deleting the parent
  releases its members rather than deleting them** — it stands for them, it does
  not own them. A member falling inside a re-imported statement (or a deleted
  import batch) is the one case that does not recompute but **dissolves** the
  whole bundle, parent included: the row is not being edited, it is being
  replaced by a different one.
  _Avoid_: child transaction, sub-transaction, line item.

- **Anomaly flag** — a *soft* signal attached to a transaction (`anomalyFlags`,
  a JSON array on the row): something about this row is worth a second look.
  Every flag **warns and nothing more** — no write is refused, no amount is
  altered, and no total moves — and each one is a live condition rather than a
  history: it is re-derived where the thing it is about is computed, and clears
  itself when the condition goes. A flag the user has **dismissed** stays on the
  row, dimmed, and is never raised a second time while it stands. Kinds:
  `high-amount`, `new-issuer`, `potential-duplicate`, and `non-negative-bundle`
  (a **bundle** whose members sum to zero or to a credit — see **Bundle**), the
  first the server raises for itself. They surface in one place, the transaction
  detail page, which is read-only about them.
  _Avoid_: error, warning badge, validation (nothing is invalid — a flagged row
  is a correct row worth looking at), alert.
