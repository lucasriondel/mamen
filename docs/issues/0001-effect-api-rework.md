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

## Not yet specified

- **Per-resource port tickets** — one per resource (health, accounts, categories, transactions, merchants, rules, subscriptions, settings, app-settings, database). Cut once [Design the new REST contract](0006-design-new-rest-contract.md) and [Scaffold the new packages](0007-scaffold-new-packages.md) close — contract decides final resource boundaries (e.g. the transactions query-param fan-out may split).
- **Test harness details** — mechanics settled by the [survey](../research/effect-httpapi-stack-survey.md) (sqlite-node `:memory:` test layer behind the SqlClient tag; `layerTest` server + derived client; vitest 3.2.4 pin; v8 coverage on Node with `coverage.include` covering untested modules). Still open: per-test fresh layer vs `it.layer`-shared with table reset, and the coverage threshold number. Sharpens during scaffold's walking skeleton.
- **SDK tanstack-query layer design** — pattern settled by the survey (hand-rolled module-scope ManagedRuntime, runPromiseExit + Cause.squash runner, per-resource queryOptions + key factories, SDK stays invalidation-agnostic). Still open: exact export surface and typed-error ergonomics at the useQuery boundary. Sharpens after contract + a first ported resource exist.
- **Cutover ticket** — delete old `@mamen/server` + old `@mamen/api`, rewire turbo/root scripts, final coverage check. Cut when the last resource port is in sight.

## Out of scope

- **Web frontend adaptation** — the web app switching to @mamen/sdk happens later as its own effort; frontend is allowed to break during this map.
- **Wire compatibility** — no requirement to preserve today's paths/params/response shapes.
