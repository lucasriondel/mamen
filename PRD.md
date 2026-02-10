Plan: Migrate from Dexie to Bun SQLite with Hexagonal
Architecture — Turborepo Monorepo

Context

The app (mamen) is currently a pure browser SPA using Dexie
(IndexedDB) for all data storage. We're adding a Bun backend
server that:

1.  Serves the SPA static files
2.  Provides a REST API backed by bun:sqlite for all data
    operations
3.  Replaces IndexedDB entirely — data lives server-side in a
    SQLite file

The frontend will call the API instead of writing to
IndexedDB directly. A hexagonal architecture abstraction
layer lets us swap DB implementations (SQLite today, Postgres
tomorrow, etc.).

Scale: 8 tables, ~164 files importing from db, ~1,579 db
operations, 21 hooks using useLiveQuery.

---

Monorepo Migration with Turborepo

Why Monorepo

The introduction of a Bun backend alongside the existing
React SPA creates a natural multi-package boundary. A
Turborepo monorepo provides:

- **Shared types** — Entity types used by both frontend and
  server live in a dedicated package, eliminating path alias
  hacks and import fragility
- **Independent versioning** — Frontend and server packages
  have their own dependencies, avoiding conflicts (e.g. Vite
  devDependencies leaking into the server)
- **Parallel task execution** — Turborepo runs build, lint,
  test, and typecheck across packages in parallel with
  dependency-aware caching
- **Incremental builds** — Only rebuild what changed; remote
  caching optional for CI

Monorepo Structure

```
mamen/
├── turbo.json                  # Turborepo pipeline config
├── package.json                # Root: workspaces, shared devDeps
├── tsconfig.base.json          # Shared TS config (base)
├── biome.json                  # Shared lint/format config (root)
├── .gitignore
├── packages/
│   ├── shared/                 # @mamen/shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/          # Entity types (Account, Transaction, etc.)
│   │       ├── schemas/        # Zod schemas shared by client & server
│   │       └── index.ts        # Barrel export
│   ├── web/                    # @mamen/web (React SPA)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/                # Current src/ contents
│   │       ├── features/
│   │       ├── lib/
│   │       ├── hooks/
│   │       ├── routes/
│   │       ├── components/
│   │       └── ...
│   └── server/                 # @mamen/server (Bun backend)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts        # Bun.serve entry point
│           ├── router.ts       # API route dispatcher
│           ├── api/            # REST route handlers
│           ├── services/       # Business logic
│           └── lib/
│               └── repository/ # Ports + adapters
└── tooling/                    # Optional: shared configs
    ├── tsconfig/               # Shared tsconfig presets
    └── vitest/                 # Shared vitest config
```

Package Details

**@mamen/shared** (`packages/shared/`)
- Contains all entity types currently in `src/types/`
- Contains Zod schemas currently in `src/lib/schemas/`
- Zero runtime dependencies (types-only is ideal, schemas
  add zod)
- Published as internal workspace package — no npm publish
- Both `@mamen/web` and `@mamen/server` depend on it

**@mamen/web** (`packages/web/`)
- The existing React SPA, relocated from the repo root
- `package.json` contains only frontend dependencies (React,
  Vite, TanStack, shadcn, etc.)
- Imports shared types via `@mamen/shared`
- Retains its own `vite.config.ts` with dev proxy to server
- Tests run via Vitest (jsdom environment)

**@mamen/server** (`packages/server/`)
- Bun backend with REST API + SQLite
- `package.json` contains only server dependencies
  (bun:sqlite is built-in, no extra deps initially)
- Imports shared types via `@mamen/shared`
- Tests run via Vitest (or Bun's test runner)

Turborepo Configuration

turbo.json pipeline:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

Root package.json scripts:

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5"
  }
}
```

TypeScript Configuration

Root `tsconfig.base.json` defines shared compiler options:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  }
}
```

Each package extends it:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

Migration Steps (Monorepo Setup)

This is **Step 0** — done before any backend work begins.

**0a. Install Turborepo and scaffold structure** ✅
- `bun add -D turbo` at root
- Create `turbo.json`, `tsconfig.base.json`
- Create `packages/shared/`, `packages/web/`,
  `packages/server/` directories with their `package.json`
  and `tsconfig.json`

