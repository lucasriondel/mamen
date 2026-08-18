# shared — glossary

The HTTP API **contract** (`src/contract/`) plus the shared domain types
(`src/types/`). Source of truth for the domain entities: `@mamen/api` implements
the contract, `@mamen/sdk` derives its client from it, and
`packages/api/openapi.json` is emitted from it. Pure schema values — no
handlers, no I/O, no database and no DOM; the only dependencies are `effect` and
`@effect/platform`, and nothing here may acquire a runtime one. A short list of
**deployment constants** sits beside them at the package root, for the same
reason: several packages must agree on the value and none of them owns it.

The conventions below were settled once in
[`docs/research/api-contract.md`](../../docs/research/api-contract.md) and
[`docs/research/error-taxonomy.md`](../../docs/research/error-taxonomy.md); the
`contract §2.x` / `taxonomy §N` references scattered through the source point
back at them.

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for cross-context terms (**Issuer**,
**Recap**, **Bundle**, **Transfer group**, …). They are defined once there and
never restated per package — this file names only what is specific to
*declaring* the contract.

## Language

**Contract**:
The single `Api` value (`src/contract/api.ts`) — an `HttpApi` assembled from one
**group** per resource, prefixed `/api`. It has exactly three consumers: the
server implementation, the derived client, and the emitted OpenAPI spec. Because
all three read the same value, an endpoint cannot exist in one and not the
others; adding one here is what makes it callable everywhere.
_Avoid_: schema package, types package, API definition (the contract is a value,
not a document).

**Group**:
One `HttpApiGroup` per resource (`accounts`, `transactions`, …), carrying its
endpoints, its `.prefix`ed path and its OpenAPI title, added to the **contract**
in `api.ts`. The unit a server layer implements and a client namespace mirrors:
`client.accounts.list`.
_Avoid_: router, controller, module (each names an implementation, and the group
has none).

**Entity schema**:
The wire shape every endpoint of a group returns, declared as a `Schema.Class`
(`Account`, `Transaction`, `Rule`). It is the shape *on the wire*, not the shape
in sqlite — the storage row is the api package's business and may differ freely
(ISO TEXT dates, `0`/`1` booleans). Datetime fields are `Schema.Date`;
date-only / month / opaque strings stay `Schema.String`.
_Avoid_: model, DTO, row.

**Create payload / Update payload**:
The other two thirds of every resource's trio. `XCreate` omits what the server
assigns (`id`, `createdAt`, `updatedAt`); `XUpdate` is `Schema.partial(XCreate)`
— every field optional, so a partial update is expressible without a second
schema. Both reference `X.fields.name` rather than restating a field's type, so
a widened entity field cannot leave its payload behind.

**Branded id**:
`Schema.Int.pipe(Schema.brand("AccountId"))`, one per resource (`src/contract/ids.ts`).
Ids are plain sqlite integers; the brand exists so an `IssuerId` cannot be passed
where an `AccountId` is expected. There is **no DB-level foreign-key
enforcement** anywhere in this project — the brand is a compile-time and
contract-level guard only, never a runtime referential check. `numFromStr(Id)`
is the decoder for the positions where an id arrives as text: path params
(`HttpApiSchema.param`) and query filters. A non-numeric segment then fails
schema decode into a `400`, which is why there is no hand-written "invalid id"
error.

**Filter set**:
A plain object of optional url params (`TransactionFilters`, `RuleListFilters`,
…) spread into a group's `urlParams` struct beside `Pagination`. Every present
field `AND`-combines server-side; an absent one contributes nothing. It is
*composable* by construction — the redesign that replaced an either/or fan-out
where one filter dominated and the rest were unreachable. Query params are
always strings, so a boolean filter decodes through `BooleanFromString` and a
branded-id filter through `numFromStr`.
_Avoid_: query object, search params (they name the transport, not the set).

**Paged envelope**:
`Paged(X)` = `{ items, total }`, the success schema of every list endpoint.
`items` is the current page; `total` is the count of the **whole filtered set**
before `limit`/`offset`, so the caller can page. `PaginationDefaults` (`limit:
50`, `offset: 0`) is exported because the server applies it to a raw caller and
the derived client — whose decoded params are required — must fill the same
window; one default, not two.

**Domain error**:
A `Schema.TaggedError` with a fixed HTTP status pinned via
`HttpApiSchema.annotations` (`src/contract/errors.ts`). The wire body is its
fields plus the `_tag` discriminant, flat, with no wrapper key — the same grain
as the framework's own errors, so the client `switch`es on `_tag` with real
fields rather than parsing prose out of a message. An endpoint declares only the
errors it can actually produce (`.addError`). `HttpApiDecodeError (400)` and an
untyped `500` are implicit on every endpoint and are **not** members of this
set: nothing declares them, and nothing should invent a typed error for either.
A `SqlError` never appears here at all — it is caught at the api package's
service boundary.
_Avoid_: exception, validation error (schema decode already owns validation).

