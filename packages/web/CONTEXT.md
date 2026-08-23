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

Since issue #212 the step is drawn in the **split view**: the **file pane** on
the left, this form and its live preview on the right. The questions are the same
questions — the user is simply no longer answering them from memory of a file
opened in another application. The live preview stays rather than being replaced
by the file view, because the two answer different questions: the raw rows say
what the bank wrote, the preview says what the draft *reads* of it, and no amount
of looking at the source settles the date order or the decimal separator. The
sentence at the top and the two buttons at the bottom stay outside the split,
where the other two steps put their banners and their commit rail.

Since issue #213 each answer is also drawn on the file itself — see **column
marks**. That is what turns nine selects into a picture, and what makes a bank
that writes debit and credit as separate columns judgeable: both columns' values
are on screen at once with the sign rule's choices marked on them. And since
issue #214 each answer can be given *from* the file — see **pick mode**.

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

**Format verdict**:
What extraction says about the format it was given: whether the statement
actually carried the columns that format declares, and which of them it did not
(issue #188). The wizard **branches** on it — structured, not prose, for exactly
that reason. A match continues to **side-by-side validation** as before; a
mismatch does not, and its rows are dropped rather than seated: rows read against
the wrong format are what the verdict is for.
It is neither a success nor a failure, so it is its own piece of wizard state
(`mismatch`) rather than a shade of `error` — the request worked, nothing is
retryable, and the drop zone is the wrong thing to send the user back to. The
file stays in hand, which puts the upload step's *which format reads this?*
control back on screen for a second answer that costs no second upload; only the
copy differs from the several-formats case, and it names the missing columns.
Issue #186's mapping step is reached from here, for when none of the offered
formats fit.

**Extracted transaction**:
One candidate record the model reads off a PDF Statement: `{ date, amount,
rawIssuerString }` plus the row's **raw source**. Not yet a saved
transaction: the user reviews and corrects it in the **side-by-side validation**
view, then it is enriched (account, import batch, derived month) and committed
through the same path as a CSV record. The `amount` is a single signed number
folded from the statement's Débit/Crédit columns per the amount sign convention;
the model resolves French number format and infers the year from the statement
header, using the operation date (not the value date).
Its archive is **carried, not built** (issue #189, `enrich-extracted.ts`): the
only thing that ever saw the statement is the extraction, so the cells arrive
from the endpoint keyed by the format's declared columns and as the statement
printed them — the parsed `amount` and the archived `Débit` disagree on purpose
(ADR 0012). A row with nothing to archive — one the endpoint folded to absent, or
one the user added by hand in **side-by-side validation** — commits with the key
absent rather than as `{}`, so the detail page shows nothing rather than an empty
block.
_Avoid_: Candidate, draft, row.

**Declared totals**:
The debit and credit totals the statement itself prints on its summary line
(CCF's `TOTAL DES OPÉRATIONS DU RELEVÉ`), returned alongside the **extracted
transactions**. Not transactions — the statement's own arithmetic, extracted so
the client can run a **reconciliation check**.

**Not every statement prints them** (issue #196). A Trade Republic statement has
no totals line at all, so extraction answers with none and the field arrives
absent — never zeroed, because `{ debit: 0, credit: 0 }` is a total a statement
can genuinely print and the check is entitled to compare against it. `null` on the
wizard state is how "nothing to reconcile against" is spelled, and it is the same
`null` a CSV import carries.
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

It also sums the rows the user *added*, which is the other half of the same
reasoning and the one place it parts from the extraction count above it (issue
#202): that count reports the read as it happened and is frozen, while this check
asks whether the rows now on screen add up to what the statement says — so
supplying an operation the model dropped is exactly how a user clears the banner.

A statement that declared no totals gets **no check** — `reconcile` answers
`null`, and no banner is shown (issue #196). Not a passing check and not a
mismatch against zero: there was nothing to compare. The rows are still reviewed,
skipped and committed exactly as any other statement's.
_Avoid_: Validation (reserve for the whole review step), audit, gate.

**Side-by-side validation**:
The PDF-flavored preview step: the source **PDF** rendered on one side (native
browser viewer via a blob-URL iframe — no pdfjs), the **extracted transactions**
in an editable table on the other. The user corrects wrong values, skips the
phantom ones (a **skipped row**, since issue #192 — it used to delete them), and
adds missed ones (edit-in-place) before committing. The CSV path previews the
same table on the same **candidate-table primitives** (PRD #190) — read-only
cells, no add-row, no banner — so the two paths skip and filter identically; both
converge on the same commit.

The line at the top — *"N transactions extracted in Xs"* — is a report on the
**extraction**, not on the table below it (issue #202). It is a snapshot taken
when the extraction settled and it never moves again, because the array it used
to be counted off is the *editable* one: adding the operations the model missed
had this line claim the model read rows the user had typed in themselves. The
upload step shows the same two figures on the way back and reads the same
snapshot, so the two cannot disagree.
_Avoid_: Diff view, comparison.
_Code note_: the panel is a real table since issue #193 — TanStack Table over the
**candidate-table primitives**, columns *skip | date | raw issuer | amount*, plus
the statement's own columns hidden behind the toggle and the **row facets** above
it (issue #195). The skip is a checkbox in front of the values rather than the
pair of icon buttons it used to be: checked *is* skipped, so one control says the
state and reverses it — and the same control in the header holds out every row on
screen.
The transactions grid is deliberately not reused, and the two previews stay two
components — one is editable with an add-row control and a reconciliation banner,
the other is neither, and collapsing them would mean one component steered by a
handful of capability flags.
Since issue #210 the two sides are laid out by the **split view** rather than by
a `lg:grid-cols-[3fr_2fr]` of this step's own: the panes are resizable and each
scrolls on its own, and nothing else about the view moves.

**Split view**:
The two-pane layout the import wizard's post-upload steps are drawn in (issue
#210, PRD #208): a left slot, a right slot, each its own scroll context, and a
**divider** the user can drag between them. A layout primitive — it knows
nothing about what is in either slot: the **side-by-side validation** step puts
its statement iframe on the left, the CSV preview and the **mapping step** their
**file pane** (issues #211, #212), and the split view is told none of it.

Each pane scrolling on its own is the behaviour, not a detail. The split used to
scroll as one column, so reading down the extracted rows carried the statement
off the top of the screen — the one thing a side-by-side view exists to prevent.

Where the user leaves the divider is **chrome, not import state**. It is
persisted to `localStorage` under one key and read by a hook of its own, never
by the wizard reducer: that state describes the import in progress and is
discarded with it, while a layout preference outlives both — so abandoning an
import leaves the panes where the user put them, and so does leaving the wizard
entirely. One stored ratio serves every step, because dragging is a preference
rather than a per-screen setting; until the first drag each step shows **its own
default** — the PDF step's is 60/40, the grid it replaced; the **mapping step**'s
is the same, since the file is what is being read *from* there and a column of
selects needs no width; and the CSV preview's is even, since both of its panes
are tables of the same rows and the right one carries the filters, the skips and
the decision — and the first drag replaces every one of them.
_Avoid_: Panel (reserved for the **detail panel**), splitter, resizer, pane
(fine for one side; the thing itself is the split view).
_Code note_: `components/split-view.tsx`, controlled — `ratio` in and
`onRatioChange` out — with `features/import/use-split-ratio.ts` holding the
stored value and the 20–80% clamp (a pane dragged to nothing is content the
user can neither see nor, the divider being the only way back, reach). Shaped
after `useSidebarCollapsed`, down to reading storage once at mount and writing
from an effect; unlike it, an *unset* preference stores nothing, which is what
lets each step keep its own default. The divider is the ARIA **window splitter**:
a focusable `separator` carrying `aria-valuenow`, moved by the arrow keys as
well as by the pointer, since nothing else on the page moves it. How the position
is *kept* is asserted in the hook's own unit test; that one drag answers for
every step and for both paths is asserted at the wizard seam, through the
divider's keyboard route — a step holding its own ratio would otherwise pass
every case in that file. What stays unassertable anywhere is a pane's real width
and the pointer drag itself, jsdom laying nothing out.

**File pane**:
The dropped CSV itself, on screen in the left pane of the **split view** while
the user works in the right one (issues #211 and #212, PRD #208): the statement's
real header row and every one of its rows, as delivered. It is what lets a row be
read against the line that produced it before it is skipped or committed —
which is what **side-by-side validation** has always given the PDF path and the
CSV path never had — and, on the **mapping step**, what lets a column be picked
by reading its values rather than by recalling them. One pane, both post-upload
CSV steps, so the source is continuous across them.

A plain table of what the file says, and nothing more: the ISO stamp the bank
wrote rather than `15 Jan 2026`, the bare magnitude rather than `-€10.00`. The
parsed reading is the other pane's, and the two being different is the point —
a wrong **date order** is only ever visible in the second.

**The whole file, never a sample.** A column whose first rows are blank or
uniform is exactly the one a first page cannot settle, so there is no cap; the
rows scroll inside the pane, vertically and sideways, so a bank that writes
twenty columns does not push the table beside it off the page. On *both* steps,
and pinned on both: the reason belongs to the **mapping step**, where settling
that column is what the user came to do, and the cap that a case on the preview
step alone would miss is the one on the step that needs it least. Unvirtualized,
knowingly: the import preview beside it already renders every row for the same
reason, so this is that trade extended to one more table.
_Avoid_: File preview (the import table beside it is the preview), raw view (the
pane is built from the *parsed* CSV, so a quoting or delimiter failure is as
invisible here as it is anywhere), source panel.
_Code note_: `features/import/csv-file-table.tsx`, fed the `headers` and `rows`
the wizard already holds — nothing about the reducer, the parsing or the commit
moved for it. The wizard shell drops its `max-w-3xl` cap on any step that shows
a file beside the work — the mapping step and the CSV preview as well as
**side-by-side validation**, where the rule used to name the PDF step alone, so
only the upload step is still a narrow column and it has no file to show.
Named for the file it shows (`aria-label="statement.csv"`), which
is what tells it apart from the import table now that the step carries two;
`CandidateTable` takes a `label` for the same reason. It takes **column marks**
and **pick mode** on the mapping step and neither on the preview step, where the
mapping is settled and the file is there to read rows against; it takes the
**row highlight** on the preview step and not on the mapping step, whose right
pane is a form rather than a table of the same rows.

**Column marks**:
The draft's mapping drawn over the **file pane** while a **Statement Format** is
being built (issue #213, PRD #208): a column the draft reads carries a badge in
its header naming what it feeds — *Date*, *Label*, *IBAN*, *Amount*, *Debit*,
*Credit*, *Direction*, *Filter* — and the whole column is tinted, values
included, since what settles a mapping is the values under the header rather than
the header itself. Nine selects become a picture: the mapping is read off the
statement instead of by re-reading the form.

The column the **field the user is currently in** points at is marked more
strongly than the rest. That is about where the cursor is, not about what has
been answered — it follows focus, and a field with no answer yet points at
nothing and marks nothing.

**Derived from the draft, never stored.** There is no second copy of the mapping
to keep in step with the form: remapping a field moves its mark because the
derivation no longer names the old column, and clearing one (`null` IBAN, "import
every row", a sign strategy that reads other columns) removes it for the same
reason. An unmapped column is left plain, so the marks read as decisions the user
has made. Only the column-valued fields mark anything — date order, decimal
separator and the sign *strategy* answer **how** a row is read rather than
**which** column it is read from — and one column may feed two fields, so a
header can name both.

The mapping is **announced** from the header (`aria-label="Débit — mapped to
Debit"`), because a badge and a tint are no use to a screen reader and "which
column feeds the date" is what this pane exists to answer.
_Avoid_: Column highlight (the **row highlight** is the other axis and another
feature — and it lives on the preview step, where nothing is being mapped),
legend, mapping overlay.
_Code note_: `features/import/column-fields.ts` is the one list of the
column-valued fields — each one's badge, the column the draft currently reads for
it, and the patch that maps a column to it. `column-marks.ts` folds that list
into a header → labels map (`ColumnMarks`); `csv-file-table.tsx` renders it and
carries `data-column-mark="mapped" | "active"` on every cell of a marked
column — the named contract the tint is asserted through, jsdom laying out no
colour. The mapping step holds the active column in component state rather than
in the reducer: it is where the cursor is, not part of the import.

**Pick mode**:
The file pane waiting for a header click, so that a column found by eye is
assigned by clicking it rather than by finding its name again in a dropdown
(issue #214, PRD #208). Beside every column select on the **mapping step** sits a
control that opens it — `Pick the Date column from the file`, named for the
**column mark** the field draws, since the word on all nine of them is the same
`Pick`. While it is open every header of the **file pane** is a button that
assigns its column to that field.

**The select is still the value.** Both routes run one update (`columnFieldPatch`
in `column-fields.ts`), so a picked column shows in the select and a column
chosen in the select marks the file — the table is a second *route* to one value
and never a second copy of it. That is also why only the column-valued fields
offer it: date order, the decimal separator and the sign *strategy* answer **how**
a row is read, and a header click could say nothing about them.

**Opening it is not a commitment.** The pane says which field is waiting — a mode
the user cannot see is a mode that eats their next click — and both ways out
(Escape, or the control that opened it) assign nothing and change nothing. One
field is in pick mode at a time, because it is one slot: opening a second closes
the first, so the header the user clicks answers the question they last asked.
_Avoid_: Column picker (the select is the picker), mapping mode, eyedropper.
_Code note_: `mapping-step.tsx` holds the picking field — the *field*, never a
captured handler, so the update is written against the draft as it stands at the
moment of the click. The pick control is a toggle button (constant name,
`aria-pressed`); the headers become real `<button>`s only while a field is
asking, so the table is not twenty extra tab stops the rest of the time, and
focus returns to the select when pick mode ends rather than being dropped on the
body with the button that held it.

**Row highlight**:
Hovering a row of either pane of the CSV preview lights the row it is paired with
in the other (issue #215, PRD #208). A parsed row and the line of the **file
pane** it was read from are one row seen twice, and reading the second against
the first is the decision the split view exists to support — a row about to be
**skipped** can be checked against the line of the statement that produced it. It
reads in both directions, because the user arrives from either side: from a
parsed amount that looks wrong, or from a line they already know should not be
imported.

**The join is the row's stable row id, never its position.** A **Statement
Format**'s row filter drops the lines it will not import, so the third parsed row
can be the fourth line of the file; the ids are minted over papaparse's rows and
each record carries the id of the line it was read from (`sourceIndex`), which is
what that field is for. A line the filter dropped still declares its id and
simply pairs with nothing — it produced no record, and saying so is the honest
answer.

**A named contract, not a hover style.** `:hover` on one table can say nothing
about a row of the table beside it, so both panes state the identity in the DOM
and the pair under the cursor says so; the tint is written against that. It is
also what makes the pairing assertable at the wizard seam, jsdom laying out no
colour — the same reason **column marks** carry one.

**CSV-only.** A **PDF** is a rendered document with no addressable rows, so
**side-by-side validation** declares no identities and promises no highlight. The
CSV path is safe because its preview has no add-row control — only the PDF step
dispatches `add-extracted` — so nothing appears on one side that was never on the
other.
_Avoid_: Row link, cross-selection (nothing is selected; the cursor is merely
somewhere), sync scroll (the panes scroll independently, and that is deliberate).
_Code note_: `features/import/row-highlight.ts` — `useRowHighlight()` is held by
`preview-step.tsx` above both panes, since neither can know about the other, and
it stays out of the wizard reducer for the reason the divider ratio does: where
the cursor is is not part of what gets written. It hands each row
`data-row-id` plus `data-row-highlight="true"` on the pair, and
`ROW_HIGHLIGHT_TINT` is the one class both panes are styled through.
`CsvFileTable` takes the *file's* ids (`sourceRowIds`, positional with its rows —
not the record ids, which are a filtered subset in a different order) and
`CandidateTable` an optional `highlight`; the PDF step passes neither.

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
while it is skipped. The control is the table's skip checkbox on **both** paths —
**side-by-side validation** since issue #193, the CSV preview since PRD #190's
closing slice — replacing the × / undo-arrow pair that path used to carry:
checked *is* skipped, so one control says the state and reverses it, and a
mis-click costs the click that undoes it. A skip is a decision about *this*
commit and nothing else: it writes nothing, stores nothing, and is gone when the
wizard is.

Since issue #195 a whole set can be skipped at once, from the checkbox in the
table header — and it acts on **the rows on screen**, never on the ones a **row
facet** is hiding. That is the payoff: narrowing to `TYPE = Exécution d'ordre`
and clicking once holds out fifteen rows that used to cost fifteen deletes. It
takes them back the same way, which is what makes a mis-narrowed bulk skip cost
one click rather than a re-import.

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
preference must not outlive the wizard, and they are hidden until asked for while
the preview's own columns cannot be hidden at all), filtering (**row facets**,
`facets.ts` + `candidate-filters.tsx`), and the shell + skip column that render
them (`candidate-table.tsx`).

The **transactions table** is not among them, on purpose. It renders persisted
rows — keyed on a database id, joining issuer and category, expanding bundles —
and a candidate row has none of that. What is shared is the primitives and the
pattern, not the component.
_Avoid_: Reusing the transactions table, one preview behind capability flags.
_Code note_: both previews compose them — `pdf-validation-step.tsx` since issue
#193 and `preview-step.tsx` since PRD #190's closing slice, which picked up the
**row facets** with them because #195 put the facets in the shared hook rather
than in the panel. Neither preview names the statement's columns: they are read
off the rows' **raw source** inside the hook, so one statement cannot be offered
two different sets of filters depending on which path it arrived by. Each
preview declares only its own columns, and the editable one memoises them on
`dispatch` alone with everything else a cell needs reaching it on the row — a
cell closing over a fresh array per render gives the column list a new identity,
which remounts the editable inputs and eats the keystroke being typed. The
read-only preview's cells close over nothing, so its list is built once. The
statement's own columns are the one thing derived from the rows, so they are held
still by identity (`useStableList`): editing a *value* must not read as a change
of *columns*.

**Row facet**:
One of the statement's own columns offered as a filter above an import preview's
table — *either* preview since PRD #190's closing slice — listing the distinct
values it prints and how many rows carry each (issue #195). Choosing a value narrows the table to the rows that print exactly it;
choosing several values of one column is an *or*, and narrowing two columns is an
*and*. What makes the facets possible at all is the **raw source** — the cells as
the bank printed them — which both import paths carry since issue #189. On the
PDF path it is also why the extraction returns **every operation row** of a
two-product statement and attributes the product heading to the rows under it
(PRD #180, amendment 1): a facet can only narrow rows the model actually
returned, so holding out one product's operations is the user's choice here and
never a decision taken during the read.

A column is facet-eligible by a stated rule and by nothing else: its distinct
values number **at most `FACET_VALUE_LIMIT` (12)** and **strictly fewer than the
rows**. That takes a Trade Republic statement's operation type and product name
and leaves its description and running balance; on the shipped Green-Got export
it takes `Catégorie` (11 values over 40 rows) and leaves `Référence` (14) and
`Intitulé` (25). No configuration, no setup, and a bank mamen has never seen gets
its facets from the file it sent. A blank cell is **no value** — the same thing an
omitted one is — so the two paths facet one statement identically.

Facets are **exact-value, never substring**, which is deliberate: this control
removes rows from an import, and over-matching drops the wrong ones silently.
`Virement` and `Virement instantané` are two values, and the user picks the one
they mean.

They are **ephemeral**. Nothing outside the table reads or writes them, they are
gone with the wizard, and a durable "always hold out this type" rule belongs to
the **Statement Format**'s row filter — two mechanisms for one intent would
compete.
_Avoid_: Search, query, filter chip (a facet lists what is *there*, and matches
whole values).
_Code note_: `facets.ts` is pure and table-free — which columns become filters is
a statement about the file, and it is tested as one. Each facet-eligible column
is a real (hidden) table column with an exact-match `filterFn`, so a filter *is*
a TanStack column filter: the row model the select-all acts over is then the
filtered one for free. TanStack's own `arrIncludesSome` is a substring matcher
and is deliberately not used.

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
user-facing name only. The create/edit form's live preview is **read through, not
reloaded**: the dry-run query keeps the previous answer on screen while the next
one is in flight (`keepPreviousData`) and which of its three tabs is open is held
by `RuleForm`, above the skeleton swap — every settled keystroke is a new query
key, and the previewed rows' issuers are a *dependent* read, so a panel holding
its own tab state comes back on "Will match" and bounces the reader off the list
they were reading (issue #200). Each rule row shows its **owned count** (see
[CONTEXT-MAP.md](../../CONTEXT-MAP.md)) worded as what it counts — "3
transactions", never "3 matches". That count is derived from the transactions
table on every read, out of seven inputs and nothing else (the
**Owned-count input set**, `packages/api/CONTEXT.md`): **row existence**,
`manualIssuer`, `rawIssuerString`, `amount`, `accountId`, and **the rule set**
itself, plus `bundleId`. A mutation writing any of the seven must invalidate
`ruleKeys.all` too, not just `transactionKeys.all` — an assignment, a removed
manual pick, a bulk delete, an import commit and every **bundle** mutation all
change what a rule owns without touching a rule. Bundles count twice over: the
parent is an ordinary row carrying the user's label as its `rawIssuerString`, the
string the matcher reads, so making a bundle can hand a rule a row and dissolving
one takes it back (issue #78) — and a **bundle member** is not counted at all
(issue #199), the parent standing for it exactly as it does in the transactions
list, so bundling a row a rule owns lowers that rule's count.

The inverse is the load-bearing half: **a write touching none of the seven cannot
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
_Avoid_: "moves rows", "touches transactions" (both name a superset of the
seven).

**Rule preview grid**:
The dry-run under the **Matching Rule** form — its three lists (**will match**,
**will reassign**, **manual collisions**) as tabs over one table
(`rule-preview-panel.tsx`, `rule-preview-table.tsx`). It is the app's *own*
transactions grid, not a list of its own: the rows are ordinary transactions, so
they read the way the same rows read everywhere else, down to the issuer cell's
manual-assignment pin — which is what makes a manual collision legible as the
thing it is. Two columns are hidden (`excluded`, `notes`): the rule is being
judged on which rows it claims, and the levers that answer a different question
would widen the grid past the form.

**Its rows lead nowhere** (issue #197), which is the one thing it takes off the
grid. The table is mounted inside an **unsaved form**, and following a row — the
gesture a reader makes to check a row the rule claims — would unmount the form
and discard every predicate typed into it, with no confirmation and nothing to
come back to. So `TransactionsTable` is passed `rowLinks={false}` and the row
carries none of the link's machinery: no handlers, no `role="link"`, no tab stop
(every previewed row would otherwise stand between the pattern field and Save),
no pointer cursor. An affordance that outlives its destination is worse than
none. The inline curation cells stay: they act on the row where they are.
_Code note_: the same rule applies to any table put inside a form. The dry-run
in the **rule move** panel is a pair of inert lists (`transaction-preview-list.tsx`)
for the same reason, from before the grid was shared.

**Its rows are height-bound and scroll** (issue #203), which is the one thing it
adds. A dry-run returns *every* matching row — it is not a page — so a broad
pattern (`a`, `.*`) over a few thousand transactions renders a grid thousands of
rows tall, pushing Save and Cancel below the fold and moving them again on every
debounce. `TransactionsTable` takes a `maxHeight` class for exactly this, and the
frame that scrolls is a focusable, labelled region: the rows inside it are inert,
so without a tab stop on the frame the overflow would be unreachable from the
keyboard. The bound is on the **rows only** — the tab strip says which list is on
screen and the summary is the sentence the save decision turns on, so neither
scrolls away from the rows it describes (the same rule as the import preview's
filters, issue #195).
_Code note_: a table that **is** its page stays unbounded — it is already bounded
by the page size it was read with, and a second frame would be a scrollbar inside
a scrolling page. The API side is still uncapped on purpose: capping the lists
would make the tab counts and the summary count different things, and the preview
read has no order to take a "first N" from (`SELECT * FROM transactions`, then
bucketed) — that is a contract change (totals beside the rows), not a height.

**Its rows are sorted here, and its Date header is not a control** (issue #204).
The dry-run reads `SELECT * FROM transactions` with no `ORDER BY` and buckets
rows as it walks them, so a list arrives in **insertion order** — import a
January statement and then a February one and the grid showed January first,
under a header announcing "currently descending" whose toggle did nothing.
`rule-preview-table.tsx` sorts each list newest-first before handing it to the
grid: the lists are uncapped, so the whole population is in hand and the sort is
total rather than a page's. `onToggleSort` is then omitted, which is what makes
the header plain text plus an arrow — no button, no tab stop — while the column
still states its order as `aria-sort` on the `th`. The order the rows are in is a
property of the column; a control over it is a separate claim, and only a caller
with a **query to re-ask** can honour it.
_Code note_: the same reasoning has not been applied to the **bundle members**
table (`bundle-section.tsx`), which still passes `onToggleSort={noop}` beside a
truthful `MEMBER_ORDER` — its arrow is honest, its toggle is not. Client-side
sorting stays out of `TransactionsTable` itself: for a paged view it would
reorder one page and disagree with the query, so a caller that sorts does it to
a list it holds whole, before passing it in.

**Rules coverage bar**:
The line above the issuer detail page's rules table: how much of that issuer's
history its **Matching Rules** actually account for. The numerator is the sum of
the rules' **owned counts** (ownership is exclusive, so the sum never
double-counts) and the denominator the issuer's *unfiltered* reference count —
the same figure the delete guard reads, so the user's account / month / search
filters must not narrow it. The remainder is named, and that is the point: a row
carries this issuer because a rule won it or because someone picked it, so
`total − ruleMatched` is exactly the **hand-assigned** set no rule will ever
claim.
_Code note_: the two figures must cover **one population**, on both axes. The
denominator hides **bundle members** (`isNotBundleMember`, the default under
every `list` and `count`), so an Owned count does too — server-side, in the tally
(issue #199). Counting them on one side only made a rule whose rows were all
bundled read `3 of 0`, which the bar's own clamp then drew as `0 of 0`.
Naming the remainder is what makes the numerator's set load-bearing.
The denominator is an unpaged count, so the numerator is summed over an unpaged
list: an issuer's rules are read **whole** (`issuerRulesQuery`,
`ISSUER_RULES_SCAN_LIMIT`), never a page, and the Rules tab's badge shares that
one query so the two cannot disagree. Read a page at a time the bar reported
every rule past the 50th as hand-assigned rows and the table dropped those rules
with no page to turn (issue #198) — the same page-size cliff the issuer-table
reads hit in #62, one resource over. Past the scan limit no bar is drawn at all:
the envelope's `total` says the read fell short, and `RulesCoveragePartial` says
so on screen rather than reporting a figure it cannot compute.
_Avoid_: **month strip** progress (`3/6 months` on an account card is a
different bar), match rate (the bar counts rows a rule *owns*, not rows it
matched — see **Owned count**).

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
`onOpenTransaction` from `TransactionsSection`. `onOpenTransaction` says *where*
a row leads; `rowLinks` says *whether* it leads anywhere — the one caller that
passes `false` is the **rule preview grid**, whose form it would unmount.
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
and a frame showing the new name beside the old IBAN. Saving an *unchanged* form
spends no write, and the IBAN half of that check compares the field's normalised
value against the account's — which is an invariant rather than a hope since
issue #201, the contract keeping `iban` in its **stored form** whoever wrote the
account. The field itself is unchanged: it keeps the user's keystrokes as typed,
normalises at submit and groups in fours for reading, so what is typed, what is
stored and what is displayed stay three separate steps. **An open edit form is a
draft the user owns**: it seeds from the account at mount and takes nothing from
it afterwards, so a background refetch — a rename in another tab, another client
— cannot reset the fields under someone's hands (issue #205). What re-seeds it is
the card's `editing ? … : …`, which unmounts the form on close; the value-derived
`key` that used to sit beside it added nothing to that and cost the draft.
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
