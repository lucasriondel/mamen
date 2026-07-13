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
One CSV file exported from a bank, covering one account over a date range. The
unit the user uploads. Distinct from an Import — a single Statement can produce
transactions across several import months.
_Avoid_: File, upload, export.

**Parser** (Statement Parser):
A pluggable module that turns one bank's CSV row shape into transaction records.
Declares a header fingerprint (`matches`) for auto-detection and a pure
`parse(rows, ctx)` that maps raw rows to records. The registry runs papaparse
once, then hands parsed rows to the selected parser. Green-Got is the first
parser.
_Avoid_: Adapter, mapper, importer.

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