**0b. Move frontend code to packages/web/**
- Move `src/`, `public/`, `index.html`, `vite.config.ts`,
  `postcss.config.js`, `tailwind.config.ts`,
  `components.json` into `packages/web/`
- Move frontend dependencies from root `package.json` to
  `packages/web/package.json`
- Update all import paths if needed (path aliases like `@/`
  remain relative to `packages/web/src`)
- Verify `bun run --filter @mamen/web dev` works

**0c. Extract shared types to packages/shared/**
- Move `src/types/` → `packages/shared/src/types/`
- Move `src/lib/schemas/` → `packages/shared/src/schemas/`
- Add `@mamen/shared` as dependency in `packages/web/`
- Update imports: `@/types/foo` → `@mamen/shared/types/foo`
  (or barrel import from `@mamen/shared`)
- Verify build + tests still pass

**0d. Scaffold packages/server/**
- Create minimal `packages/server/src/index.ts` (hello world
  Bun.serve)
- Add dependency on `@mamen/shared`
- Verify `bun run --filter @mamen/server dev` works

**0e. Verify full pipeline**
- `bun run build` — all packages build via Turborepo
- `bun run test` — all packages test via Turborepo
- `bun run dev` — both web and server start in parallel
- CI updated if applicable

---

Architecture Overview

┌─────────────────────────────────────┐
│ React SPA (Vite) │
│ packages/web/ │
│ ┌───────────────────────────────┐ │
│ │ useReactiveQuery() hook │ │ Replaces
useLiveQuery
│ │ apiClient (fetch wrapper) │ │ Calls /api/_
endpoints
│ └───────────────────────────────┘ │
└──────────────┬──────────────────────┘
│ HTTP (fetch)
│ Dev: Vite proxy → localhost:3000
│ Prod: Bun serves /dist + /api
┌──────────────▼──────────────────────┐
│ Bun Server (bun:sqlite) │
│ packages/server/ │
│ ┌───────────────────────────────┐ │
│ │ API Routes (/api/_) │ │ REST endpoints per
table
│ │ Repository Ports (types) │ │ Abstract interfaces
│ │ SQLite Adapter (bun:sqlite) │ │ Concrete
implementation
│ └───────────────────────────────┘ │
└──────────────┬──────────────────────┘
│ imports
┌──────────────▼──────────────────────┐
│ @mamen/shared │
│ packages/shared/ │
│ Entity types + Zod schemas │
└─────────────────────────────────────┘

---

Step 1: Bun Server Scaffold

Create a minimal Bun HTTP server that serves the SPA and has
an /api route namespace. This builds on the monorepo
structure created in Step 0.

New files (in packages/server/):

- src/index.ts — Bun.serve entry point, static file serving
  + API routing
- src/router.ts — Simple route matcher for /api/\* endpoints

Modify:

- packages/server/package.json — Add "dev": "bun --watch
  src/index.ts", "start": "bun src/index.ts"
- packages/web/vite.config.ts — Add dev proxy:
  server.proxy['/api'] → http://localhost:3000

---

Step 2: Repository Port Interfaces

Define abstract types for each table's data access. One port
per table + a UnitOfWork for transactions + a DatabasePort
for lifecycle.

New files (in packages/server/src/):

- lib/repository/ports/base.port.ts — Generic
  BaseRepository<T> type
- lib/repository/ports/account.port.ts
- lib/repository/ports/transaction.port.ts — Richest
  port (date ranges, compound queries, predicate filters)
- lib/repository/ports/merchant.port.ts
- lib/repository/ports/rule.port.ts
- lib/repository/ports/setting.port.ts
- lib/repository/ports/app-settings.port.ts
- lib/repository/ports/category.port.ts
- lib/repository/ports/subscription.port.ts
- lib/repository/ports/unit-of-work.port.ts
- lib/repository/ports/database.port.ts
- lib/repository/ports/index.ts — Re-exports all ports

Base port shape:
type BaseRepository<T extends { id?: number }> = {
get: (id: number) => Promise<T | undefined>
getAll: () => Promise<T[]>
add: (record: Omit<T, 'id'>) => Promise<number>
bulkAdd: (records: Omit<T, 'id'>[]) => Promise<number[]>
update: (id: number, changes: Partial<T>) => Promise<void>
bulkPut: (records: T[]) => Promise<void>
delete: (id: number) => Promise<void>
bulkGet: (ids: number[]) => Promise<(T | undefined)[]>
count: () => Promise<number>
clear: () => Promise<void>
}

Table-specific additions (examples):

- TransactionRepository: getByAccountId,
  getByAccountIdAndMonth, getByDateRange, getByMerchantId,
  getByCategoryId, getByImportBatchId, getAllOrderedByDate,
  countByAccountId, deleteByImportBatchId, filterByPredicate,
  filterIdsByPredicate
- SettingRepository: getByKey, putByKey
- MerchantRepository: getByName, getAllOrderedByName
- CategoryRepository: getBySlug, getByParentId,
  getAllOrderedBySortOrder

---

Step 3: SQLite Adapter (bun:sqlite)

Implement each port using bun:sqlite.

New files (in packages/server/src/):

- lib/repository/adapters/sqlite/connection.ts —
  Open/create DB file, run migrations
- lib/repository/adapters/sqlite/migrations/001-initial-schema.ts
  — All CREATE TABLE + CREATE INDEX statements
- lib/repository/adapters/sqlite/account.adapter.ts
- lib/repository/adapters/sqlite/transaction.adapter.ts
- lib/repository/adapters/sqlite/merchant.adapter.ts
- lib/repository/adapters/sqlite/rule.adapter.ts
- lib/repository/adapters/sqlite/setting.adapter.ts
- lib/repository/adapters/sqlite/app-settings.adapter.ts
- lib/repository/adapters/sqlite/category.adapter.ts
- lib/repository/adapters/sqlite/subscription.adapter.ts
- lib/repository/adapters/sqlite/unit-of-work.adapter.ts
- lib/repository/adapters/sqlite/database.adapter.ts
- lib/repository/adapters/sqlite/index.ts — Factory
  that creates all repos from a single DB connection

Key implementation details:

- Dates stored as ISO strings, converted to Date on read
- JSON fields (anomalyFlags, transactionIds, llm) stored as
  TEXT, serialized/deserialized in row mappers
- Booleans stored as INTEGER (0/1)
- filterByPredicate loads all rows, filters in JS (acceptable
  for current data volumes)
- Compound index: CREATE INDEX idx_tx_account_month ON
  transactions(accountId, importMonth)

---

Step 4: REST API Routes

One route group per table, following REST conventions.
Services that currently contain business logic (rules engine,
anomaly detection, import pipeline) move to the server.

New files (in packages/server/src/):

- api/accounts.ts — CRUD: GET/POST/PUT/DELETE /api/accounts
- api/transactions.ts — CRUD + filtered queries via query
  params
- api/merchants.ts — CRUD + getByName
- api/rules.ts — CRUD + getByMerchantId
- api/settings.ts — GET/PUT by key
- api/app-settings.ts — GET/PUT singleton
- api/categories.ts — CRUD + tree operations
- api/subscriptions.ts — CRUD + getByStatus
- api/import.ts — CSV/PDF import pipeline (receives parsed
  data, runs rules engine + import)
- api/database.ts — POST /api/database/reset, POST
  /api/database/export, POST /api/database/import

Move to packages/server/src/services/ (business logic
currently in packages/web/src/features/\*/services/):

