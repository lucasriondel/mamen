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
records via an LLM (the `claude` CLI, wrapped by `claude-code-effect`). The web
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
`(accountId, importMonth)`. Re-importing the same key **replaces** it
(delete-month-then-insert) — imports are idempotent, not additive. The
`importMonth` (`"YYYY-MM"`) is derived per-row from each transaction's date, so
one Statement spanning a month boundary yields two Imports.
_Avoid_: Batch, load.

**Raw issuer string**:
The unparsed counterparty text on a transaction (`rawIssuerString`, e.g.
`"AMAZON EU SARL"`), taken from the CSV's `Intitulé` column. The raw material
the user (or, later, a Rule) resolves into an Issuer.

**Assignment**:
The act of attaching an Issuer to a single transaction (`update({ issuerId })`).
Done by hand (a **manual assignment**, sets `manualIssuer`) or automatically by
a **Matching Rule**. Manual assignments are sticky — rules never overwrite them.
_Avoid_: Match, tag, categorize (as a bare verb).

**Matching Rule**:
See [CONTEXT-MAP.md](../../CONTEXT-MAP.md). A single regex `pattern` owned by an
Issuer that auto-assigns that Issuer to matching transactions. The user manages
these to turn cryptic raw issuer strings into known Issuers in bulk. Create /
edit / delete each previews its effect (which transactions gain, change, or lose
an issuer) before applying on save. Assigns **only** an issuer — category flows
through the issuer (**derived category**), never off the rule.
_Code note_: the entity is `Rule` in the contract/DB/SDK; "Matching Rule" is the
user-facing name only.

**Amount sign convention**:
`amount` is a single signed number. A CSV `DEBIT` (money leaving) is stored
**negative**; a `CREDIT` (money arriving) is **positive**. The sum of a set of
transactions is therefore net cash flow.

<!-- Terms are added here as they are resolved during design. -->
