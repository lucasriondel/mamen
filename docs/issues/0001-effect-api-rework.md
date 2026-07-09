---
id: 1
title: Effect API rework
state: open
labels: [wayfinder:map]
assignee: none
blocked-by: []
---

## Destination

The Fastify stack is gone, replaced by a full Effect stack across three packages, live and fully tested:

- **@mamen/shared** — Effect Schema domain schemas + the HttpApi contract. Zod removed everywhere.
- **@mamen/api** — server implementation: `@effect/platform-bun` HTTP server, `@effect/sql-sqlite-bun` data layer (full repository rewrite), services/layers.
- **@mamen/sdk** — typed client derived from the contract (`HttpApiClient`) plus a tanstack-query layer (react-query as peer dep).

The REST contract is redesigned properly (composable list filters, typed error bodies, correct status codes — no wire compatibility with today). Every route is integration-tested through the derived SDK against an in-memory sqlite layer, plus `@effect/vitest` unit tests for services; a v8 coverage gate is enforced. OpenAPI ships three ways: live `/api/openapi.json`, Scalar docs UI, and a spec file committed to the repo. Old `@mamen/server` and old `@mamen/api` are deleted at cutover.

## Notes

- **Execution override**: this map carries execution, not just planning. Implementation tickets (scaffold, per-resource ports, cutover) live on the map; the map is done when the new API is live, tested, and the old packages are deleted.
- Consult the `/effect-ts` skill every session that touches Effect code.
- Runtime is Bun (workspace uses bun 1.3.4, turbo, biome, vitest).
- Architecture decisions locked at charting: Effect HttpApi over Fastify; Effect Schema everywhere (zod killed); 3-package layout (shared = schemas + contract, api = server, sdk = client + tanstack-query); full `@effect/sql` rewrite of the repository layer; big-bang migration on a branch (frontend allowed to break, adapted later); integration-first testing through the SDK with an enforced coverage gate; contract redesigned freely.
- Tracker conventions: `docs/agents/issue-tracker.md`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md) — stable Effect 3.21 stack fully supports the destination; survey asset at [docs/research/effect-httpapi-stack-survey.md](../research/effect-httpapi-stack-survey.md). Three map-shaping findings: Effect 4.0 in active beta (→ [Effect 3 stable or Effect 4 beta](0008-effect-3-stable-or-4-beta.md)); new packages must pin vitest 3.2.4 (vitest 4 breaks @effect/vitest); tests must run sqlite via @effect/sql-sqlite-node behind the SqlClient tag (bun:sqlite unusable under vitest).
- [Effect 3 stable or Effect 4 beta](0008-effect-3-stable-or-4-beta.md) — Effect 3 stable (the surveyed 3.21.4 stack); vitest 3.2.4 pinned in new packages; 3→4 migration deferred to a future effort.
- [Uploads and static files under HttpApi](0003-uploads-static-files-under-httpapi.md) — both first-class on the surveyed stack; asset at [docs/research/uploads-static-under-httpapi.md](../research/uploads-static-under-httpapi.md). Upload = `HttpApiSchema.Multipart` + `SingleFileSchema`, handler gets a scoped-temp `PersistedFile`, client sends `FormData`, OpenAPI emits binary. Contract must own two things the combinator won't: the jpeg/png/webp/gif MIME allow-list (handler/refinement + `InvalidFileType` error) and size (rely on `maxFileSize` — no `PersistedFile.size`). Static `/uploads/*` = wildcard route → `HttpServerResponse.file` in the same `HttpApiBuilder.Router` (bun: auto content-type + etag), **needs a path-traversal guard**. Sole consumer is merchant logos; `imageUrl` must stay a root-relative `/uploads/…` path.
- [Scaffold the new packages](0007-scaffold-new-packages.md) — three-package skeleton live, walking `/api/health` green through the derived SDK client, whole workspace typechecks + tests. Naming collision resolved by **renaming** old client-hooks `@mamen/api` → `@mamen/web-api-legacy` (not deleting); old `@mamen/server` + legacy pkg parked until cutover. **Zod kept in `@mamen/shared`** for now (frontend still uses it) — Effect contract isolated under `@mamen/shared/contract`; zod retirement folds into cutover. Versions pinned (effect 3.21.4 stack, vitest 3.2.4). Coverage gate provisional (70/60, bootstrap files excluded). Emit script + committed `packages/api/openapi.json` delivered here — see the note under **Not yet specified** re: [OpenAPI spec emit script](0009-openapi-emit-script.md).
- [Inventory the current API surface](0004-inventory-current-api-surface.md) — complete fact inventory of all **50 endpoints across 11 resources**; asset at [docs/research/api-surface-inventory.md](../research/api-surface-inventory.md). No new tickets — feeds [Design the new REST contract](0006-design-new-rest-contract.md) (its resource-by-resource checklist) and [Error taxonomy](0005-error-taxonomy-status-conventions.md). Contract-shaping findings: the `GET /api/transactions` fan-out is **either/or dispatch, not composable** (9-branch first-match, `accountId` dominates) → must become composable filters; settings/app-settings **both** hold LLM config (merge-or-split decision); pervasive inconsistencies to normalize (envelopes, 404-on-mutation, NaN guards only on path ids, verb/semantics mismatches); IDs numeric, dates ISO-8601 in `TEXT` with a datetime-only reviver → `Schema.Date`; zero DB-level FKs/cascades. Drop candidates: broken orphan `POST /api/import` (no server route) + 14 client-only endpoints; legacy `query/` factory layer is dead (web hand-rolls hooks). Current wire errors are all bare `{ error: string }`.
- [OpenAPI spec emit script](0009-openapi-emit-script.md) — narrowed to the **drift guard** (emit script + committed `packages/api/openapi.json` were already delivered by Scaffold). Added `openapi:check` = `emit-openapi.ts --check`: regenerates the spec in memory, string-diffs the committed file, exits 1 on drift/missing. Wired into CI by chaining ahead of vitest (`"test": "bun run openapi:check && vitest run"`) — no new turbo task. The map's OpenAPI story (live spec + Scalar + committed spec + drift guard) is complete.
- [Error taxonomy and status conventions](0005-error-taxonomy-status-conventions.md) — the shared error + success-status convention every endpoint follows; asset at [docs/research/error-taxonomy.md](../research/error-taxonomy.md). Flat per-error tagged envelope. **3 domain errors** — `NotFound (404)`, `Conflict (409)`, `InvalidFileType (415)` — plus framework `HttpApiDecodeError (400)`; `Invalid id` becomes schema decode, `ValidationError`/domain-rules omitted (faithful port). SqlError caught at the service boundary: UNIQUE→`Conflict`, else untyped 500 (no DB leak). Success: create 201+resource, update 200+resource, delete 204, bulk-put/delete 200 `{count}`. **Tight per-endpoint error sets** via a by-operation mapping rule. Deliberate behavior change: update/delete 404 on missing id (was silent `{ok}`). **Closes the last blocker on [Design the new REST contract](0006-design-new-rest-contract.md).**
- [Design the new REST contract](0006-design-new-rest-contract.md) — the full redesigned contract; spec asset at [docs/research/api-contract.md](../research/api-contract.md), precise enough that a port ticket needs no further contract decisions. **~45 endpoints across 10 groups** (down from 50/11). Six grilled decisions: transactions list → **fully composable AND filters** (9-branch fan-out killed; count shares the filter struct); settings/app-settings **stay split** (LLM dup accepted); **drop the broken orphan + all 14 client-only endpoints** (`*/clear` subsumed by `database/reset`); **branded ids everywhere** (retires `Invalid id`); **all lists paginated** (`{items,total}` + `Pagination` helper); **keep all bulk ops + db verbs, normalized**. Plus: `Schema.Date` for datetimes (subscription dates stay string — faithful), fixed the zod `displayPreferences` drift, `PUT`/`DELETE` now 404 on missing id. **Graduates the 10 per-resource port tickets** — each group's §2 spec is implementation-ready.
- [Shared contract foundations](0010-shared-contract-foundations.md) — the **expand** step landed in `@mamen/shared/contract` (zod untouched): seven branded id schemas + `numFromStr` helper (`ids.ts`), `Pagination` params + `Paged({items,total})` envelope (`pagination.ts`), the three `Schema.TaggedError` domain errors with status annotations + `BooleanFromString` (`errors.ts`). Whole workspace typechecks, walking-skeleton api tests green, wire shapes runtime-verified (`NotFound` → `{resource,id,_tag}` exact). Unblocks [Port accounts](0011-port-accounts.md) and every port transitively.

