# web — glossary

The React frontend. Uploads CSV bank statements, displays transactions in
tables, and lets the user manage accounts and issuers. Talks to the Effect API
(`@mamen/api`) through the typed SDK (`@mamen/sdk`).

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for cross-context terms
(**Issuer**, etc.).

## Language

**Issuer**:
See [CONTEXT-MAP.md](../../CONTEXT-MAP.md). A place money goes to or from. The
user's primary curation task is turning the raw counterparty text on a
transaction into a known issuer.

**Statement**:
One file exported from a bank, covering one account over a date range. The unit
the user uploads. Comes in two shapes — a **CSV** (parsed in-browser by a
**Parser**) or a **PDF** (turned into records by **PDF extraction**). Distinct
from an Import — a single Statement can produce transactions across several
import months.
_Avoid_: File, upload, export.

**Parser** (Statement Parser):
A pluggable module that turns one bank's **CSV** row shape into transaction
records. Declares a header fingerprint (`matches`) for auto-detection and a pure
`parse(rows, ctx)` that maps raw rows to records. The registry runs papaparse
once, then hands parsed rows to the selected parser. Green-Got is the first
parser. CSV-only by design — a PDF Statement has no headers and no synchronous
parse; it goes through **PDF extraction** instead.
_Avoid_: Adapter, mapper, importer.

**PDF extraction**:
The server-side act of turning a **PDF** Statement into candidate transaction
records via an LLM — the AI provider chosen on the settings page: by default the
local `claude` CLI (wrapped by `claude-code-effect`), or a hosted vendor the
statement is sent to as a document. The web
client uploads the PDF to `POST /import/extract-pdf`; the API writes it to a
transient temp dir, has the model read it, and returns **extracted
transactions** plus **declared totals** — never touching the database. The PDF
never persists server-side (temp dir is deleted after the call) and no issuer or
category is assigned at this stage (those are derived post-commit by Matching
Rules, as with CSV). The counterpart of a **Parser**, for the file shape a
parser can't handle.
_Avoid_: Parsing (reserved for CSV), OCR, scanning.

**Extracted transaction**:
One candidate record the model reads off a PDF Statement: `{ date, amount,
rawIssuerString }` — the only PDF-observable fields. Not yet a saved
transaction: the user reviews and corrects it in the **side-by-side validation**
view, then it is enriched (account, import batch, derived month) and committed
through the same path as a CSV record. The `amount` is a single signed number
folded from the statement's Débit/Crédit columns per the amount sign convention;
the model resolves French number format and infers the year from the statement
header, using the operation date (not the value date).
_Avoid_: Candidate, draft, row.