- rulesEngine.ts → services/rules-engine.ts
- anomalyDetector.ts → services/anomaly-detector.ts
- subscriptionDetector.ts →
  services/subscription-detector.ts
- csvImporter.ts (import logic, not parsing) →
  services/import.ts
- importWithRules.ts → services/import-with-rules.ts
- refundService.ts → services/refund.ts
- assignManualCategory.ts →
  services/manual-category.ts
- batchCategoryAssign.ts → services/batch-category.ts
- batchAssignMerchant.ts → services/batch-merchant.ts
- deleteTransactions.ts →
  services/delete-transactions.ts
- exportService.ts / importService.ts →
  services/data-export.ts / data-import.ts
- duplicateDetector.ts →
  services/duplicate-detector.ts

Services access repos via a singleton getDatabase() function
(no DI gymnastics).

---

Step 5: Frontend API Client

Replace all direct db.\* calls with HTTP API calls.

New files (in packages/web/src/lib/api/):

- client.ts — Base fetch wrapper with error handling, JSON
  parsing
- accounts.ts — accountsApi.getAll(), .get(id),
  .create(data), .update(id, data), .delete(id)
- transactions.ts — Same pattern + filtered query methods
- merchants.ts
- rules.ts
- settings.ts
- app-settings.ts
- categories.ts
- subscriptions.ts
- import.ts — Import pipeline calls
- database.ts — Reset, export, import
- index.ts — Re-exports all API modules