## Implementation tickets (cut 2026-07-09)

The port + cutover work is now cut into 11 tickets (ids 10–20), graduated from the contract close. Dependency order — work the frontier (all blockers closed):

- ~~[Shared contract foundations](0010-shared-contract-foundations.md) (#10)~~ — **DONE** (2026-07-09). Branded ids + `numFromStr` + `Pagination`/`Paged` + 3 `TaggedError`s + `BooleanFromString` live in `@mamen/shared/contract`.
- [Port accounts](0011-port-accounts.md) (#11, ⟵ #10) — **frontier now**; first DB-backed port; **settles the `:memory:` test-layer wiring + coverage threshold** every later port copies.
- Then, parallel after #11: [categories](0012-port-categories.md) (#12), [merchants + upload](0013-port-merchants.md) (#13), [transactions core](0014-port-transactions-core.md) (#14), [rules](0016-port-rules.md) (#16), [subscriptions](0017-port-subscriptions.md) (#17), [settings + app-settings](0018-port-settings-app-settings.md) (#18) — each ⟵ [#10, #11].
- [Port transactions bulk](0015-port-transactions-bulk.md) (#15, ⟵ #14) — bulk + targeted deletes on the core handler layer.
- [Port health + database](0019-port-health-database.md) (#19, ⟵ #10 + #12–18) — last resource port; `DbDump` references every entity.
- [Cutover](0020-cutover.md) (#20, ⟵ #11–19) — delete old packages, retire zod, rewire dev. **Closes the map.**

Boundaries are final — the transactions fan-out did **not** split into separate endpoints (one composable-filter list); the core/bulk split (#14/#15) is a context-size cut, not a contract boundary. Each port implements its group from [api-contract.md](../research/api-contract.md) §2 with no contract decisions left.

## Not yet specified

- **Test harness details** — walking skeleton ([Scaffold](0007-scaffold-new-packages.md)) settled the mechanics for endpoints with no DB: `NodeHttpServer.layerTest` + per-test `Effect.provide(HttpLive)` (fresh server per test, not `it.layer`-shared); `vitest.setup.ts` `addEqualityTesters()`; `fakeTimers.toFake: undefined`; v8 coverage with `all: true` and runtime-bootstrap files excluded. Still open: the **sqlite `:memory:` test layer** wiring under `HttpApiLive` (fresh DB per test vs `it.layer` + table reset — settle when the first DB-backed resource is ported), and the **coverage threshold number** (gate is provisional 70/60). 
- **SDK tanstack-query layer design** — now concrete in code ([Scaffold](0007-scaffold-new-packages.md): module-scope `ManagedRuntime` + `Client` Effect.Service over FetchHttpClient, `runQuery` = runPromiseExit + Cause.squash, per-resource `queryOptions` + key factories, SDK invalidation-agnostic). Still open: **typed-error ergonomics at the useQuery boundary** (react-query can't infer `error` type from queryFn — needs explicit generics or v5 `Register` module augmentation; decide the SDK's stance) and whether the SDK exposes `mutationOptions`/invalidation helpers. Sharpens after the first ported resource with real errors ([Port accounts](0011-port-accounts.md) #11).

## Out of scope

- **Web frontend adaptation** — the web app switching to @mamen/sdk happens later as its own effort; frontend is allowed to break during this map.
- **Wire compatibility** — no requirement to preserve today's paths/params/response shapes.
- **Effect 3→4 migration** — rework builds on Effect 3 stable per [Effect 3 stable or Effect 4 beta](0008-effect-3-stable-or-4-beta.md); moving to 4 is a future effort once 4.0 is stable, not part of this map.
