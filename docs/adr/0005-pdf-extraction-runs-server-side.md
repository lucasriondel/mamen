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

## Amendment (issue #121) — the CLI is a transport, not the only one

Extraction no longer calls `claude-code-effect` directly. It runs the
`extract-pdf` row of the **task table** through the **AI runner**
(`ai-task-runner-effect`), which resolves the task's stored **AI provider** and
model and branches to that transport. Every decision above is unchanged in
substance: on `claude-code` — the default, and today the only wired branch — the
same CLI reads the same staged file with the same `Read`-only allowance, and the
same rows come back. What moved is *who decides*: the transport is now the
user's stored choice rather than a fact of the code.

Two details are worth naming because they were not obvious:

- **The `Read` allowance is still scoped to the temp dir**, but the scoping moved.
  `allowedTools` is a column of the task table; the *directory* is this request's
  temp dir, which no table of tasks can hold, and the runner's CLI branch passes
  prompt, model and tools and nothing more. So the extraction handler narrows the
  `ClaudeCode` service itself — `addDirs` merged in — for the length of the run.
- **The failure collapse widened.** The taxonomy that reaches
  `ExtractionFailed` now also carries the runner's own tags and the resolver's
  refusal. That is deliberate for this ticket: the *one* client-actionable
  extraction failure (a task whose provider has no credential) is a separate,
  distinguishable error that lands with the settings page, per PRD #115.

The operational consequence above is **unchanged**: the token still comes from
the environment and is still validated at layer build. Moving it into the
credential store is a later slice, and this section is amended then.
