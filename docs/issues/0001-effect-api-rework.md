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

## Not yet specified

- **Per-resource port tickets** — one per resource (health, accounts, categories, transactions, merchants, rules, subscriptions, settings, app-settings, database). Cut once [Design the new REST contract](0006-design-new-rest-contract.md) and [Scaffold the new packages](0007-scaffold-new-packages.md) close — contract decides final resource boundaries (e.g. the transactions query-param fan-out may split).
- **Test harness details** — walking skeleton ([Scaffold](0007-scaffold-new-packages.md)) settled the mechanics for endpoints with no DB: `NodeHttpServer.layerTest` + per-test `Effect.provide(HttpLive)` (fresh server per test, not `it.layer`-shared); `vitest.setup.ts` `addEqualityTesters()`; `fakeTimers.toFake: undefined`; v8 coverage with `all: true` and runtime-bootstrap files excluded. Still open: the **sqlite `:memory:` test layer** wiring under `HttpApiLive` (fresh DB per test vs `it.layer` + table reset — settle when the first DB-backed resource is ported), and the **coverage threshold number** (gate is provisional 70/60). 
- **SDK tanstack-query layer design** — now concrete in code ([Scaffold](0007-scaffold-new-packages.md): module-scope `ManagedRuntime` + `Client` Effect.Service over FetchHttpClient, `runQuery` = runPromiseExit + Cause.squash, per-resource `queryOptions` + key factories, SDK invalidation-agnostic). Still open: **typed-error ergonomics at the useQuery boundary** (react-query can't infer `error` type from queryFn — needs explicit generics or v5 `Register` module augmentation; decide the SDK's stance) and whether the SDK exposes `mutationOptions`/invalidation helpers. Sharpens after the first ported resource with real errors.
- **Cutover ticket** — delete old `@mamen/server` + `@mamen/web-api-legacy`, retire zod from `@mamen/shared`, rewire root `turbo dev`/scripts onto the new `@mamen/api`, final coverage check. Cut when the last resource port is in sight.

## Out of scope

- **Web frontend adaptation** — the web app switching to @mamen/sdk happens later as its own effort; frontend is allowed to break during this map.
- **Wire compatibility** — no requirement to preserve today's paths/params/response shapes.
- **Effect 3→4 migration** — rework builds on Effect 3 stable per [Effect 3 stable or Effect 4 beta](0008-effect-3-stable-or-4-beta.md); moving to 4 is a future effort once 4.0 is stable, not part of this map.
