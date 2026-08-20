# PDF extraction runs server-side

PDF bank-statement import extracts candidate transactions by handing the file to
the `claude` CLI (through `claude-code-effect`) and asking for a typed object.
That extraction runs **on the API server**, behind `POST /import/extract-pdf`,
not in the browser. The endpoint takes only the file and returns
`{ transactions, declaredTotals }` — no database write, no account stamped (the
account, import batch, and month are stamped client-side at commit, issue #45).

## Why server-side

**The credential can't live in the browser.** Extraction spawns the `claude`
CLI, which authenticates with an OAuth token (written into the child process's
environment at the spawn, and nowhere else). Shipping that to a web client would
leak it to every user and to the network tab. The token stays server-side; the
browser only ever sees the extracted rows.

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

> **Amended by [ADR 0014](./0014-pdf-extraction-is-account-aware-through-its-format.md)**
> (issue #185). Since the endpoint takes the **Statement Format** to read the
> statement with, and a format belongs to one account, it is no longer
> account-agnostic: naming a format names an account. What survives is the
> second half of this section — the *answer* is still keyed to nothing, and the
> account, batch and month are still stamped client-side at commit. What is gone
> is extraction being a pure function of the file: the same PDF under two formats
> yields two results.

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
`PATH`, in both local dev and deploy, and a **Claude Code token** — which since
issue #122 is a credential pasted on the AI settings page and read from the
encrypted store, not an environment variable (see the amendment below). The
runbook for both environments is
[`docs/operations/claude-cli-dependency.md`](../operations/claude-cli-dependency.md).

## Amendment (issue #121) — the CLI is a transport, not the only one

Extraction no longer calls `claude-code-effect` directly. It runs the
`extract-pdf` row of the **task table** through the **AI runner**
(`ai-task-runner-effect`), which resolves the task's stored **AI provider** and
model and branches to that transport. Every decision above is unchanged in
substance: on `claude-code` — the default, and at the time the only wired branch
(issue #124 wired the other, see below) — the
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

## Amendment (issue #122) — the token is a credential, not an environment variable

The Claude Code token has moved into the **encrypted credential store** (ADR
0011) under the `claude-code` provider name. It is pasted on the AI settings page
like any other credential, and there is **no environment fallback**:
`CLAUDE_CODE_OAUTH_TOKEN` is not read. A token nobody pasted does not exist.

Two consequences, both accepted deliberately and both named here because they
make diagnosis *worse* before the surfaces built in #120 and #121 make it better:

- **The build-time check is gone.** The token is the effect form of
  `ClaudeConfig.token` (claude-code-effect 0.2.0), resolved **per call**, so the
  API starts fine with nothing stored and a missing token is a per-request
  failure. That is what lets a token pasted a moment ago run the next extraction
  without a restart — and it is why "the whole API is down" is no longer the
  symptom of a missing token.
- **One failure is held out of the collapse.** *The provider has no credential
  stored* is `AiProviderNotConfigured` (501), not `ExtractionFailed`. It is the
  one extraction failure that is client-actionable, so the client can send the
  user to Settings instead of offering a retry that cannot succeed. Every other
  upstream tag still collapses to the opaque 502 exactly as above — this is a
  narrow, named exception, not a widening.

The credential still never reaches the browser, which is the reason extraction
runs server-side at all: it moved from one server-side home (the process
environment) to another (an encrypted row), and the boundary that keeps it there
is ADR 0011's.

The `claude` binary on `PATH` remains an environment fact, and the CLI's other
settings (`CLAUDE_BIN`, `CLAUDE_TIMEOUT_MS`) remain environment configuration:
they are facts about the machine running the CLI, not credentials.

## Amendment (issue #124) — extraction is no longer Claude Code-only

Both transports are wired. Choosing `anthropic`, `google` or `openai` for the
`extract-pdf` task **sends the bank statement to that vendor**, and it comes back
as the same candidate rows and declared totals the local CLI produces. This is a
privacy posture change and is written down as one: until this landed, a statement
never left the machine.

What that costs, stated plainly:

- **The statement leaves the machine, in full.** It travels as a **base64
  document part** on the vendor's own API, not as text mamen extracted first.
  Server-side text extraction was rejected for the same reason client-side
  extraction was rejected above — it would discard the two-column Débit/Crédit
  layout the prompt's rules depend on, moving the correctness surface off the
  prompt and onto a parser.
- **`claude-code` is still the default**, so this only happens to a user who
  went to Settings and chose it, and the picker says so in the row where the
  choice is made.
- **Nothing falls back.** A vendor that refuses fails the run. The user chose
  which company sees their statement; a different company is not an acceptable
  recovery, and a retry at another vendor would be exactly that.

Everything the sections above establish survives:

- **The transient temp dir is unchanged**, and it is transport-independent. The
  statement is staged, read, and deleted on every exit path — the hosted branch
  reads the bytes back out of the staged copy, so both transports are handed the
  same file and the same finalizer removes it.
- **The failure collapse is unchanged.** A vendor refusal, a timeout, and a
  payload the codec rejects are three different tags server-side and one opaque
  `ExtractionFailed` to the client, with the key scrubbed out of the message
  upstream before mamen ever sees it. `AiProviderNotConfigured` remains the one
  named exception.
- **The credential still never reaches the browser.** It is read from the
  encrypted store at the call that spends it (ADR 0011), and only the vendor the
  task is pointed at is handed one.

The **two prompt columns** are what makes the hosted branch possible, and this is
where the second one is finally written. The CLI column names an absolute path
and tells the model to open it with its own `Read` tool; a vendor has neither a
filesystem nor tools, so its column says the statement is attached and carries
the document. Both columns share **one copy of the extraction rules** — sign
convention, which date, year inference, French number parsing, the excluded rows,
the declared totals — because two copies would let the same statement extract
differently depending on which vendor the user picked, and that drift would be
silent.