**Declared totals**:
The debit and credit totals the statement itself prints on its summary line
(CCF's `TOTAL DES OPÉRATIONS DU RELEVÉ`), returned alongside the **extracted
transactions**. Not transactions — the statement's own arithmetic, extracted so
the client can run a **reconciliation check**.
_Avoid_: Sum, balance (balances are a different line).

**Reconciliation check**:
A soft client-side integrity check on a PDF import: does the sum of **extracted
transactions** match the statement's **declared totals**? A mismatch raises a
visible warning banner on the validation view — the model probably dropped a row
or picked up a balance/summary line as if it were an operation — but never
blocks commit. The human review is the real backstop; this only tells them where
to look.
_Avoid_: Validation (reserve for the whole review step), audit, gate.

**Side-by-side validation**:
The PDF-flavored preview step: the source **PDF** rendered on one side (native
browser viewer via a blob-URL iframe — no pdfjs), the **extracted transactions**
in an editable table on the other. The user corrects wrong values, deletes
phantom rows, and adds missed ones (edit-in-place) before committing. The CSV
path keeps its own plain-table preview; both converge on the same commit.
_Avoid_: Diff view, comparison.

**Import**:
The result of committing a Statement for one account and one month, keyed
`(accountId, importMonth)`. Committing is **additive**: it inserts the parsed
rows and deletes nothing (issue #88), so a Statement overlapping a month that
was already imported leaves the earlier rows — and every manual decision made on
them — standing. It used to replace the month, which cost the previous statement
its rows whenever two statements legitimately overlapped (the CCF case, epic
#85). The consequence is that re-importing the same Statement **duplicates** it;
the guard is the **already imported** mark in the preview, and holding a row out
is the user's action — a **skipped row** before the commit, bulk delete (issue
#86) after it. The `importMonth` (`"YYYY-MM"`) is derived per-row from each
transaction's date, so one Statement spanning a month boundary yields two
Imports.
_Avoid_: Batch, load, replace (an import replaces nothing).
_Code note_: `importMonth` is **provenance** — the statement a row came from —
and it is the key of the Import alone. The transaction list's Month filter does
*not* read it: it buckets a row by its own `date` (issue #87), because a date
can move after import (a **bundle parent** dated by hand, a corrected date) and
the row must be listed under the month it actually belongs to. The URL param is
still spelled `importMonth`, kept so bookmarked views keep working.

**Already imported**:
A previewed row that matches a row already stored on the same account and month
on *all three* of date, amount and **raw issuer string** — the last compared
after collapsing whitespace runs, trimming and uppercasing, and after nothing
else (issue #89). Purely advisory: the mark is shown per row and counted in the
commit bar, and a marked row still commits. It is what an **Import** has instead
of idempotency, now that committing replaces nothing.

Deliberately strict, and strict in one direction: a missed duplicate costs the
user one delete, while a wrongly marked row risks them deleting a real
transaction on the app's say-so — so no prefix matching, no fuzzy matching, no
amount tolerance. Two genuinely identical rows on one day are real, so one
stored row marks one previewed row, not both. Rows on other accounts are neither
read nor compared: the same transaction on another account is not a duplicate.
_Avoid_: Duplicate detection (nothing is detected and acted on), dedupe (there is
no dedupe key — see epic #85), conflict.
_See also_: **Skipped row** — what a user does about a marked row.
_Code note_: the comparison is `import/duplicates.ts` (pure) and the reads are
`useDuplicateFlags` — one list read per (account, month) the batch touches,
capped at `DUPLICATE_SCAN_LIMIT`. Distinct from a transaction's
`isDuplicateExcluded`, which is a stored decision about a row already in the
table.

**Skipped row**:
A previewed row the user held out of the commit — the recourse for an **already
imported** mark, and the only thing that ever keeps a parsed row from being
written (epic #85). Offered per row on both preview paths: the CSV preview
strikes the row through and keeps a restore control beside it, while the
**side-by-side validation** view deletes it outright, since a PDF's rows are
editable there anyway. A skip is a decision about *this* commit and nothing
else: it writes nothing, stores nothing, and is gone when the wizard is.
_Avoid_: Excluded (reserved for **excluded from recap**), ignored, deselected.
_Code note_: `skippedRows` on the wizard state, ascending indices into the
parsed records. They name records rather than CSV lines, so another file or
another **Parser** clears them.

**Raw issuer string**:
The unparsed counterparty text on a transaction (`rawIssuerString`, e.g.
`"AMAZON EU SARL"`), taken from the CSV's `Intitulé` column. The raw material
the user (or, later, a Rule) resolves into an Issuer.

**Assignment**:
The act of attaching an Issuer to a single transaction (`update({ issuerId })`).
Done by hand (a **manual assignment**, sets `manualIssuer`) or automatically by
a **Matching Rule**. Manual assignments are sticky — rules never overwrite them.
_Avoid_: Match, tag, categorize (as a bare verb).
_Code note_: no transactions surface holds the issuer table. **Naming** a row's
issuer asks for the ids on screen (`useIssuerLookup`, #62); **choosing** one
asks for the row's own issuer plus the names matching what was typed, searched
server-side (`useIssuerSearch`, #79). Only the issuers grid and the
create-issuer duplicate-name guard read the whole list — they are *about* it.
Anywhere else a whole-list read is a bug with a cliff at the page size: past it
a row renders unresolved, or an issuer that plainly exists cannot be picked.

**Matching Rule**:
See [CONTEXT-MAP.md](../../CONTEXT-MAP.md). A single regex `pattern` owned by an
Issuer that auto-assigns that Issuer to matching transactions. The user manages
these to turn cryptic raw issuer strings into known Issuers in bulk. Create /
edit / delete each previews its effect (which transactions gain, change, or lose
an issuer) before applying on save, as does a **rule move**. Assigns **only** an
issuer — category flows through the issuer (**derived category**), never off the
rule.
_Code note_: the entity is `Rule` in the contract/DB/SDK; "Matching Rule" is the
user-facing name only. Each rule row shows its **owned count** (see
[CONTEXT-MAP.md](../../CONTEXT-MAP.md)) worded as what it counts — "3
transactions", never "3 matches". Because that count is derived from the
transactions table, any mutation that moves rows must invalidate `ruleKeys.all`
too, not just `transactionKeys.all` — an assignment, a removed manual pick, an
import commit and every **bundle** mutation all change what a rule owns without
touching a rule. Bundles count because the parent is an ordinary row carrying
the user's label as its `rawIssuerString`, the string the matcher reads: making
a bundle can hand a rule a row, dissolving one takes it back (issue #78).

**Rule move**:
Re-homing a **Matching Rule** from the Issuer that owns it onto another one, in
place on the issuer detail page (issue #94). The rule keeps its identity — its
pattern and its value / account / sign matchers travel with it — so the write is
a rule update carrying **only** `issuerId`, and the rows it owns re-home
atomically with it (and may change category, which is derived through the
issuer). Two stages in one growing panel: search for the target (the rule's own
issuer is never offerable — moving it there is a no-op), then read the dry-run
and confirm. The dry-run is the ordinary rule preview pointed at the prospective
issuer, of which the panel shows two lists: **will reassign**, and
**manual collisions** read-only, since a hand-assigned row will not follow the
rule and dropping its hand pick already has two homes elsewhere.
_Avoid_: **transfer** (that is a matched pair of transactions between accounts —
see [CONTEXT-MAP.md](../../CONTEXT-MAP.md) — and a term means one thing
everywhere; the row's icon is `Replace`, deliberately not `ArrowRightLeft`),
reassign (that names what happens to the *transactions*, not to the rule).
_Code note_: frontend-only — the whole write path already existed. The panel
warns, client-side, when the target already owns a rule with the identical
pattern: nothing breaks (specificity still picks a winner) but the target would
gain a duplicate reading "0 transactions", indistinguishable from a broken rule.
The warning informs and never blocks, and no conflict error was added to the
contract. A move is also the one rule write whose outcome is invisible on the
page you stay on — the row simply leaves — so it raises a **success** toast
naming the target, departing from `useRuleMutations`' errors-only style.

**Amount sign convention**:
`amount` is a single signed number. A CSV `DEBIT` (money leaving) is stored
**negative**; a `CREDIT` (money arriving) is **positive**. The sum of a set of
transactions is therefore net cash flow.

**Path prefix**:
The app is served under `/app`, not at the site root, so the deployment keeps
its root for public landing pages (issue #111). The value is `APP_BASE_PATH` in
`@mamen/shared`; this package consumes it twice — as Vite's `base` and as the
router's `basepath` — and the routes themselves stay written from `/`, because
the router applies the prefix. Consequences when writing code here: never write
a rooted URL to a `public/` asset (`/icon-192x192.png`), since Vite rewrites
those only in `index.html` and in CSS — build them off `APP_BASE_PATH_SLASH`;
and never prefix `/api` or `/uploads`, which stay at the root and are reached
same-origin through the dev proxy or nginx.
_Avoid_: base URL (that names the API's origin, `VITE_API_URL`).

**AI settings page**:
See [CONTEXT-MAP.md](../../CONTEXT-MAP.md). `/settings`, built in
`features/ai-settings/`. Two things about it are this package's, not the
domain's:

- **It is composed, not written.** Every visible part is a gousse component
  vendored from the registry (ADR 0003) — `CredentialTile`/`CredentialGrid`,
  `SecretField`, `ProviderMark`, `SettingsCard`/`SettingRow`, `ModelRow` and
  their `Spinner`/`SavedFlash` dependencies. They were built for this screen;
  mamen adds the data and the handlers and nothing else. Issue #120's ticket
  called gousse "a new dependency" — it is not one, and must not become one:
  `shadcn add @gousse/…` copies the source in, and `gousse-package-removed.test.ts`
  is what keeps the npm package and its private-registry credential out.
  `shadcn add` **overwrites** `button`, `input`, `select`, `field-chrome` and
  `utils` in place, all of which mamen owns and has edited, so a pull is
  followed by reverting those five.
- **No local copy of a selection.** The selects read the query's data directly,
  which is what makes a refused save correct with no code: nothing was written,
  so nothing re-renders, and the control shows what is stored rather than the
  choice the server rejected. The one piece of local state is the **draft** in
  a `SecretField`, and it is dropped the moment the value is stored.

_Avoid_: settings view (the route is `/settings` but the feature is the AI one;
a second settings area becomes a layout around two views).

**Import's route to Settings**:
The upload step's alert carries a **link** to `/settings` for exactly one
failure — `AiProviderNotConfigured`, the extraction that could not run because no
credential is stored (issue #122; most often no Claude Code token). Every other
extraction failure ends at the drop zone in front of the user, so its copy says
"try again"; this one cannot be fixed there at all, and a sentence naming a page
is not the same as taking someone to it.

Which failure it was is `useState` in `upload-step.tsx`, not a field on the
wizard reducer: the reducer's `error` is the *sentence*, and nothing else in the
wizard — preview, commit, hand-off — has any use for the distinction. It is
cleared on every dropped file, so a CSV that then fails to parse cannot inherit
the previous PDF's link.

**Page layout** / **topbar**:
`PageLayout` (`components/page-layout.tsx`) is the shape a page has: a **topbar**
row — the page's title, the sidebar-reopen trigger, and that page's own actions —
above the page's content (issue #125). A page names what is *in* the row and
nothing about how the row is laid out; `className` is Tailwind-merged over the
page column so a view can still cap its width or re-space itself.

The trigger inside it is still `PageHeader`'s — composed, not re-implemented, so
there is one place that decides when it renders (only while collapsed) and one
place that hands `AppShell` the ref it focuses. The collapse flag itself is the
shell's throughout; the layout only reads it, through the sidebar-collapsed
context, which is why any page's trigger drives the same panel.

**Adoption is partial.** Accounts and Transactions render through it; the other
six title rows still call `PageHeader` directly and compose their own row, which
is why `PageHeader` is a public component rather than an implementation detail.
Sweeping the rest is a follow-up to #125.

A page mounted in a test outside `AppShell` has no context and `PageHeader`
throws, so a view test drives the layout with a stand-in provider rather than the
real shell.

_Avoid_: header (the `<header>` element is the topbar's markup; the *page header*
is `PageHeader`, one part of it).

<!-- Terms are added here as they are resolved during design. -->
