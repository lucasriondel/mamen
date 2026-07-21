# PDF extraction runs server-side

PDF bank-statement import extracts candidate transactions by handing the file to
the `claude` CLI (through `claude-code-effect`) and asking for a typed object.
That extraction runs **on the API server**, behind `POST /import/extract-pdf`,
not in the browser. The endpoint takes only the file and returns
`{ transactions, declaredTotals }` — no database write, no account stamped (the
account, import batch, and month are stamped client-side at commit, issue #45).

## Why server-side

**The credential can't live in the browser.** Extraction spawns the `claude`
CLI, which needs `CLAUDE_CODE_OAUTH_TOKEN`. Shipping that to a web client would
leak it to every user and to the network tab. The token stays an API-process
secret; the browser only ever sees the extracted rows.

**The model reads the file itself.** `generateObject` runs the CLI with its own
`Read` tool (`addDirs` scopes it to the staged file, `allowedTools: ["Read"]`
permits nothing else). That needs a real filesystem path the CLI process can
open — a server-side temp file, not a browser `File`. Doing this on the client
would mean re-implementing PDF text extraction in the browser; letting the model
read the PDF directly is what keeps the prompt (not brittle client parsing) the
single correctness surface.

## The PDF never persists

The handler stages the upload into a **transient temp dir** opened with
`makeTempDirectoryScoped` (`acquireRelease` under the hood). The scope closes on
the enclosing `Effect.scoped`, so the dir — and the PDF inside it — is deleted on
**every** exit path: success, extraction failure, and timeout/interrupt. Nothing
is written to the database and nothing outlives the request. A bank statement is
sensitive; the endpoint holds it only as long as the model needs to read it.

## One client-visible failure

`claude-code-effect` has a rich failure taxonomy — spawn, invocation, API,
parse, timeout, schema. None of those distinctions are actionable for the web
client, and some (e.g. an API 429 or a raw stderr) would leak upstream detail.
So the whole taxonomy **collapses to a single `ExtractionFailed` (502)**; the
real tag is logged server-side for debugging. The client learns only that
extraction did not produce a result and can offer a retry. The multipart
`InvalidFileType` (415) is the one other, genuinely client-fixable, error.

## Account-agnostic by design

The endpoint returns candidates keyed to nothing — no account, batch, or month.
That keeps extraction a pure function of the file, so the same PDF yields the
same rows regardless of where they'll land, and it lets the review/commit step
(issue #45) choose the destination account after the user has eyeballed the
rows. `declaredTotals` mirrors the statement's printed `TOTAL DES OPÉRATIONS` so
that commit step can reconcile the extracted rows against what the bank declared.

## Considered options

**Client-side extraction** (pdfjs-dist + an in-browser model call) was rejected:
it either leaks the API token to the browser or requires a second, browser-shaped
credential path, and it moves the correctness-critical PDF parsing into the
client. Server-side keeps one token, one prompt, one place to fix extraction.

**Persisting the upload** (store the PDF, extract from the stored copy) was
rejected: it turns a stateless extraction into a data-retention question for a
sensitive document, with no feature that needs the file after the response. The
transient temp dir is the smaller surface.

**Surfacing the real failure tag** to the client was rejected: the tags aren't
client-actionable and some carry upstream detail. Collapsing to one tag, logged
server-side, is the honest contract — "extraction didn't work, retry" — without
the leak.

## Operational consequence

Running extraction server-side means the API process needs the `claude` CLI on
`PATH` and `CLAUDE_CODE_OAUTH_TOKEN` in its environment, in both local dev and
deploy. The token is validated at **layer build**, so a missing token takes the
whole API down at startup rather than failing per-upload. The runbook for both
environments is
[`docs/operations/claude-cli-dependency.md`](../operations/claude-cli-dependency.md).
