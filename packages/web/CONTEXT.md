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

**Account-first upload**:
The order of the wizard's step 1: the target account is picked **before** the
drop zone will take a **Statement**, and the zone sits there visibly inert until
it is (issue #181). Dropping a PDF therefore no longer starts **PDF extraction**
on the spot — nothing is sent anywhere until the account is known.

The reason is not the account itself but what hangs off it: a Statement Format
belongs to one account (PRD #180), so neither path can choose one until the
account is settled, and the extraction prompt cannot be built without it. The
gate is `canAcceptFile` on the wizard reducer, which ignores `file-parsed` and
`extract-start` while there is no account — the ordering is a property of the
state machine, not of one component's `disabled` attribute, which is what makes
"no file is read before the account" true of the drag path too.

Two consequences downstream: a successful extraction lands straight on
**side-by-side validation** (the account it used to wait for is already in
hand), and a grid handoff carrying no account is dropped rather than seated in
front of a user who still owes one — the accounts grid always sends both.
_Avoid_: Gate, lock (the zone is inert, not refusing).

**Statement Format**:
Defined in [CONTEXT-MAP.md](../../CONTEXT-MAP.md) — it became a contract entity
with a table of its own in issue #183, so it means the same thing here, in the
contract and on the server.
_Code note_: the browser reads the **stored** record since issue #184 — the
wizard fetches one account's formats through `statementFormatQueries.list` and
applies the chosen one locally, so there is one vocabulary (the contract's) and
web has no narrower copy of it. Web ADR 0001 is untouched by that: a format is
ordinary contract data the client fetches, and the statement's rows still never
leave the browser. `parsers/formats.ts` keeps Green-Got as a *reference* record
rather than a registered one — nothing imports it at runtime, it drives the
applying suite against the shipped fixture, and
`scripts/scrub-bank-statements.sh` reads `GREEN_GOT_HEADERS` out of it to check
the fixture still carries the columns the format needs. The real Green-Got is
authored by a user through the UI (PRD #180 declines to seed it) — which is what
the **mapping step** is for since issue #186.

**Parser** (Statement Parser):
The code that **applies** a **Statement Format** to a **CSV**'s rows — not a
module that embodies one bank. `applyFormat(format, rows, ctx)` is pure: a
format, the rows and the context the file cannot supply go in, records come out,
no I/O and no network (web ADR 0001). Each record names the `sourceIndex` it was
read from, because the format's row filter drops rows it won't import, and that
join is the only way the preview can put a row's **stable row id** on the record
it produced. Detection is a separate pure function over the format records:
`detectFormat(headers, formats)` in `parsers/detect-format.ts` answers with one
of four verdicts — a format, **nothing matched**, **several matched**, or **no
formats yet** — over the account's stored formats, which are its candidates
rather than a module-level set. It applies to a **format draft** too
(`parsers/format-draft.ts`), which is why `applyFormat` takes a `FormatToApply`
— the mapping and the rules — rather than a whole stored record: a format being
authored has no id to be applied by, and its live preview has to be the same
reading the import will do.
**The most specific match wins.** A bank that changes its export earns a *new*
format rather than an edit to the old one (PRD #180), so the newer record's
fingerprint is a strict superset of the older's: requiring the most headers is
exactly "asked the most of this file", which reads a post-change file with the
new format and a pre-change one with the old, neither asking the user. A genuine
tie — two formats demanding as much of each other — is not guessed at.
The wizard runs papaparse once, then applies the selected format. CSV-only by
design — a PDF Statement has no headers and no synchronous parse; it goes through
**PDF extraction** instead, and a PDF format is never a detection candidate
because it declares the columns to ask a model for rather than a fingerprint.
**The mapping decides what is promoted, never what is kept** (issue #187). Every
record carries the whole delivered row as **raw source** — a copy, every key
included, the mapped ones too — so a column nothing reads today is readable
tomorrow without a re-import. The **Counterparty IBAN** is reached through
`mapping.counterpartyIban` rather than a column name the applying code knows, so
a bank that calls that column something else still populates the field, and one
that writes no counterparty account number says so with a `null` and imports all
the same. A blank, an absent and an unpromotable value (`isPlausibleIban`) all
come out **absent** rather than as an empty string, because "not given" gets one
spelling — and the delivered form stays in the archive either way (ADR 0012).
Nothing derives from the archive, which
`src/test/raw-source-is-an-archive.test.ts` holds the whole repo to.
_Avoid_: Adapter, mapper, importer.

**Format picker**:
The `<select>` on the upload step naming which **Statement Format** reads the
dropped **CSV**. On screen for *every* CSV import since issue #184, not only
when detection came up empty: detection **preselects**, and a user who
disagrees with a successful detection needs the same control to say so. It
lists exactly the account's `csv` formats — never a PDF one, which carries no
fingerprint and could only ever fail against a CSV — and a manual pick silences
whatever the hint below it was saying, because the user has answered the
question it was asking.

**Nothing matched** / **several matched** / **no formats yet**:
The format picker's three hint states, and three different facts. *Nothing
matched* means no format the account holds fingerprints this file; *several
matched* means more than one does, equally specifically, and neither is more
specific than the other; *no formats yet* means the account has no CSV format at
all, so nothing could have matched — an account whose only formats are PDF ones
is here too. The first two were a single "Format not recognized" line before
issue #184, which made the app understanding a file **twice over** read as not
understanding it at all; the third was folded into *nothing matched* until issue
#186, which made a brand-new account read as a rejection. All three leave the
format unchosen and the preview out of reach — nothing is guessed at — and all
three are settled either by the user picking or by the **mapping step**.
_Avoid_: Unrecognised, unsupported (for *several matched* — the file was
recognised, more than once); failed, rejected (for *no formats yet* — nothing
was refused).

**Mapping step**:
The wizard step between upload and preview, reached only when no **Statement
Format** applies to a dropped CSV — the three hint states above are its three
routes, and they behave identically apart from the sentence at the top (issue
#186). It shows the file's **real headers** as the choices and collects the
format's name, the four mapped targets, the sign rule, the date order, the
decimal separator and the optional row filter.

It is **offered, not forced**: the picker stays on screen, so a user whose file
one of their formats can read still picks it, and a detected format offers
nothing to build at all.

The **live preview** under the form parses the file's real rows through
`applyFormat` — the same function the import runs, reached through
`draftRules(draft)` — and re-reads them on every change. It is the only thing
that makes a wrong date order or decimal separator visible before it becomes
stored data: `03/04/2026` is a real date under either order and `1 929,71` a real
number under either separator, so the wrongness is a plausible value rather than
an error. Both are unanswered when the step opens, because a default here is a
guess the user never made.

The draft lives in `WizardState.draftFormat` and is written **only** by the
commit, alongside the rows (`commitImport(records, format)`). Abandoning the
import therefore leaves nothing behind, and the account never fills with drafts
from imports nobody finished. The format is created *before* the rows: a failed
create writes nothing and the retry is clean, where the other order would have
the retry duplicate every transaction.
_Avoid_: Wizard step 2 (the preview is that), column editor, schema builder.

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
Since issue #185 the upload carries the **Statement Format** to read the
statement with, whose declared columns are what the model is told the file
carries — so the wizard settles *which* format before it sends anything. With
exactly one PDF format on the account that costs nothing: it is the only answer
there is and it is used without an ask. With several, the file is held in wizard
state (`pendingPdf`) and the user picks; the model is never asked to choose the
format as well as apply it (PRD #180). With none, the drop is refused, because a
prompt describing French statements in general is the guessing this work removed.
The **mapping step** does not rescue this path: it builds a format from a file's
real headers and previews its real rows, and a PDF has neither until extraction
has already run — which is the extraction this account cannot do. Authoring a PDF
format is the mismatch flow's (issue #188).
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

It sums **every** extracted row, **skipped rows** included, while the commit bar
counts only the kept ones. The two counts answer different questions — did the
model read the statement correctly, versus what is about to be written — and
summing kept rows here would fire the banner on every deliberate skip until the
user learned to ignore it. Counter-intuitive on purpose; not a bug to fix.
_Avoid_: Validation (reserve for the whole review step), audit, gate.

**Side-by-side validation**:
The PDF-flavored preview step: the source **PDF** rendered on one side (native
browser viewer via a blob-URL iframe — no pdfjs), the **extracted transactions**
in an editable table on the other. The user corrects wrong values, skips the
phantom ones (a **skipped row**, since issue #192 — it used to delete them), and
adds missed ones (edit-in-place) before committing. The CSV path keeps its own
plain-table preview; both converge on the same commit.
_Avoid_: Diff view, comparison.
_Code note_: the panel is a real table since issue #193 — TanStack Table over the
**candidate-table primitives**, columns *skip | date | raw issuer | amount*. The
skip is a checkbox in front of the values rather than the pair of icon buttons it
used to be: checked *is* skipped, so one control says the state and reverses it.
The transactions grid is deliberately not reused, and the two previews stay two
components — one is editable with an add-row control and a reconciliation banner,
the other is neither, and collapsing them would mean one component steered by a
handful of capability flags.

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
written (epic #85). Offered per row on both preview paths: the row is struck
through and restorable, and its editable fields (where it has any) are disabled
while it is skipped. On **side-by-side validation** the control is the table's
skip checkbox (issue #193); the CSV preview still carries the icon-button pair
until it adopts the same table (issue #194). A skip is a decision about *this* commit and nothing else:
it writes nothing, stores nothing, and is gone when the wizard is.

The **side-by-side validation** view used to delete a row outright instead, on
the grounds that a PDF's rows are editable there anyway. That reasoning is
retired by issue #192: a skipped row's inputs are inert, so deleting bought
nothing that skipping does not, and cost reversibility. Adding a row the
extraction missed remains a separate control — it solves the opposite problem.
_Avoid_: Excluded (reserved for **excluded from recap**), ignored, deselected.
_Code note_: `skippedRows` on the wizard state — a set of **stable row ids**
since issue #192, one identity model for both paths rather than the ascending
indices the CSV path used to carry. It is cleared by another file, a parse error,
another **Parser** or a new extraction: an id that outlived the rows it named
would hold out whichever row took its place. Both previews read the rows a skip
leaves through one pure helper, `import/kept-rows.ts` — the question is the same
on both paths, and it answers in positions because each caller reads more than
one list off it (the records to commit, the marks to count). The commit bar
counts the rows a skip leaves; the **reconciliation check** deliberately does not
(see its entry).

**Stable row id**:
The identity of one candidate row in the import wizard — minted when the row is
parsed from a CSV, extracted from a PDF, or added blank for an operation the
extraction missed. Rows are about to be filtered and reordered on screen (issue
#190), and a skip must name a row rather than a position, or narrowing the table
silently holds out the wrong one.

Ids come off a **monotonic counter kept in wizard state**, never a UUID and never
a content hash. The counter is in state so the reducer stays pure and its tests
stay fixture-driven — the same actions from the same state mint the same ids. A
hash would be deterministic too, but it collides on the two identical rows a real
statement is allowed to carry. The counter is never rewound, so an id from a
discarded file cannot match a row of the next one.
_Avoid_: key, index, position, uuid.
_Code note_: `rowIds` + `nextRowId` on the wizard state, positional with `rows`
(CSV) or `extracted` (PDF). Branded `RowId`, so the compiler refuses an index
where an id belongs. On the CSV path they name papaparse's rows, not the
**Parser**'s records — a **Statement Format**'s row filter drops rows it won't
import, so the join is the **Parser**'s to report: `applyFormat` returns a
`ParsedRow` per record carrying the `sourceIndex` it was read from, and the
preview reads the id off that.

**Candidate-table primitives**:
What the two import previews share instead of a component (issue #193): row
identity (`candidate-rows.ts` — the wizard's positional rows, ids and
already-imported marks zipped into one `CandidateRow` per row, which is what
TanStack's `getRowId` can answer with), selection (`use-skip-selection.ts` — **a
selected row is a skipped row**, projected from `skippedRows` and dispatched back
as `skip-row` / `restore-row`, so the table holds no copy of the decision),
column visibility (`use-preview-column-visibility.ts` — state, not storage: an
import preview's hideable columns are read off the statement in hand and a
preference must not outlive the wizard), and the shell + skip column that render
them (`candidate-table.tsx`).

The **transactions table** is not among them, on purpose. It renders persisted
rows — keyed on a database id, joining issuer and category, expanding bundles —
and a candidate row has none of that. What is shared is the primitives and the
pattern, not the component.
_Avoid_: Reusing the transactions table, one preview behind capability flags.
_Code note_: the PDF panel composes them today; the CSV preview follows in issue
#194, and the facets and toggleable raw-source columns in #195. The columns are
memoised on `dispatch` alone and everything else a cell needs reaches it on the
row — a cell closing over a fresh array per render gives the column list a new
identity, which remounts the editable inputs and eats the keystroke being typed.

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
transactions", never "3 matches". That count is derived from the transactions
table on every read, out of six inputs and nothing else (the
**Owned-count input set**, `packages/api/CONTEXT.md`): **row existence**,
`manualIssuer`, `rawIssuerString`, `amount`, `accountId`, and **the rule set**
itself. A mutation writing any of the six must invalidate `ruleKeys.all` too,
not just `transactionKeys.all` — an assignment, a removed manual pick, a bulk
delete, an import commit and every **bundle** mutation all change what a rule
owns without touching a rule. Bundles count because the parent is an ordinary
row carrying the user's label as its `rawIssuerString`, the string the matcher
reads: making a bundle can hand a rule a row, dissolving one takes it back
(issue #78).

The inverse is the load-bearing half: **a write touching none of the six cannot
change an Owned count**. `transferGroupId` (transfer link / unlink / dismiss),
`categoryId` / `manualCategory` (a category override), `excludedFromRecap` /
`manualExcluded` (recap exclusion) and an issuer's own `excludedFromRecap` recap
flag change how a row is *displayed or aggregated*, not what a rule owns — so
`useTransfer`, `useCategoryOverride`, `useRecapExclusion` and the issuer lever
`setExcludedFromRecap` correctly invalidate `transactionKeys.all` alone. Check a
mutation against the field list mechanically instead of inferring from what
"moves" means: read loosely, the wording this replaces ("any mutation that moves
rows") reads as "any write to the transactions table", and two separate reviews
reported those four hooks as stale-count bugs on the strength of it (issue
#170).
_Avoid_: "moves rows", "touches transactions" (both name a superset of the six).

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

**IBAN-confirmed mark**:
How an **IBAN-confirmed candidate** (see [CONTEXT-MAP.md](../../CONTEXT-MAP.md))
looks (issue #179): one badge component, `iban-confirmed-mark.tsx`, rendered by
all three surfaces that offer a pairing — the detail page's transfer section,
the transactions table's suggestion popover, and the Transfers page's panel —
so they cannot disagree about which pairing the bank vouched for. It **names the
matched account**, because "mamen is confident" is worth nothing on its own: the
account name is the evidence the user can check against their statement.
_Avoid_: verified, validated (both suggest the pairing is already made); a tick
glyph (the claim is *your bank said so*, not *mamen validated this* — hence
`Landmark`).
_Code note_: the mark rides the **counterpart**, not the leg — a debit matching
three credits is confirmed against exactly one of them — and `indexCandidates`
carries it into the reverse entry unchanged, since the account it names is the
same whichever of the two rows is on screen. Absent is the ordinary case, not a
refutation, so an unmarked candidate keeps every field and the same enabled
action; and the mark never reorders, so the list stays closest-date first.

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

**Settings page**:
`/settings`, composed in `features/settings/settings-view.tsx` out of two views
that stay separate modules: the **theme preference** (`features/settings/`) and
the **AI settings** (`features/ai-settings/`). The page owns the title, the
width and the order; each view owns its own sections, headings and reads. That
is the shape the original route note anticipated for the day a second settings
area arrived (issue #127) — minus the layout route, which buys nothing while the
second area is one row, and which the split above keeps cheap.

The theme row is a `Select` over System/Light/Dark, not the flip-button it was in
the sidebar footer: a toggle is labelled with the theme it would switch *to*,
which answers the wrong question on a page whose other rows state what is in
force. It writes through `next-themes` alone — `localStorage` plus the scheme
class on `<html>` — so it has no `SavedFlash` and no disabled state; nothing
crosses the network. The row holds the **choice** (`system` included) while its
glyph shows what that choice **resolved to**; those are different questions the
moment one of the answers is "whatever the machine says".
`enableSystem` + `defaultTheme="system"` in `routes/__root.tsx` are what make
the third option resolve, and `settings-view.test.tsx` reads that file so the two
cannot drift.

**Colour scheme**:
The app is light or dark; the light ramp is not a fallback but half the token
contract (`styles/gousse/tokens.css` defines both, keyed off `.dark`). What
decides, in order: `?theme=` on the URL, then `localStorage.theme`, then
`prefers-color-scheme`. Nothing else — until issue #143 `index.html` shipped
`class="dark"` on the root element, which outranked all three.

**The resolution happens twice, deliberately.** `next-themes` applies the stored
choice in an effect, which is one frame after the shell paints — a flash of the
other scheme on every load, and the reason the hardcoded class was tolerable. So
the same resolution is inlined as a synchronous `<script>` in `index.html`'s
head, before the module script. Anything that changes what decides the scheme has
to change both, and `test/color-scheme.test.ts` asserts the inline one by
*running the shipped text* rather than a copy of it.

**Forcing a scheme (automated capture)**: load any page with
`?theme=light`, `?theme=dark` or `?theme=system`. The value is written to the key
`next-themes` reads, so it survives the reload after it and outlives the param
itself — which is what a capture pipeline that reloads between shots needs, and
what a param the router does not carry through a navigation could not give it.
An unknown value is ignored rather than applied. A param left in the address bar
re-forces on every reload, so it outranks a choice made on the settings page in
between — which is what a capture run wants, and why this is a URL switch rather
than an affordance in the app.

The tokens are the whole contract, so a component that paints itself from
`--gousse-*` needs nothing scheme-specific. What does not follow: a **user-chosen
colour used as ink** (a Category's colour on its name, an Account's on its badge)
is checked against neither surface — a pale colour is weak on the light panel
exactly as a dark one is on the dark panel. Prefer it as a fill with
`readableInk()` on top (`lib/color.ts`), as the issuer avatar does.

**AI settings**:
See [CONTEXT-MAP.md](../../CONTEXT-MAP.md). Built in `features/ai-settings/`,
the second section of the settings page. Two things about it are this package's,
not the domain's:

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

_Avoid_: AI settings page (since #127 it is a section of the settings page, and
`SettingsView` is the page).

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

Four slots, and nothing else is a page's to place: `title` (a node, so a
category's icon or an issuer's avatar sits beside the name), `description`,
`actions` at the far end of the row — a page's controls, and equally the *number*
a drill-down is about — and `back`, the way out, on its own line above the title.

**Every page goes through it** (issue #129). That is what makes the trigger a
property of being a page rather than of a page having remembered: it renders only
while the panel is collapsed, hands `AppShell` the ref it focuses, and drives the
shell's toggle — the flag itself is the shell's throughout, read here through the
sidebar-collapsed context, which is why any page's trigger drives the same panel.
`PageHeader`, the wrapper #125 composed for the trigger, is gone: with one caller
the indirection was a second place to look. `test/page-layout-adoption.test.ts`
holds the property — one `<h1>`, one `SidebarTrigger`, one reader of the flag,
a page named for every route, and no type in the app set above the title's
`text-2xl`, so nothing beside a title outranks it.

**Every state of a page is a page**, including the ones with no data yet: a page
whose read is pending or failed renders the same topbar with placeholders (or a
stand-in title — "Issuer", "Transaction") in its slots, because the collapse flag
outlives the navigation that got there and the way back has to survive the read.
So a page-level skeleton (`issuer-detail-skeleton.tsx`,
`transaction-detail-skeleton.tsx`) draws only what is *below* the topbar; the
layout draws the rest, which is also what keeps the header from jumping when the
data lands. A placeholder standing in inside the title or the description is
`<Skeleton as="span">` — a `div` there is invalid nesting.

A page mounted in a test outside `AppShell` has no context and the layout throws,
so a view test wraps it in the stand-in from `test/sidebar-shell.tsx`
(`withShell`, `OPEN_SHELL`, `COLLAPSED_SHELL`) rather than standing up the shell.

_Avoid_: page header (the row is the *topbar*; `PageHeader` was a component and
no longer exists), header (the `<header>` element is the topbar's markup).

**Detail panel**:
One transaction's detail **beside** the transactions table rather than in place
of it (issue #154). Curating is a loop — read a row, name its issuer, pick a
category, move on — and opening each row as its own page charged a full swap in
each direction, with the row under work off screen while it was being worked on.

The open row is a search param, `?selected=<id>`, so the panel is a *place*:
linkable, reloadable, and what the back button navigates out of. It is
deliberately **not a filter** — it enters no query key and resets no page, so
opening, swapping and closing it leave the list exactly as it was. That is why
`transactions-section.tsx` compares its selection scope by structural *value*
rather than object identity: identity would read a new `selected` as a new page
of rows and silently drop the user's ticks.

It shows the **same** sections the standalone page does
(`TransactionDetailFields`, read through `useTransactionDetail`), not a summary
that links out — a summary would send the user to the page for anything real,
which is the swap the panel exists to remove. Only the chrome differs: a close
button for a back link, an `h2` for the page's `h1`, and a link to the full
page. Focus follows the row in and is handed back to it on close, so the next
row is one arrow key away.

The **standalone page** at `/transactions/$transactionId` survives all of it: it
is what links from elsewhere in the app point at, and it is where a row click
goes below `xl` (1280px), where there is no room for a column beside the table.
That width is a `useMediaQuery` (`lib/use-media-query.ts`) rather than a CSS
class because the *click handler* has to know which of the two it is doing — a
`hidden`/`block` pair cannot express that. The scoped drill-downs (a category's,
an issuer's) have no panel at all, and say so by withholding
`onOpenTransaction` from `TransactionsSection`.
_Avoid_: transaction dialog / modal (nothing here is modal — the list stays live
underneath, and the panel is a `complementary` landmark, not a dialog),
transaction drawer (it does not slide over anything; it takes a column).

**Account card**:
One account as a single object on the accounts page: its swatch (still the
recolour surface), name, type, transaction count, month coverage, its **IBAN**
when it has one, a `···` menu, and its own **month strip** (issue #131). The page used to be two blocks that
each enumerated every account — a list of name-and-buttons rows, then an
`Import statements` matrix repeating the names down its left edge — so every
account was named twice and "is this one behind?" was a cross-reference. The
count is a **stat**, not a warning: it used to read `137 transactions — clear
them to delete`, permanent error copy explaining a disabled button nobody had
pressed. The explanation now lives in the menu, beside the Delete it answers.
The menu's first item is **Edit**, not *Rename*: the form it opens carries the
name and the IBAN together, as one write — two writes would be two invalidations
and a frame showing the new name beside the old IBAN.
_Avoid_: account row (the flat list it replaced), import grid (deleted with it),
rename form (the single-field form the edit form replaced).

**Month strip**:
The twelve months of one year on one card, each a **month cell** whose state is
`imported` / `available` / `disabled` — the import grid's columns, cut into
per-account rows. `disabled` is the current and every future month: their
statements are still accruing, so there is nothing complete to import, which
also means a fully-elapsed past year has no disabled cell at all. **Imported is
the loud state**: it is a filled `--gousse-low` cell, while `available` is a
hairline dashed outline. The weighting used to be inverted — every un-imported
month was a dashed *amber* box, this app's medium-severity token — so
availability outshouted completion and an empty February read as a warning.
Cells and the card's `3/6 months` stat come from one derivation (`monthCells`,
`monthProgress` in `month-grid.ts`), so the strip and the stat cannot disagree.
_Avoid_: import grid, coverage bar.

**Year pager**:
The accounts page's year selector (`components/ui/year-pager.tsx`): a pill
rendering every page of the range inline — `‹ 2026 2025 2024 ›` — with
`aria-current` on the active one. Not a `<select>`, because the range is
`availableYears()`: the earliest imported year through the current one,
typically one to three entries, and a select would hide that list behind a click.
**The array is newest-first**, so stepping to an *older* year moves *forward*
through it — the one inversion the arrows can get wrong. One pager in the topbar
drives every strip: the year is the page's question, not an account's, and a
per-card selector would let two cards answer it differently. Past ~10 years the
track would need to scroll or collapse; nothing can produce that range yet.
_Avoid_: year filter (it selects which year is shown, it narrows nothing).

**Add account tile**:
The last item of the accounts list: a dashed ghost tile that opens the
create-account dialog (issue #131). Creating an account used to be an always-open
form pinned above the list — the loudest position on the page for its rarest
task, and two fields of empty chrome between the title and the accounts. As a
tile it costs one row of dashes at rest and asks its questions (name, type, and
an optional **IBAN**) only once pressed. It is also the page's **empty state**,
where it names a *first* account rather than another one. No colour field: a new
account resolves to a stable colour from its id, and the card's swatch is where
that is changed. The IBAN *is* asked for, and the difference is that it is data
already in front of the user — they are reading the statement it is printed on —
where a colour is a decision about an object that does not exist yet.
_Avoid_: create account form (the pinned form it replaced).

**Nav glyph**:
The 16px Lucide mark on a sidebar row, and **one glyph names one destination**
(issue #126). The rule is what the nav offers over a list of words: a row is
found by its mark before it is read, which stops working the moment two rows
share one. A **mirrored twin** counts as the same glyph — `ArrowLeftRight` is
`ArrowRightLeft` flipped, and at this size nothing tells the two apart, which is
why Transactions carries `Receipt` and the arrow pair is Transfers' alone.

The arrows belong there on the merits, and the app had already said so: the
`TransferBadge` on a transactions row uses `ArrowLeftRight` — the glyph the nav
row gave up — and `rules-section.tsx` turns the pair down for a rule move
because it already reads as the transfer feature. The arrow family means
*transfer* app-wide, so the old Transactions row was wearing its neighbour's
meaning, not just a similar shape.

`app-sidebar.test.tsx` holds the whole assignment as a table and fails on a
repeat through three nets, which catch different things: the **id**; the id's
**words unordered**, which is the only one that sees a mirrored twin (the twins'
path data genuinely differs, so geometry does not); and the **rendered
geometry**, for two unrelated ids that draw one picture (`clock` and `clock-4`
are byte-identical).

<!-- Terms are added here as they are resolved during design. -->
