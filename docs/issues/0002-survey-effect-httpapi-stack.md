---
id: 2
title: Survey the Effect HttpApi stack
state: closed
labels: [wayfinder:research]
assignee: lucas
parent: 1
blocked-by: []
---

## Question

What are the current (mid-2026) packages, versions, and canonical patterns for the full Effect HTTP stack this rework builds on? Produce a markdown summary (linked asset under `docs/research/`) covering:

- **HttpApi contract definition**: `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` — how endpoints declare path/query/payload schemas, typed error responses with status codes, success status codes (200/201/204). How the contract lives in a package separate from the implementation.
- **Server implementation**: `@effect/platform-bun` — serving an HttpApi, layers/services wiring, middleware (CORS, logging), config.
- **Client derivation**: `HttpApiClient.make` — what the derived client's error channel looks like, how typed errors surface per endpoint.
- **OpenAPI**: `OpenApi.fromApi` (or current equivalent), serving the spec, Scalar docs UI (`HttpApiScalar`), emitting the spec to a file from a script.
- **@effect/sql-sqlite-bun**: defining repositories, `SqlSchema`/`Model` patterns, migrations story, transactions, in-memory database for tests.
- **@effect/vitest**: test patterns for effects, layer substitution, running a real server + derived client in integration tests.
- **tanstack-query integration**: known patterns for wrapping an Effect-derived client in queryOptions/hooks (react-query v5).
- Exact package versions compatible with each other and with Bun 1.3.x, and any known gotchas.

Consult the `/effect-ts` skill first; verify against current official docs (effect.website) — training-data APIs may be stale.

## Resolution

Full survey written to [docs/research/effect-httpapi-stack-survey.md](../research/effect-httpapi-stack-survey.md) (verified against the Effect monorepo source at `~/.effect`, main @ d24511f 2026-07-08, matching npm latest; official docs page for HttpApi currently 404s — the platform README is the maintained reference).

**Versions (stable stack, all mutually compatible):** effect 3.21.4, @effect/platform 0.96.2, @effect/platform-bun 0.90.0, @effect/sql 0.51.1, @effect/sql-sqlite-bun 0.52.0, @effect/vitest 0.29.0, @tanstack/react-query 5.101.2. TS 5.9.3 and Bun 1.3.4 fine.

**Everything the destination needs exists and is stable on Effect 3.21:** contract-in-own-package (deps: effect + @effect/platform only); HttpApiBuilder server on BunHttpServer; HttpApiClient.make derived typed client over FetchHttpClient (typed errors decode to real tagged instances); OpenApi.fromApi is pure/sync (trivial committed-spec emit), middlewareOpenApi serves it live, HttpApiScalar serves docs; Model.Class + makeRepository is the canonical repository pattern (caveat: its methods orDie — custom SqlSchema queries for typed errors); SqliteMigrator runs migrations at layer startup; withTransaction nests via savepoints.

**Three findings that change the map:**

1. **Effect 4.0 is in active beta** (94 betas since 2026-02-18, beta.94 yesterday; platform folded into core `effect`). Survey documents Effect 3 APIs; building on the beta is a real option with real costs → new ticket [Effect 3 stable or Effect 4 beta](0008-effect-3-stable-or-4-beta.md), blocks scaffold.
2. **vitest 4 hard-breaks @effect/vitest 0.29.0** (removed ctx.onTestFinished; fix PR unmerged). New Effect packages must pin vitest 3.2.4 + @vitest/coverage-v8 3.2.4; web stays on vitest 4.
3. **bun:sqlite is untestable under vitest** (vitest runs on Node; Bun-runtime vitest unsupported; v8 coverage impossible under Bun). Pattern: app code depends on the `SqlClient.SqlClient` tag only; prod layer = @effect/sql-sqlite-bun, test layer = @effect/sql-sqlite-node `:memory:`. Even the Effect repo stubs out its sql-sqlite-bun tests.

Also: OpenAPI emit script now fully specified → graduated from fog to [OpenAPI spec emit script](0009-openapi-emit-script.md). tanstack-query: no canonical bridge exists; hand-rolled ManagedRuntime + runPromiseExit/Cause.squash + per-resource queryOptions/key factories is the established pattern (detail in survey §tanstack-query).
