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
free to be grouped.
_Avoid_: DAO, service, store.

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

**Transient temp dir**:
The staging directory PDF import copies an upload into, opened scoped so it — and
the PDF — are deleted on **every** exit path: success, failure, timeout,
interrupt. Nothing about an extraction persists: no file on disk, no row in the
database.

**Static uploads route**:
`/uploads/*`, serving the issuer-image directory. Deliberately **outside** the
contract: it is a plain wildcard route with no schema and no OpenAPI entry,
mounted on the same router as the API groups (which is why it is provided to
`serve` directly rather than through `ApiLive`). The contract owns the image
*upload* and *delete* endpoints; only the file surface is untyped. It carries its
own path-traversal guard — a request that resolves outside the uploads root 404s
— because nothing else is sanitising the wildcard.

<!-- Terms are added here as they are resolved during design. -->
