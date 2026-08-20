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

**Owned-count input set**:
The six things a **Matching Rule**'s **Owned count** (see CONTEXT-MAP.md) is
derived from, stated where the derivation is — `derive` in
`matching/issuer-matcher.ts`: **row existence**, `manualIssuer`,
`rawIssuerString`, `amount`, `accountId`, and **the rule set** itself. Nothing
else. The count is computed on every read and never stored (the `matchCount`
column went in migration `0017_drop_rules_match_count`), so it is a function of
those six as they stand now.

The inverse is the load-bearing half: **a write touching none of the six cannot
change an Owned count**. `transferGroupId` (transfer link / unlink / dismiss),
`categoryId` / `manualCategory` (a category override), `excludedFromRecap` /
`manualExcluded` (recap exclusion) and an issuer's own `excludedFromRecap` recap
flag change how a row is *displayed or aggregated*; the matcher reads none of
them. Read loosely — as "any write that moves rows" — that reads as "any write
to the transactions table", and two separate reviews have now concluded from it
that the mutation hooks omitting the rules-cache invalidation were shipping
stale counts. They are not: check a write against the field list mechanically
instead of inferring from what "moves" means. `packages/web/CONTEXT.md` holds
the cache-invalidation rule that follows from this list, still worded as that
superset; issue #170 restates it in these six fields, in these words.
_Avoid_: "moves rows", "touches transactions" (both name a superset of the six).

**Wire suite / repo suite**:
The two test seams, one file each per resource. The **wire suite**
(`handlers.test.ts`) stands the whole API up on an ephemeral Node server over a
fresh `:memory:` database and drives it through the derived `HttpApiClient`, so
every assertion round-trips the real encode/decode — it is where a status code,
an error `_tag` and a **refusal reason** get pinned. The **repo suite**
(`repository.test.ts`) drives the repository directly, which is where multi-row
invariants and "what was actually written" are cheapest to state. A new rule
usually earns one of each: the repo suite says the write is refused, the wire
suite says the client is told so. Coverage is a real gate (90% lines/functions/
statements, 85% branches, counting modules no test imports).

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
`AiProviderNotConfigured` (501) — the single failure `import/extract.ts` holds
**out of** the collapse into `ExtractionFailed`. Three upstream tags mean the
same thing to whoever uploaded the file (no Claude Code token; the runner finding
no key for a hosted vendor; the resolver's `no-credential` refusal) and have the
same answer — paste a credential — so they become one named error that names the
task and the provider. `TaskProviderRejected`'s *other* reasons are deliberately
not folded in: a model the vendor does not serve is a different fix, and sending
the user to store a key would send them to fix the wrong thing. Everything else
still collapses, and the mapper answers `null` by default so that stays the rule
rather than a list somebody has to keep exhaustive.

**Task table**:
`ai-runner/tasks.ts` — every **AI task** as data: the output contract, the CLI's
tool allowance, and **two prompt columns**. Typed `Record<AiTask, TaskSpec<…>>`,
so a task added to the catalogue does not compile until it has a row. The two
columns are load-bearing: the CLI prompt names the absolute path of the staged
PDF and tells the model to open it with its own `Read` tool, which a hosted
vendor can neither act on nor be shown. The hosted column instead returns
`{ text, document }` — the statement's **bytes**, as a document part, which is
what preserves the two-column Débit/Crédit layout the rules depend on (issue
#124; server-side text extraction would discard it). Both prompts are built from
**one** copy of the extraction rules (`ai-runner/prompt.ts`), so the same
statement cannot extract differently depending on the chosen vendor; the CLI
prompt's own text is unchanged and `tasks.test.ts` holds it so.

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
