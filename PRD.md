# Migrate Server from Bun.serve to Fastify + Add API Tests

## Context

The server currently uses a raw `Bun.serve` entry point with a hand-rolled router (`src/router.ts`, 87 lines) and side-effect route registration. There are 50+ API routes across 9 domain modules but zero tests. Migrating to Fastify provides a mature framework with built-in `app.inject()` for testing, plugin-based route organization, and proper content-type parsing — while keeping Bun as the runtime.

## Strategy

- **`buildApp()` factory pattern**: A function that creates and returns a configured Fastify instance without calling `listen()`. Production calls `buildApp() → app.listen()`, tests call `buildApp() → app.inject()`.
- **Database injection via `app.decorate('db', db)`**: Tests inject an in-memory SQLite DB, production uses the real singleton.
- **Mechanical route conversion**: Each route module becomes a Fastify plugin. The transformation is formulaic (documented below).
- **Repository layer untouched**: No changes to `src/lib/repository/`.

## New File Structure

```
packages/server/
  src/
    app.ts                              # NEW - buildApp() factory
    index.ts                            # REWRITE - slim entry: buildApp() + listen()
    plugins/
      date-parser.ts                    # NEW - JSON content-type parser with dateReviver
      static-files.ts                   # NEW - @fastify/static + SPA fallback
    routes/
      health.ts                         # NEW (was inline in old index.ts)
      accounts.ts                       # REWRITE from src/api/accounts.ts
      transactions.ts                   # REWRITE from src/api/transactions.ts
      merchants.ts                      # REWRITE from src/api/merchants.ts
      categories.ts                     # REWRITE from src/api/categories.ts
      rules.ts                          # REWRITE from src/api/rules.ts
      subscriptions.ts                  # REWRITE from src/api/subscriptions.ts
      settings.ts                       # REWRITE from src/api/settings.ts
      app-settings.ts                   # REWRITE from src/api/app-settings.ts
      database.ts                       # REWRITE from src/api/database.ts
    lib/repository/                     # UNCHANGED
  src/__tests__/
    helpers/
      test-app.ts                       # NEW - createTestApp() with in-memory DB
    routes/
      health.test.ts                    # NEW
      accounts.test.ts                  # NEW
      transactions.test.ts              # NEW
      merchants.test.ts                 # NEW
      categories.test.ts               # NEW
      rules.test.ts                     # NEW
      subscriptions.test.ts             # NEW
      settings.test.ts                  # NEW
      app-settings.test.ts              # NEW
      database.test.ts                  # NEW
  vitest.config.ts                      # NEW
  package.json                          # MODIFIED
```

**Deleted**: `src/router.ts`, `src/api/` (entire directory — 12 files)

## Implementation Steps

### Step 1: Add dependencies ✅
```
bun add fastify fastify-plugin @fastify/static
```
Update `packages/server/package.json`.

### Step 2: Create core infrastructure ✅
- `src/app.ts` — `buildApp({ db?, staticDir? })` factory
  - `app.decorate('db', db)` with TypeScript module augmentation
  - Register `dateParserPlugin`, all route plugins under `/api` prefix
  - Global error handler
- `src/plugins/date-parser.ts` — Custom `application/json` parser with `dateReviver` (replaces `parseBody`)
  - Use `fastify-plugin` to break scope encapsulation
- `src/plugins/static-files.ts` — `@fastify/static` + SPA fallback via `setNotFoundHandler`

### Step 3: Convert route modules (one at a time) ✅

Each old route file (`src/api/*.ts`) → new Fastify plugin (`src/routes/*.ts`).

**Conversion recipe per handler:**
| Old pattern | New pattern |
|---|---|
| `router.get('/api/X', handler)` | `fastify.get('/X', handler)` (prefix added by parent) |
| `await parseBody<T>(req)` | `request.body` (auto-parsed by date-parser plugin) |
| `return jsonResponse(data)` | `return data` |
| `return jsonResponse(data, 201)` | `return reply.status(201).send(data)` |
| `return errorResponse(msg, code)` | `return reply.status(code).send({ error: msg })` |
| `searchParams.get('x')` | `request.query.x` |
| `params.id` | `request.params.id` |
| `getDatabase()` | `fastify.db` |
| `parseId(x)` | `const id = Number(x); if (Number.isNaN(id)) ...` |

**Order**: health → accounts → settings → app-settings → merchants → rules → categories → subscriptions → transactions → database

### Step 4: Rewrite `src/index.ts` ✅
```typescript
import { join } from 'path'
import { buildApp } from './app'

const PORT = Number(process.env.PORT) || 3000
const STATIC_DIR = join(import.meta.dir, '../../web/dist')

const app = buildApp({ staticDir: STATIC_DIR })
app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) { console.error(err); process.exit(1) }
  console.log(`@mamen/server listening on ${address}`)
})
```

### Step 5: Delete old files
- `src/router.ts`
- `src/api/` (entire directory)

### Step 6: Create test infrastructure
- `vitest.config.ts` — default node environment
- `src/__tests__/helpers/test-app.ts`:
  ```typescript
  const connection = getInMemoryConnection()
  const db = createDatabase(connection)
  const app = buildApp({ db })
  await app.ready()
  return app
  ```

### Step 7: Write API tests

One test file per route module, using `app.inject()`. Each test file gets a fresh in-memory DB via `createTestApp()` in `beforeEach`.

**Test cases per entity (key ones):**
- **Health**: GET returns `{ status: 'ok' }`
- **Accounts** (~10): empty list, create → 201, get by id, get by name, get by type, update, delete, invalid id → 400, not found → 404
- **Transactions** (~15): create, bulk create, get with filters (accountId, importMonth, merchantId, categoryId, dateRange, orderBy), count, bulk-get, update, bulk-put, delete, bulk-delete, delete by account-month, delete by import-batch
- **Merchants** (~8): CRUD, by-name, by-name-ci, ordered, bulk-put
- **Categories** (~10): CRUD, root, by-slug, by-parent, bulk-add, bulk-put, clear
- **Rules** (~8): CRUD, by-merchant, by-merchant-pattern, count, bulk-add, bulk-delete
- **Subscriptions** (~9): CRUD, by-merchant, first-by-merchant, by-merchant-frequency, by-status, bulk-put, clear
- **Settings** (~5): CRUD, by-key, put-by-key, clear
- **App Settings** (~3): get (empty), put, clear
- **Database** (~3): reset, export, import round-trip

## Key Files to Modify/Reference
- `packages/server/package.json` — add deps
- `packages/server/src/index.ts` — full rewrite
- `packages/server/src/api/transactions.ts` — most complex route (156 lines, reference for conversion)
- `packages/server/src/api/database.ts` — import/export logic (106 lines)
- `packages/server/src/lib/repository/index.ts` — `getDatabase`, `resetDatabase` (unchanged, but used by app.ts)
- `packages/server/src/lib/repository/adapters/sqlite/connection.ts` — `getInMemoryConnection` (used by test helper)
- `packages/server/src/lib/repository/adapters/sqlite/index.ts` — `createDatabase`, `DatabaseInstance` type (used by app.ts type augmentation)

## Verification
1. `bun run dev` from root — confirm frontend + API works end-to-end unchanged
2. `bun run test` in `packages/server/` — all API tests pass
3. `bun run typecheck` — no type errors
4. Manual smoke test: create account, import transactions, verify data round-trip
