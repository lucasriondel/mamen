# ADR 0014 — PDF extraction is account-aware, through the format it is given

**Status**: accepted
**Supersedes**: nothing. **Amends**:
[`docs/adr/0005-pdf-extraction-runs-server-side.md`](./0005-pdf-extraction-runs-server-side.md)
— specifically its *Account-agnostic by design* section.

## Context

`POST /import/extract-pdf` took one thing: the file. ADR 0005 called that
account-agnosticism and gave two reasons for it — extraction stays a pure
function of the file, and the destination account can be chosen *after* the user
has eyeballed the rows.

The prompt behind it described French bank statements **in general** and asked
the model to work out the columns for itself. That is the failure PRD #180 opens
on: given a statement it has no vocabulary for, the model returns plausible rows
that are silently wrong, and the only backstop is a person reading every line in
**side-by-side validation**. A wrong column choice does not fail; it imports.

A **Statement Format** is the record that ends the guess. It says which columns
this bank's statement carries — and it belongs to **one account**, because that
is the only scope at which the answer is knowable. So the file alone can no
longer reach the prompt. Something has to name the format, and naming a format
names an account.

## Decision

### 1. The endpoint takes the format alongside the file

`extractPdf`'s multipart payload gains `formatId`. It is required: there is no
extraction that does not run against a format, so there is no default to fall
back to and no call that omits it. `maxParts` moves from 1 to 2 — the file and
the id, and nothing else.

The endpoint is therefore **no longer account-agnostic**, and this ADR exists so
that is a recorded reversal rather than undocumented drift. ADR 0005's *reason*
for server-side extraction is untouched: the credential still cannot live in the
browser and the model still reads a staged file through its own `Read` tool.

### 2. The **id**, not the record

The request names a format; the server reads the columns back out of the
account's own row. It does not accept a column list in the body.

The alternative — send the declared columns — is one round-trip cheaper and
makes the stored record advisory: any client could declare any columns for a
format it does not own, and the row the user authored would stop being the
answer to "what does this bank's statement look like". A stored record that the
wire may contradict is not a record.

### 3. A **CSV** format's id is a 404, not a fallback

A CSV format's `headers` are a *fingerprint* — the columns a file must carry for
that format to recognise it. A PDF format's `columns` are the columns to ask a
model for. They are different things that happen to both be lists of strings,
and putting a fingerprint into the prompt as though it were the statement's
layout is precisely the silent wrongness this work exists to end.

So the lookup refuses it: to this endpoint there simply is no PDF format under
that id, which is what `NotFound` (404) says. The statement is never sent
anywhere — the lookup fails before a provider is reached.

### 4. The columns are told to the model; the reading rules are unchanged

The declared columns enter the **shared** extraction rules, the block both the
local CLI and a hosted vendor are served from — they are being asked to read the
same statement, and a columns block written into one transport only would be
exactly the drift the two-column task table exists to prevent.

They are *added to* the existing rules, never in place of them. Débit/crédit
signing, operation date over value date, the year inferred from the header,
French number parsing and the exclusion of balance and total lines remain the
shared correctness surface. The columns say what the file is laid out like; the
rules still say how a value in it is read.

A format that declares no columns produces no block at all. An empty heading is
worse than a missing one: it tells the model the statement carries nothing.

### 5. What has *not* changed: the answer is still keyed to nothing

The response is unchanged — candidate transactions and the statement's declared
totals, with no account, batch or month stamped, and no database write. Those
are still stamped client-side at commit (issue #45).

This is the half of ADR 0005's section that survives, and it is the half that
carried the weight. What the endpoint *knows* has changed; what it *writes* and
what it *returns* have not.

## Consequences

- **Extraction is no longer a pure function of the file.** The same PDF under two
  formats yields two results. That is the point — it is what makes a statement
  mamen has a vocabulary for read correctly — but the property ADR 0005 named is
  genuinely gone, and a bug report about extraction now has to name the format.
- **The endpoint reads the database.** It was previously write-free *and*
  read-free; it is now write-free only. The handler layer provides the same
  `StatementFormatRepo` the `statementFormats` group is built on, over the same
  `SqlClient` — one table, one reader.
- **The account must be settled before the file is dropped**, which issue #181
  had already made true in the wizard for the CSV path's sake. The PDF path is
  now the harder constraint: without an account there is no format, and without a
  format there is no prompt.
- **A new client-visible error.** `NotFound` joins `InvalidFileType`,
  `ExtractionFailed` and `AiProviderNotConfigured` on this endpoint.
- The **structured mismatch verdict** — the model reporting that the statement did
  not match the format it was given — is what this decision makes possible. It
  landed in issue #188, one ticket later, as `ExtractPdfResult.verdict`: the model
  is asked which declared columns it could not find, and `import/extract.ts` folds
  that against the declared list into `{ matched, missingColumns }`. The
  conclusion is the server's, never the model's, which is the same instinct as §2
  — the stored record is the authority, and here so is the list it declares.

## Considered options

**Sending the columns rather than the id** — rejected in §2 above: it costs the
stored record its authority.

**Letting the model choose the format too** — sending every PDF format the
account has and asking the model which one fits. Rejected: it cannot cleanly
report a mismatch against a format it selected itself, so the verdict issue #188
adds would be the model marking its own homework. The choice stays with the user
(or with arithmetic, when there is exactly one).

**Keeping the endpoint account-agnostic by inlining a generic prompt when no
format is given** — rejected. It preserves the property by preserving the bug:
the "no format" path is precisely the guessing path, and a fallback that silently
produces plausible-but-wrong rows is worse than a 400, because nothing tells the
user which one they got.

## Where this lives

- Contract: `packages/shared/src/contract/import.ts` (`PdfUpload`, `ImportGroup`).
- Server: `packages/api/src/import/extract.ts` (the format lookup),
  `packages/api/src/ai-runner/prompt.ts` (the declared-columns block).
- Client: `packages/sdk/src/import/queries.ts`, and the wizard's PDF path in
  `packages/web/src/features/import/upload-step.tsx`.