**Refusal reason**:
The `reason` field on the multi-row grouping errors (`TransferInvalid`,
`BundleInvalid`) — a literal union naming the machine-readable cause
(`unbalanced`, `already-bundled`, `is-transfer-leg`, …), so a client can tell
"a row is missing" from "the rows don't balance" and word its own refusal. A
dedicated error per grouping rather than an overloaded `NotFound`, and one
`reason` per rule rather than one per surface: when the same rule is enforced
from both sides, each side reuses the error its own grouping already raises.
_Avoid_: error code, message (the reason is not display text — the client owns
the wording).

`SecretRejected` carries one for a stricter reason than legibility: the value it
refused is a **credential**, so the reason code is the *whole* error — the type
has no field a secret could travel in, and therefore no way for one to reach a
response body or a log (ADR 0011).

**Write-only field**:
A payload field with no counterpart on any success shape — `SecretValue.value`,
the pasted credential. It travels into `put` and comes back from nothing: the
success body is a **secret status** (a boolean and a masked hint) and the
refusal is a **refusal reason**. The contract is where this is enforceable at
all, because a field the contract does not declare is a field no handler can
return. `LlmSettings.apiKey` is the counter-example the rule exists for — a plain
string on an entity `GET /app-settings` hands to any caller; PRD #115 deletes
it.
_Avoid_: input-only, transient (both suggest a lifetime rather than a direction).

**Leaf catalogue**:
A **contract** module of plain data and predicates that imports nothing but
`effect` — `contract/ai.ts`, the **AI provider** set with its labels, its
**curated model list**, the **AI task** list and the three predicates over them
(is this provider hosted, does it serve this model, what is its default model).
Leaf because its readers sit on both sides of the wire — the web picker, the
API's save-time validator and the task table — and none of them should acquire a
dependency by reaching it. That is a property nothing can enforce by type, so
`ai.test.ts` reads the source and asserts every import is `effect`. Distinct
from a **deployment constant**, which is import-free for the same reason but
describes where the app is *hosted* rather than what it exchanges, and which is
therefore not part of the contract at all.
_Avoid_: config, registry (nothing is looked up or registered — it is a list).

**Half-edit payload**:
A payload whose every field but the key is optional, where **what is omitted
carries meaning** rather than merely being left alone — `AiTaskChange` (issue
#119): a provider with no model lands the task on that provider's default, and a
model with no provider is resolved against the stored row. Distinct from a
`XxxUpdate` (`RuleUpdate`, `IssuerUpdate`), where an omitted field means "leave
this as it was" and nothing more. It is worth a name because both readings are
defensible and the difference is invisible in the type: the contract module's
comment is where the choice is recorded, and the API's **save-time kernel** is
where it is enforced and tested.
_Avoid_: partial update (that is the other thing).

**Deployment constant**:
A plain value every deployed layer has to agree on, exported from the package
root because more than one package reads it and none of them owns it —
`APP_BASE_PATH` / `APP_BASE_PATH_SLASH` (`src/app-base-path.ts`), the prefix the
SPA is served under, and the **port registry** rows (`src/ports.ts`). Not a
domain type and not part of the **contract**: it
describes where the app is *hosted*, not what it exchanges. Each such module
stays import-free so a build config (`vite.config.ts`) can read it without
pulling `effect` in behind it, and each documents the constraint that fixes its
value — for the base path, why `/api` and `/uploads` stay outside the prefix.
Import-free is only worth something if a consumer can reach the module without
the package root, so each gets its own `exports` entry
(`@mamen/shared/app-base-path`): that is how `@mamen/landing-page` reads the
prefix without `effect` entering a build whose whole output is one HTML file.
_Avoid_: config, env var (nothing here is read from the environment; a value
that varies per deployment does not belong in this package at all).

**Port registry**:
The numbers mamen binds on a developer's machine, as data (`src/ports.ts`,
issue #137): the three dev servers `bun dev` starts, the demo stack's published
host ports — **reserved** before the compose file that will publish them exists
— and the self-host Compose stack's published web port (5402, issue #142), which
`docker-compose.yml` defaults `WEB_PORT` to. It is mamen's rows of a registry
that lives outside this repo (`~/dev/PORTS.md`, one file for every app on the
box) — which is why a row here is not a claim until it is appended there, and
why the module names the conventions it allocated under (perso frontends in
5xxx, Docker host ports from 5400 up and with no gap, `strictPort` on anything
Vite serves). A **reserved** row binds nothing yet; it exists so the next change
picks a free number rather than the demo stack's. The two Vite configs, the
API's `PORT` default, `docker-compose.yml` and the README's table all read it
(the compose file by test, since YAML imports nothing), so a port cannot be
moved in one place only.
_Avoid_: listen port (the API's is configurable — `PORT` — and the registry
records the *default*, which is what the dev proxy talks to), exposed port (a
container's internal port is not a host allocation and takes no row).

**Legacy domain type**:
The plain TypeScript types under `src/types/`, exported from the package root
(`@mamen/shared`) as opposed to `@mamen/shared/contract`. They pre-date the
contract, carry no branding and no decoder, and the **contract is authoritative
wherever the two disagree**. Only `CategoryTreeNode` is still imported anywhere,
and it is built on the *contract* `Category` precisely so its ids keep their
brand. Nothing new should be added here.
_Avoid_: shared types (ambiguous — the contract schemas are shared too).

<!-- Terms are added here as they are resolved during design. -->
