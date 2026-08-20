---
id: 7
title: Scaffold the new packages
state: closed
labels: [wayfinder:task]
assignee: luriondel
parent: 1
blocked-by: [2, 8]
---

## Question

Stand up the three-package skeleton so per-resource ports have a home. AFK task, using versions/patterns from [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md):

- Resolve the naming collision: new `@mamen/api` (server) vs the existing `@mamen/api` (client hooks). Frontend is allowed to break — decide whether old packages are deleted/renamed now or parked until cutover, and do it.
- Create/rework the packages: `@mamen/shared` (Effect Schema + contract home, zod dependency dropped from it), `@mamen/api` (platform-bun server entry, layers skeleton, dev script teeing to `logs/server.log` per repo convention), `@mamen/sdk` (client derivation + tanstack-query layer skeleton, react-query peer dep).
- Wire the workspace: turbo tasks (dev/build/test/typecheck), tsconfig refs, the linter, vitest + @effect/vitest config, v8 coverage gate config (threshold per map notes).
- One walking-skeleton endpoint end-to-end as proof: `/api/health` defined in the contract, implemented in the server, hit through the derived SDK client in an integration test, visible in `/api/openapi.json` and Scalar docs.

Resolution records: package layout as built, versions pinned, how to run dev/test, what was done with the old packages.

## Resolution

Three-package skeleton stood up, walking skeleton green end-to-end, whole workspace typechecks + tests. All six packages build under turbo.

**Naming collision — resolved by renaming, not deleting.** The old client-hooks `@mamen/api` was `git mv`'d to `packages/web-api-legacy` (name `@mamen/web-api-legacy`), freeing the `@mamen/api` name for the new server. Web's three references were rewired (`packages/web/package.json` dep, `src/lib/api/index.ts` re-export, `src/test/api-mock-setup.ts` two mocks) and root `tsconfig.json` refs updated — web's 1428 tests still pass. **Old `@mamen/server` (Fastify) and `@mamen/web-api-legacy` are left in place**, deleted at cutover, not now: the server is still the live API the web app hits, and the frontend keeps compiling. This is the "park until cutover" option; only the *rename* happened now, forced by the name clash.

**Deviation from the ticket — zod stays in `@mamen/shared` for now.** The ticket said drop zod from shared. Kept it: web + web-api-legacy still import the zod schemas from `@mamen/shared` root, and the frontend isn't ported in this map. The Effect contract lives in a **separate subpath** `@mamen/shared/contract` (`src/contract/`, deps `effect` + `@effect/platform` only) so Effect-land and zod-land don't collide during migration; the root barrel (`src/index.ts`) is untouched. Zod is retired from shared later, once ports + frontend migration make the zod exports dead — folds into the cutover, not this task.

**Package layout as built:**
- `@mamen/shared` — `src/contract/{api,health,index}.ts` = the HttpApi contract (`Api` prefixed `/api`, `HealthGroup` + `Health` schema). Root barrel still exports the legacy zod schemas. New export map: `.`, `./contract`, `./*`.
- `@mamen/api` (server) — `src/config.ts` (Port/CorsOrigins from env), `src/health/handlers.ts` (`HealthLive`), `src/api-live.ts` (`ApiLive` = contract + group impls), `src/server.ts` (`ServerLive`: logger + Scalar `/docs` + OpenAPI `/api/openapi.json` + CORS + BunHttpServer), `src/index.ts` (`BunRuntime.runMain`). `scripts/emit-openapi.ts` + committed `openapi.json`.
- `@mamen/sdk` (client) — `src/runtime.ts` (module-scope `ManagedRuntime` + `Client` Effect.Service over `FetchHttpClient`, `runQuery` = runPromiseExit + Cause.squash), `src/health/queries.ts` (`healthKeys` + `healthQueries` queryOptions). react-query is a peer dep.

**Versions pinned** (per survey, all Effect 3.21 stable): effect 3.21.4, @effect/platform 0.96.2, @effect/platform-bun 0.90.0, @effect/sql 0.51.1, @effect/sql-sqlite-bun 0.52.0; test-side @effect/sql-sqlite-node 0.52.0, @effect/platform-node 0.107.0, @effect/vitest 0.29.0, **vitest 3.2.4 + @vitest/coverage-v8 3.2.4** (the required pin — vitest 4 breaks @effect/vitest). Web stays on vitest 4.

**Config wired:** turbo tasks were already generic (dev/build/test/typecheck) and needed no change. Root `tsconfig.json` references all six packages. api + sdk each have a `vitest.config.ts` (Node env, `fakeTimers.toFake: undefined`, v8 coverage). api has a `vitest.setup.ts` calling `addEqualityTesters()`. sdk uses `passWithNoTests` (its runtime is covered through api's integration tests). Lint clean.

**Coverage gate** (provisional — the threshold number is still open on the map): api enforces lines/functions/statements 70, branches 60, with `all: true` and **runtime-bootstrap files excluded** (`index.ts`, `server.ts`, `config.ts`, `api-live.ts` — exercised via the running server, not unit tests). Current handler coverage is 100%, gate passes.

**Walking skeleton — proven:** `/api/health` defined in the contract, implemented in the server, hit through the **derived SDK client** in `packages/api/src/health/handlers.test.ts` via `NodeHttpServer.layerTest` (a real ephemeral server + wired HttpClient), asserting `new Health({ status: "ok" })`; a second test asserts the path is in `OpenApi.fromApi`. Live smoke test confirmed `/api/health` → `{"status":"ok"}`, `/api/openapi.json` (OpenAPI 3.1.0), and Scalar `/docs` (200).

**How to run:**
- Dev server (new API): `cd packages/api && bun run dev` — `bun --watch`, tees to `logs/server.log`, port 3000 (env `PORT`), CORS from `CORS_ORIGINS` (default `http://localhost:5173`). *Not yet wired into root `turbo dev`* — the old `@mamen/server` still owns that; swapping the root dev target happens at cutover.
- Tests: `bun run test` (turbo, all packages) or `cd packages/api && bunx vitest run [--coverage]`.
- Emit OpenAPI: `cd packages/api && bun run emit-openapi` → regenerates committed `packages/api/openapi.json`.

Note on cross-package typecheck: `@mamen/shared` must be built (`tsc`) before `@mamen/api`/`@mamen/sdk` typecheck in isolation (composite project refs resolve through `dist`); turbo's `typecheck dependsOn ^build` handles this, so `bun run typecheck` is clean from cold.