---

Step 6: Reactive Query Hook (replaces useLiveQuery)

useLiveQuery auto-rerenders when IndexedDB data changes. With
a server backend, we need a different reactivity strategy.

New files (in packages/web/src/lib/api/):

- useApiQuery.ts — React hook that fetches data and
  re-fetches on invalidation

Approach: Simple query invalidation pattern:
// Invalidation bus: Map<string, Set<() => void>>
// Each query subscribes to table keys like 'accounts',
'transactions'
// After any mutation (POST/PUT/DELETE), invalidate the
relevant table(s)
// Subscribers re-fetch their data

const useApiQuery = <T>(
queryFn: () => Promise<T>,
keys: string[], // table names to subscribe to
defaultValue?: T,
): T | undefined

Every API mutation function (create, update, delete) calls
invalidate('tableName') after success, which triggers all
useApiQuery hooks watching that table to re-fetch.

---

Step 7: Migrate All Hooks (21 hooks)

Replace useLiveQuery + db.\* with useApiQuery + API calls in
each hook. The hook signatures and return types stay
identical — only the data source changes.

Files to modify in packages/web/ (each hook swaps its
internals):

- src/hooks/useCategories.ts
- src/hooks/useMerchants.ts
- src/hooks/useUnmatchedCount.ts
- src/hooks/useCurrentMonthCount.ts
- src/hooks/useBreadcrumbs.ts
- src/features/transactions/hooks/useFilteredTransactions.ts
- src/features/subscriptions/hooks/useSubscriptions.ts
- src/features/merchants/hooks/useMerchantsList.ts
- src/features/merchants/hooks/useMerchantDetail.ts
- src/features/merchants/hooks/useExistingMerchant.ts
- src/features/dashboard/hooks/useNetSpending.ts
- src/features/dashboard/hooks/useSpendingBreakdown.ts
- src/features/dashboard/hooks/useSpendingComparison.ts
- src/features/dashboard/hooks/useCategoryTooltipData.ts
- src/features/anomalies/hooks/useAnomalies.ts
- src/features/search/hooks/useTransactionSearch.ts
- src/features/rules/hooks/useRuleMatchPreview.ts
- src/features/settings/hooks/useSettings.ts
- src/features/settings/hooks/useDisplayPreferences.ts
- src/features/import/hooks/useAccountMonthData.ts
- src/features/categories/hooks/useCategoryTree.ts

---

Step 8: Migrate All Service Call Sites

Components and pages that call service functions (which
currently hit db directly) need to call the API client
instead.

Key files to modify (~30-40 files across features):

- All components calling import services → call importApi.\*
- All components calling rule operations → call rulesApi.\*
- All components calling merchant batch operations → call
  merchantsApi.\*
- All components calling transaction operations → call
  transactionsApi.\*
- Settings components → call settingsApi.\*
- ClearDataDialog → call databaseApi.reset()
- Export/Import data → call databaseApi.export() /
  databaseApi.import()
- Category mutations → call categoriesApi.\*
- Anomaly actions (dismiss, detect) → call transactionsApi.\*
  or dedicated endpoint

---

Step 9: Cleanup

Remove from packages/web/:

- dexie and dexie-react-hooks from package.json dependencies
- fake-indexeddb from devDependencies
- src/lib/db/schema.ts (Dexie schema)
- All old service files in src/features/\*/services/ that
  moved to the server
- import 'fake-indexeddb/auto' from src/test/setup.ts

Update in packages/web/:

- src/lib/db/index.ts → Re-export from src/lib/api/ for
  backward compat (or remove and update all imports)
- src/test/setup.ts → No more fake-indexeddb

---

Step 10: Update Tests

Server-side tests (new):

- Test repository adapters against real bun:sqlite (in-memory
  mode)
- Test API routes with Bun's test runner or vitest
- Test services with real DB

Frontend tests (modified):

- Mock API calls instead of using fake-indexeddb
- Use vi.mock('@/lib/api/...') or MSW (Mock Service Worker)
  for HTTP mocking
- Hook tests use mocked API responses

