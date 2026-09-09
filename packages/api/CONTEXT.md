# api — glossary

The Effect `HttpApi` server implementing the contract (`@mamen/shared`). Runs on
Bun, keeps everything in one sqlite file, and serves the contract at `/api/*`
alongside the Scalar docs (`/docs`), the emitted spec (`/api/openapi.json`) and
the `/uploads/*` static route.

Composition runs one way, outermost first: `index.ts` launches `ServerLive`
(`server.ts` — Bun listener, CORS, logging, docs, uploads), which provides
`ApiLive` (`api-live.ts` — the contract wired to every **group layer**), which
provides each group's **repository**. The **data layer** is deliberately *not*
part of `ApiLive`: the caller supplies it, which is what lets the tests swap the
driver.

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for cross-context terms (**Issuer
invariant**, **Recap**, **Derived category**, **Bundle**, …) and
[`packages/api/docs/adr/0001-server-side-issuer-matching.md`](./docs/adr/0001-server-side-issuer-matching.md)
for why matching lives here. Contract vocabulary (**group**, **entity schema**,
**domain error**, …) is in [`packages/shared/CONTEXT.md`](../shared/CONTEXT.md).

## Language

**Group layer**:
`XxxLive` — `HttpApiBuilder.group(Api, "xxx", …)`, the thin wiring between one
contract group and its **repository**. A handler reads `_.path` / `_.payload` /
`_.urlParams` and delegates; it holds no domain logic, no SQL and no error
mapping. If a handler is doing something interesting, it belongs one layer down.
_Avoid_: controller, route handler (the route is the contract's, not this
layer's).

**Repository**:
The per-resource `Effect.Service` (`XxxRepo`) that owns the SQL and the domain
rules a single row's schema cannot express. It depends **only** on the generic
`SqlClient.SqlClient` tag, never on a concrete driver, so the identical code runs
against the Bun production client and the `:memory:` test client. It is also the
only place a multi-row invariant is enforced — the generic single-row
create/update structurally cannot check that a set balances, or that a row is
free to be grouped. Parts of it that change for their own reasons move out to a
**rule module**; the repository keeps the storage and delegates.
_Avoid_: DAO, service, store.

**Rule module**:
A module beside a **repository** holding one rule of its domain, extracted so it
can be read and tested without the repository's SQL closure around it —
`bundle-derivation.ts` (what a **bundle parent**'s number is), `recap-predicate.ts`
(the **fragments** the recap is computed over) and `bundle-writes.ts` (the bundle
write paths, issue #83). The test is not tidiness but *reason to change*: a
1900-line repository that changes for listing, recap, transfer and bundling
reasons has four of them. A rule module is either pure (the derivation) or takes
the table reads and writes it needs as an argument (the write paths) — never a
second `SqlClient` consumer, so there is still one place that says how a row is
stored. The value dependency points one way, repository → rule module; a type the
module needs from the repository is imported `import type`, which erases.

**Data layer**:
The sqlite client plus its applied **migrations**, as one layer.
`DatabaseLive` (`db/sql.ts`) is the production one — the Bun driver over the
file named by `DB_PATH`. `DatabaseTest` (`db/test.ts`) is the test one — a fresh
`:memory:` database per build, provided **per test** rather than per file, so no
test can see another's rows. It picks its driver at runtime (sqlite-node under
Node, sqlite-bun under Bun) and runs the same migration set either way.

**Migration**:
A numbered module in `db/migrations/`, registered in that directory's index and
run when the **data layer** is built. Append-only: a shipped migration is never
edited, a change is a new number. `0010_seed_categories` is the one that plants
the seeded category tree, and it is a one-shot — nothing reconciles categories at
boot, because that would resurrect deliberate deletions.

**Row codec**:
`XxxFromRow` — the transform between a stored sqlite row and the contract's
**entity schema**. Storage is not the wire: dates are ISO-8601 TEXT, booleans are
`0`/`1` integers, and a list (`anomalyFlags`) is JSON in a TEXT column. One codec
per table, exported and reused by every query that reads it — including from
other modules (the matching engine decodes rules and transactions through the
repositories' codecs rather than its own).

Storage may also be *narrower* than the wire, and `StatementFormatFromRow` is
where that direction shows: a **Statement Format** always declares exactly one
list of column names, so the table keeps one `declaredColumns` column and the
codec folds it onto `headers` or `columns` according to `kind` — the two names
the wire keeps apart because they are read for different reasons. A codec whose
`encode` half is otherwise dead (the write path builds its row by hand) earns its
own round-trip test for exactly this: nothing else exercises the inverse.
_Avoid_: mapper, serializer.

**Fragment**:
A named `sql` expression built once and reused by every query that needs it —
the repository's central idiom. `derivedCategory`, `recapExclusion`,
`countsTowardRecap`, `transferEligibleFor(alias)`, `accountMonthScope` /
`deleteScope`: each states one rule, and the read projection, the filter, the
aggregate and the write all interpolate the *same* fragment. The point is not
brevity. A second copy is a second definition of the rule, and the two drift —
so a filter starts disagreeing with the value it filters on, or a warning counts
a set the delete beneath it does not. When a new clause is needed, it goes in the
fragment; if a rule has three hand-written copies, collapsing them to one
fragment is the fix.

Two fragments that look like one are named apart and carry their precondition,
because the drift they invite is silent: the recap's `spentCents` negates every
row and is correct only under a WHERE that has already filtered to debits, while
`debitCents` / `creditCents` filter sign inside the aggregate for the queries
whose WHERE says nothing about it (issue #167). Swapped, they report a refund as
spending or an income line as zero — with no error and no failing behaviour test,
which is why `recap-sums.test.ts` and `trend-bucket.test.ts` read the source.
_Avoid_: helper, snippet, query builder.

**SqlError boundary**:
The rule that a `SqlError` **never crosses the wire as itself** — it carries raw
SQL and column names. `db/errors.ts` holds the two ways across it:
`conflictOrDie(resource)` for a write that can hit a UNIQUE constraint (the
violation becomes a typed `Conflict`, everything else dies), and `orDieSql` for
everywhere else, where an infrastructure failure or a `RETURNING *` decode error
is a bug and becomes an untyped `500` with no detail leaked. A typed domain error
raised *after* `orDieSql` in a pipeline survives to the wire — that ordering is
how a `NotFound` reaches the client from a query whose `SqlError` dies.

**Matching engine**:
`IssuerMatcher` (`matching/issuer-matcher.ts`) — the service that owns the
**Issuer invariant** (see CONTEXT-MAP.md) and every write that re-derives it.
Matching runs here rather than in the browser because it is retroactive: a rule
create, edit or delete re-derives the whole history, which belongs next to the
data. Regex compiles in JS, never in SQL, so an invalid pattern becomes a
*skipped rule* surfaced to the user instead of a 500. Each rule write and the
recompute it triggers share one `withTransaction`, so the fallout is
all-or-nothing.

The service is the **writes only**: every decision it acts on comes from a pure
export of the same file — `derive`, `previewLists`, `deleteLists`, and (since
issue #160) `issuerAssignmentDiff`, which says which rows a recompute has
actually moved and therefore need an `UPDATE`. That last one is why a rule save
that changes nothing rewrites nothing: the recompute derives the whole table
every time, and the diff is the only thing between that and a table-wide
rewrite. _Avoid_: deciding anything inside the service that the pure half could
decide — a decision fused to its statement construction needs a database to
test.

**Owned-count input set**:
The seven things a **Matching Rule**'s **Owned count** (see CONTEXT-MAP.md) is
derived from, stated where the derivation is — `derive` in
`matching/issuer-matcher.ts`: **row existence**, `manualIssuer`,
`rawIssuerString`, `amount`, `accountId`, and **the rule set** itself, plus
`bundleId`. Nothing else. The count is computed on every read and never stored
(the `matchCount` column went in migration `0017_drop_rules_match_count`), so it
is a function of those seven as they stand now.

`bundleId` is the one the *tally* applies rather than the derivation (issue
#199): it decides not who wins a row but whether the row is **counted** at all.
A **bundle member** never is — its **bundle parent** stands for it, the same rule
`isNotBundleMember` states for every `list` and `count` — while a member is still
matched and written like any other row, so dissolving a bundle returns it exactly
as it was. The rules coverage bar divides a sum of Owned counts by
`count({ issuerId })`, and a fraction whose halves count different populations is
not a fraction.

The inverse is the load-bearing half: **a write touching none of the seven cannot
change an Owned count**. `transferGroupId` (transfer link / unlink / dismiss),
`categoryId` / `manualCategory` (a category override), `excludedFromRecap` /
`manualExcluded` (recap exclusion) and an issuer's own `excludedFromRecap` recap
flag change how a row is *displayed or aggregated*; the matcher reads none of
them. Read loosely — as "any write that moves rows" — that reads as "any write
to the transactions table", and two separate reviews have now concluded from it
that the mutation hooks omitting the rules-cache invalidation were shipping
stale counts. They are not: check a write against the field list mechanically
instead of inferring from what "moves" means. `packages/web/CONTEXT.md` holds
the cache-invalidation rule that follows from this list, worded in these same
fields since issue #170 — a mutation writing any of them invalidates
`ruleKeys.all`, and one writing none of them correctly does not.
_Avoid_: "moves rows", "touches transactions" (both name a superset of the
seven).

**Wire suite / repo suite / rule-module suite**:
The three test seams. Two of them are per resource, one file each. The **wire
suite** (`handlers.test.ts`) stands the whole API up on an ephemeral Node server
over a fresh `:memory:` database and drives it through the derived
`HttpApiClient`, so every assertion round-trips the real encode/decode — it is
where a status code, an error `_tag` and a **refusal reason** get pinned. The
**repo suite** (`repository.test.ts`) drives the repository directly, which is
where multi-row invariants and "what was actually written" are cheapest to
state. A new rule usually earns one of each: the repo suite says the write is
refused, the wire suite says the client is told so. Coverage is a real gate (90%
lines/functions/statements, 85% branches, counting modules no test imports).

The third seam has no per-resource file because it is not per resource: a
**rule-module suite** calls a pure decision module's exports directly, with no
Effect runtime, no server and no database — `ai-tasks/kernel.test.ts` (the
**save-time kernel**), `matching/issuer-matcher.test.ts` (the matching engine,
issue #158) and `transactions/bundle-derivation.test.ts` among them. This is
where a *decision matrix* belongs, and belongs **only**: at roughly a thousandth
of the per-case cost of an HTTP round trip, the exhaustive version is nearly
free, and it names the failure. Issue #161 retired nineteen matching-decision
cases from `rules/handlers.test.ts` for exactly that reason — which rule wins a
row was being asserted twice, once slowly. What the wire suite keeps for a rule
module is the **wiring**: that the handler reaches the module, in a transaction,
against the live tables, and returns its answer. _Avoid_: adding a decision case
to a `handlers.test.ts` because that is where the feature's other tests are.

**OpenAPI drift guard**:
`openapi.json` is emitted from the contract by `scripts/emit-openapi.ts` and
**committed** at this package's root. `bun run test` runs `openapi:check` before
vitest, which re-emits and compares rather than rewriting — so a contract change
landed without `bun run emit-openapi` fails the build instead of shipping a stale
spec. The emit is pure and deterministic, which is what makes the committed file
diffable.

**Demo seed**:
`src/demo/` plus `scripts/seed-demo.ts` (issue #139) — one household's six
invented months, written into a database the caller names. Three parts, split by
what each is answerable for: `dataset.ts` is the data (pure, no clock, one seeded
PRNG, so the same rows with the same ids on every machine), `seed.ts` is the
write (on the generic `SqlClient.SqlClient` tag like every **repository**, so the
tests run it against `:memory:`), and `target.ts` is where it may write — the
path is always explicit and a file named like the API's own database is refused
without `--force`, because seeding **clears the tables it owns** before writing
them. Re-running therefore replaces the demo instead of duplicating it, and the
replacement is row-for-row the database the first run produced. `categories` is
not one of the tables it owns: the tree is a **migration**'s one-shot work, so a
slug the demo needs and the tree no longer has is a named refusal rather than a
re-plant that would resurrect the user's deletions. What it seeds is the ordinary
domain and not a private shape — a transfer group carries the smallest leg's id,
a **bundle parent**'s amount comes from `deriveBundleParent`, an issuer's default
is a childless leaf — and `seed.test.ts` re-derives the whole table against the
seeded rules (the **Issuer invariant**) so the demo cannot change the moment
someone opens the Rules page. Everything in it is synthetic, and
`packages/web/src/test/bank-statement-scrubbed.test.ts` names `dataset.ts` as one
of the two files in the repo allowed to carry an account number at all.

**Transient temp dir**:
The staging directory PDF import copies an upload into, opened scoped so it — and
the PDF — are deleted on **every** exit path: success, failure, timeout,
interrupt. Nothing about an extraction persists: no file on disk, no row in the
database. It is also what the CLI's `Read` allowance is scoped to, and that
scoping is applied by **narrowing the `ClaudeCode` service** for the length of
the run (`allowRead` in `import/extract.ts`) rather than by a task-table column:
`allowedTools` is a fact about a task, but the directory is a fact about *this
request*, and the **AI runner**'s CLI branch passes prompt, model and tools and
nothing else.

**AI runner**:
`AiRunner` (`ai-runner/service.ts`) — mamen's single seam onto
`ai-task-runner-effect`, and the only thing that runs an **AI task**. The package
is deliberately a factory rather than a tag so the seam belongs to the consumer;
this is that seam, and there is exactly one. What it supplies is two things
decided earlier: `resolve` is `TaskProvider`'s resolver (**task resolution**), so
the runner asks the same question the **checked write doors** answer, and
`credential` is `readSecret`, the secrets module's inward plaintext reader — the
deep import past `secrets/index.ts` is the design, and `secrets/boundary.test.ts`
names this and the **stored CLI token** as its only two callers. Nothing here
decrypts or holds a key.

Both branches run since issue #124. The hosted one is the package's **own**
ai-sdk call, left to it rather than reimplemented; the only reason mamen names it
at all is `HostedTransport` (`ai-runner/hosted.ts`), the **one new seam** — an
optional tag read with `Effect.serviceOption`, so production provides nothing and
a test provides a fake in one line and asserts *what reached the vendor*. Nothing
under `src/` provides it, which is what keeps a faked vendor transport a thing
only a test can introduce.

**Stored CLI token**:
`ClaudeConfigStored` (`ai-runner/claude.ts`) — the `claude-code-effect` config
whose token is read from the **credential store**, per call, and from nowhere
else (issue #122). `CLAUDE_CODE_OAUTH_TOKEN` is not read: a credential mamen also
took from the environment would have two homes, one of which goes on looking live
in a deployment config after it stopped being read. The **effect form** of
`ClaudeConfig.token` is what makes it per-call, so a token pasted a moment ago
runs the next extraction without rebuilding a layer on the hot path. Two things
follow, and both are the ticket rather than side effects: `ClaudeCodeProdLive`
can no longer fail at build, so **the API starts with no token stored**, and
`ClaudeTokenMissingError` becomes a per-call failure — which `import/extract.ts`
turns into the one client-actionable extraction error (**provider not
configured**). The binary path and the timeout stay environment configuration:
they are facts about the machine, not credentials.

**Provider not configured**:
`AiProviderNotConfigured` (501) — the single failure `import/pdf-run.ts` holds
**out of** the collapse into `ExtractionFailed`, for both PDF operations. Three upstream tags mean the
same thing to whoever uploaded the file (no Claude Code token; the runner finding
no key for a hosted vendor; the resolver's `no-credential` refusal) and have the
same answer — paste a credential — so they become one named error that names the
task and the provider. `TaskProviderRejected`'s *other* reasons are deliberately
not folded in: a model the vendor does not serve is a different fix, and sending
the user to store a key would send them to fix the wrong thing. Everything else
still collapses, and the mapper answers `null` by default so that stays the rule
rather than a list somebody has to keep exhaustive. It names `extract-pdf`
whichever operation ran, because both spend that one **task choice** (issue
#217): a **discovery extraction** that failed for want of a credential is fixed
on exactly the same tile.

**Task table**:
`ai-runner/tasks.ts` — every **AI run** as data: the output contract, the CLI's
tool allowance, and **two prompt columns**. Two rows since issue #217:
`extract-pdf` and `discover-pdf`. Typed `Record<AiRun, TaskSpec<…>>` rather than
by `AiTask`, which those were the same list until **discovery extraction** — a
*run* is a prompt and an output contract, a **task** is a choice of provider and
model on the settings page, and discovery adds one without the other. `RUN_TASK`
is the link and is checked both ways (`tasks.test.ts`): no run spends a choice
nobody can make, and no task sits on the settings page running nothing. The two
columns are load-bearing: the CLI prompt names the absolute path of the staged
PDF and tells the model to open it with its own `Read` tool, which a hosted
vendor can neither act on nor be shown. The hosted column instead returns
`{ text, document }` — the statement's **bytes**, as a document part, which is
what preserves the two-column Débit/Crédit layout the rules depend on (issue
#124; server-side text extraction would discard it). Both prompts are built from
**one** copy of the extraction rules (`ai-runner/prompt.ts`), so the same
statement cannot extract differently depending on the chosen vendor; the CLI
prompt's own text is unchanged and `tasks.test.ts` holds it so.
The **declared columns** of the chosen **Statement Format** are part of that one
copy, not of either column (issue #185): both transports are being asked to read
the same statement, so a columns block written into one of them would be exactly
the drift the split exists to prevent. They arrive as `ExtractPdfInput.columns`
for the same reason the bytes do — a prompt builder is a pure function and
looking a format up is a database read, so `import/extract.ts` resolves it and
hands the list over. A format declaring none produces no block at all: an empty
heading tells the model the statement carries nothing.
**Every operation row** is asked for, a second product's included (PRD #180,
amendment 1): one statement file can carry two accounts — a Trade Republic
statement prints a `Compte PEA` and a `Compte courant` — and the prompt never
says which one the import is for, so the old *"this statement is for the
current/cheque account only"* rule discarded half the document on a guess the
model had no way to make. The exclusions are now about what a row **is** (a
balance, a total, a per-product `SYNTHÈSE` block) and never about which product
it belongs to; which rows enter the ledger is the user's decision afterwards, in
the import table's **row facets** (#195), and a row the model never returned is
one no facet can give back. The product is a *section heading* on that statement
rather than a cell, so the model is told to attribute the heading to the rows
printed beneath it — conditional on the format declaring a column for it, since
the archive is keyed by the declared columns and a heading with nowhere to go is
not a key the model may invent.
The task's **output** is `ExtractionOutput`, not the endpoint's `ExtractPdfResult`
(issue #188): the model answers with the rows, the totals and `missingColumns` —
the declared columns it could not find — and never with the conclusion drawn from
them. Required, not defaulted: a silence folded into "everything matched" is the
silent wrongness the verdict exists to end. Its rows are `ExtractedRow`, the
model's own row, which differs from the endpoint's by requiring `rawSource`
(issue #189) for the same reason.
Its `declaredTotals` is **required and nullable** (issue #196): not every
statement prints a `TOTAL DES OPÉRATIONS` line, and the model must say which case
it saw rather than stay silent about it. `import/extract.ts` folds the `null` to
an absent field on `ExtractPdfResult`, so the client's reconciliation check skips
instead of comparing the rows to an assumed zero — a zero pair stays a real
declared total, since a statement can print one. A per-product `SYNTHÈSE` block
is not the totals line: a file covering several products prints one each and no
single total over them all, so the answer there is `null` rather than one block
picked or several added up.

**A PDF row's raw source**:
`ExtractedTransaction.rawSource` — each operation's own cells, keyed by the
columns the chosen format declares and written **as the statement printed them**
(issue #189, asked for by `ai-runner/prompt.ts`'s `THE ROW AS PRINTED`). Every
other rule in that prompt says how to *read* a value; this one says not to, so
`1 929,71` is archived as written beside an `amount` of `1929.71`. Issue #175
excluded PDF rows on the premise that there is no original row to keep, and the
declared columns (#185) made that premise false — a table of exactly those
columns is row-shaped.
Required of the model, folded by `import/extract.ts` (`rowOf`): an empty archive
becomes **absent**, because `{}` and "nothing to keep" are one fact and the
contract spells it one way. Same division as the verdict — the model reports what
it saw, mamen draws the conclusion. Nothing derives from it
([ADR 0012](../../docs/adr/0012-raw-source-is-an-archive-promotion-is-earned.md)),
which `packages/web/src/test/raw-source-is-an-archive.test.ts` holds this package
to as well.

**Format verdict**:
`ExtractPdfResult.verdict` — `{ matched, missingColumns }`, the PDF counterpart
of the CSV path's header fingerprint (issue #188). The user chooses which format
reads a file and can choose wrong; until this was reported, the wrong choice came
back as plausible rows and the only backstop was reading every line of
side-by-side validation *after* deciding to import.
The fold is `import/extract.ts`'s (`verdictOf`), and it reads off the **declared**
list rather than the model's answer: a column the format never declared is
dropped (the verdict reports on the *expected* columns), the names come back in
the format's own spelling and order, comparison is trimmed and case-folded so a
`" DÉBIT "` does not fail a format that fits, and a format declaring no columns
matches whatever the model says. `matched` is `missingColumns` being empty —
derived rather than asked for, so the two halves cannot contradict each other.
A mismatch is **reported, never raised**: the rows still come back and the status
is still 200. What to do about a wrong format is the wizard's branch, and a 502
would say extraction failed, which is not what happened.

**Extraction takes a format**:
`POST /import/extract-pdf` takes `formatId` alongside the file, and is therefore
**no longer account-agnostic** — a **Statement Format** belongs to one account,
so naming one names the account ([ADR 0014](../../docs/adr/0014-pdf-extraction-is-account-aware-through-its-format.md),
amending [ADR 0005](../../docs/adr/0005-pdf-extraction-runs-server-side.md)).
The *id*, never the column list: what a bank's statement carries is the account's
stored answer, so `import/extract.ts` reads it back through `StatementFormatRepo`
rather than believing a body that could declare any columns it liked. A **CSV**
format's id is refused as `NotFound` and not applied — its `headers` are a
*fingerprint* (what a file must carry to be recognised), a different thing from
the columns to ask a model for, and the lookup fails before a provider is
reached. What has not changed is the answer: still candidates keyed to nothing,
with account, batch and month stamped client-side at commit.
_Avoid_: format detection (the model is never asked to pick the format as well as
apply it — the choice is the user's, or arithmetic when there is exactly one).

**Discovery extraction**:
`POST /import/discover-pdf` (`import/discover.ts`, issue #217, PRD #216) — a
statement read with **no Statement Format**, which is the state a *first* PDF
import is in. It answers with the transaction table as printed: `columns` in the
bank's own words and order, `rows` of string cells keyed by them, and the
**declared totals**. No `formatId` on the way in, no **format verdict** on the
way out, and nothing parsed — the client-side pipeline reads these strings once
the user has mapped the columns, which is the same division of labour as the CSV
path.
A **second operation** beside `extractPdf`, not an optional field on it: the two
differ in prompt, response and invariants, and an optional `formatId` would have
re-opened the "read it however you can" contract issue #185 closed. What makes
asking a model for a formatless read acceptable again is that this one is
*supervised* — a transcription is checkable against the statement beside it,
where the old canonical guess was not.
Two folds are the endpoint's (`discover.ts`), the same shape as the verdict's: a
model's `table: null` — and a table with no columns or no rows, which say the
same thing — becomes `NoTransactionTable` (422), because an empty table would
reach the user as a mapping step with nothing to map; and each row is re-keyed to
the declared columns, so a cell filed under a name the header row does not carry
is dropped rather than travelling as a column no format can declare. The cost is
named: a real statement covering a period with no operations reads as "no
transaction table".
It runs the `discover-pdf` row of the **task table** under the **`extract-pdf`
task's** stored choice, so there is no second card on the AI settings page and
**provider-unconfigured fails identically** — same tag, same task, same provider.
Staging, the `Read` allowance and the failure collapse are `import/pdf-run.ts`,
shared with extraction: each is a promise about a bank statement, and a second
operation quietly keeping the file would be a hole nobody reading either handler
could see.

**Hosted document part**:
The statement's bytes reach the task through `ExtractPdfInput.pdfBytes`, read by
`import/extract.ts` out of the **transient temp dir**'s staged copy — so both
transports are handed the same file and the same finalizer deletes it. The read
is in the handler and not in the prompt column because a prompt builder is a pure
function. The base64 encoding is the ai-sdk's, at the wire; mamen carries bytes.
**The wire shape is the vendor's, not mamen's** — Anthropic takes a `document`
part with a base64 `source`, Google an `inlineData` part, OpenAI a `file` part
holding a data URL — so each is asserted on its own request, `fetch` stubbed
under the production wiring with no seam provided (`import/handlers.test.ts`).
The seam sits above the conversion that makes them differ and cannot tell them
apart.

**Codec adapter**:
`effectSchemaCodec` (`ai-runner/codec.ts`) — one contract schema as the
runner's (and the CLI SDK's) validator-agnostic `ObjectCodec`: a JSON Schema for
the model, a decode returning an `Effect` for the answer. It is why **zod is not
a dependency of any mamen package** — the contract is already Effect Schema, and
a zod restatement of one class would be two definitions of one contract. Its one
non-mechanical part is `hoistRootRef`: `JSONSchema.make` emits a bare top-level
`{ $ref }` for every `Schema.Class`, which the CLI forwards into a tool
`input_schema` that requires a top-level `type` — an API 400 nothing on mamen's
side would name. `claude-code-effect` repairs that on its own `Schema` branch and
deliberately not on the codec branch, so it belongs to whoever builds the codec.

**Static uploads route**:
`/uploads/*`, serving the issuer-image directory. Deliberately **outside** the
contract: it is a plain wildcard route with no schema and no OpenAPI entry,
mounted on the same router as the API groups (which is why it is provided to
`serve` directly rather than through `ApiLive`). The contract owns the image
*upload* and *delete* endpoints; only the file surface is untyped. It carries its
own path-traversal guard — a request that resolves outside the uploads root 404s
— because nothing else is sanitising the wildcard.

**Credential boundary**:
The rule that a stored secret crosses out of `secrets/` only as a **secret
status** — a boolean and a masked hint — and crosses in only through
`readSecret`, the inward plaintext reader, which is not on `secrets/index.ts`
(ADR 0011). `secrets/repository.ts` is **the only module that decrypts**, so the
question "where can a credential become readable" is answered by opening one
file. Held by `secrets/boundary.test.ts`: no other module imports `decrypt`, no
other module reads the `encrypted_secrets` table, the reader's in-process callers
are named one by one (two, both in `ai-runner/` — one per transport that spends a
credential), and the barrel exports the outward surface and nothing else. The outward repository has no method that
returns a plaintext, which is what makes the group layer above it structurally
unable to leak one — asserted against the **built** service's method list, so a
fourth outward method has to redden it rather than being reviewed for.

**Secret status**:
`SecretStatus` — `{ name, configured, hint }`, the *only* outward shape a
credential has. `name` is an **AI provider**: the store is keyed by the
catalogue's provider set, so an unknown vendor fails the path decode into a 400
rather than writing a row nothing can read back. `GET /secrets` answers with one
status per provider, **in catalogue order and whether or not anything is
stored** — the settings page's question is "what are my options and which can I
select", and absent is an answer to it, so the catalogue drives that list and
not the table.

`hint` is the **masked hint** (first seven, `…`, last three) or `null`, and
`null` deliberately conflates two states the client has no use in separating: a
stored value below `SECRET_HINT_MIN_LENGTH`, and one that will not decrypt. A
value that will not decrypt reports `configured: true` — *present but
unreadable*, never absent — so a rotated `TOKEN_ENCRYPTION_KEY` tells the
operator to re-paste rather than implying nothing was ever stored.

`configured` is also how the **save-time kernel** learns which providers have a
credential, and that is the whole of what it learns: a value that will not
decrypt still counts as present, because a rotated key is an operator fault to be
fixed by re-pasting and refusing every save until then would take the settings
page away at the moment it is needed. Whether a credential actually *works* is a
question only a run can answer.

**Save-time kernel**:
`ai-tasks/kernel.ts` — the one rule of the AI settings feature (*a task must
never be left pointing at a provider that cannot run it*) as a **rule module**:
pure, no Effect, no SQL. Given a patch, the current choices and which providers
have a credential, it answers with a **rejection** or `null`. The order inside it
is load-bearing: the **model is checked before the credential**, because a model
the vendor does not serve is wrong whether or not a key exists, and reporting the
missing key would send the user to fix the wrong thing. `claude-code` never fails
the credential half — its token is a run-time concern, and checking it here would
refuse every save on a fresh install, including the save that switches away from
it. Being pure is what makes its whole decision matrix a table of function calls
in `kernel.test.ts` rather than dozens of HTTP round trips.
_Avoid_: validator (it decides, it does not parse).

**Checked write door**:
A write that reads the current state, asks the **save-time kernel**, and writes
only on `null` — the only way an **AI task**'s provider or model can change.
There are **two**, because there are two ways into an unrunnable task:
`PATCH /ai/tasks` (moving a task onto a provider) and `DELETE /secrets/:name`
(taking a provider out from under a task). Both live on {@link TaskProvider}
(`ai-tasks/task-provider.ts`), which is why the secrets group's `clear` handler
delegates there rather than to its own repository — a feature with one door and
one honour-system caller has no door. A refused patch writes **nothing**: the
check runs before the write, not per entry during it, so there is no
half-applied state to unwind. The deletion door refuses exactly when the deletion
is what breaks a task (runnable before, not after), which is what keeps the two
doors from disagreeing — clearing the `claude-code` credential is allowed for the
same reason a save onto `claude-code` with no token is.
_Avoid_: guard, middleware (it is the write path, not something in front of it).

**Task resolution**:
`ResolvedAiTask` — which provider and model an **AI task** runs on, or a
`TaskProviderRejected` saying why it cannot. What the runner asks before spending
a request, and what `GET /ai/tasks/:task/resolution` answers. **It carries no
credential field and must never grow one**: resolution answers *whether and
where*, and the key travels only inside the transport that spends it. Credential
*presence* is read through the **secret status**'s boolean, which is what leaves
the **credential boundary** untouched by the whole feature — the task-provider
module imports the outward repository, whose every method answers with a status.
Through the API the failure side is unreachable (that is what the doors are for);
it is reached by a stored row that went bad out of band, which is how its tests
plant it.

<!-- Terms are added here as they are resolved during design. -->