---

Shared Types

Entity types live in `@mamen/shared` (`packages/shared/`).
Both `@mamen/web` and `@mamen/server` declare it as a
workspace dependency and import types directly:

```ts
import type { Account, Transaction } from '@mamen/shared'
```

This was established in Step 0c of the monorepo migration.

---

File Structure Summary

```
mamen/
├── turbo.json
├── package.json                    # Root workspaces config
├── tsconfig.base.json
├── biome.json
│
├── packages/shared/                # @mamen/shared
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types/                  # Entity types
│       ├── schemas/                # Zod schemas
│       └── index.ts
│
├── packages/web/                   # @mamen/web
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── features/
│       ├── hooks/
│       ├── routes/
│       ├── components/
│       └── lib/
│           ├── api/                # Frontend API client
│           │   ├── client.ts
│           │   ├── accounts.ts
│           │   ├── transactions.ts
│           │   ├── merchants.ts
│           │   ├── rules.ts
│           │   ├── settings.ts
│           │   ├── app-settings.ts
│           │   ├── categories.ts
│           │   ├── subscriptions.ts
│           │   ├── import.ts
│           │   ├── database.ts
│           │   ├── useApiQuery.ts
│           │   ├── invalidation.ts
│           │   └── index.ts
│           └── ...
│
└── packages/server/                # @mamen/server
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                # Bun.serve entry point
        ├── router.ts               # API route dispatcher
        ├── api/
        │   ├── accounts.ts
        │   ├── transactions.ts
        │   ├── merchants.ts
        │   ├── rules.ts
        │   ├── settings.ts
        │   ├── app-settings.ts
        │   ├── categories.ts
        │   ├── subscriptions.ts
        │   ├── import.ts
        │   └── database.ts
        ├── services/               # Business logic
        │   ├── rules-engine.ts
        │   ├── anomaly-detector.ts
        │   ├── subscription-detector.ts
        │   ├── import-with-rules.ts
        │   ├── refund.ts
        │   ├── manual-category.ts
        │   ├── batch-category.ts
        │   ├── batch-merchant.ts
        │   ├── delete-transactions.ts
        │   ├── data-export.ts
        │   ├── data-import.ts
        │   └── duplicate-detector.ts
        └── lib/
            └── repository/
                ├── ports/          # Abstract interfaces
                │   ├── base.port.ts
                │   ├── account.port.ts
                │   ├── transaction.port.ts
                │   ├── merchant.port.ts
                │   ├── rule.port.ts
                │   ├── setting.port.ts
                │   ├── app-settings.port.ts
                │   ├── category.port.ts
                │   ├── subscription.port.ts
                │   ├── unit-of-work.port.ts
                │   ├── database.port.ts
                │   └── index.ts
                ├── adapters/
                │   └── sqlite/     # bun:sqlite implementation
                │       ├── connection.ts
                │       ├── migrations/
                │       │   └── 001-initial-schema.ts
                │       ├── account.adapter.ts
                │       ├── transaction.adapter.ts
                │       ├── merchant.adapter.ts
                │       ├── rule.adapter.ts
                │       ├── setting.adapter.ts
                │       ├── app-settings.adapter.ts
                │       ├── category.adapter.ts
                │       ├── subscription.adapter.ts
                │       ├── unit-of-work.adapter.ts
                │       ├── database.adapter.ts
                │       └── index.ts
                └── index.ts        # getDatabase() singleton
```

---

Verification Plan

1.  Monorepo works: `bun run build` from root builds all
    packages via Turborepo
2.  Server starts: `bun run --filter @mamen/server dev` →
    listening on port 3000
3.  API smoke test: curl http://localhost:3000/api/accounts
    returns []
4.  Dev proxy works: `bun run dev` from root → both web
    and server start, /api/\* proxied to Bun server
5.  CRUD works: Create account via UI → appears in SQLite →
    returned by GET
6.  Import pipeline: CSV import → server processes rules +
    anomalies → transactions appear
7.  Reactivity: Create a transaction → dashboard updates
    automatically
8.  Full test suite: `bun run test` from root passes all
    packages (frontend tests with mocked API)
9.  Server tests: `bun run --filter @mamen/server test`
    passes (repo + API tests with in-memory SQLite)
10. Shared package: `@mamen/shared` builds and types are
    consumed correctly by both web and server
