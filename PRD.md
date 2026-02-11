# PRD: Extract API SDK into `@mamen/api` package

## Context

The web frontend has a hand-written API layer in `packages/web/src/lib/api/` with ~10 entity modules (merchants, transactions, accounts, etc.), a fetch client, query keys, query client config, and cache invalidation helpers. This is tightly coupled to the web package. We want to:

1. Extract it into a standalone `@mamen/api` package usable by any consumer
2. Include TanStack Query helpers (queryOptions/mutationOptions) via a runtime factory
3. Keep backward compatibility — re-export from web so existing imports still work

## Phase 1: Create `packages/api/` package ✅

### 1.1 Package scaffolding

Create `packages/api/` with:
```
packages/api/
├── package.json          # @mamen/api, deps: @mamen/shared, @tanstack/react-query (peer)
├── tsconfig.json
└── src/
    ├── index.ts          # Barrel exports
    ├── client.ts         # Moved from web (fetch wrapper, ApiError, dateReviver)
    ├── accounts.ts       # Moved entity modules (updated import paths)
    ├── merchants.ts
    ├── transactions.ts
    ├── categories.ts
    ├── rules.ts
    ├── subscriptions.ts
    ├── settings.ts
    ├── app-settings.ts
    ├── database.ts
    ├── import.ts
    ├── queryKeys.ts      # Moved from web
    ├── queryClient.ts    # Moved from web
    ├── mutations.ts      # Moved from web (invalidateEntity, invalidateAll)
    └── query/
        ├── factory.ts    # Runtime factory: createQueryHelpers()
        ├── accounts.ts   # Entity query/mutation options configs
        ├── merchants.ts
        ├── transactions.ts
        ├── categories.ts
        ├── rules.ts
        ├── subscriptions.ts
        ├── settings.ts
        ├── app-settings.ts
        ├── database.ts
        ├── import.ts
        └── index.ts      # Barrel for query helpers
```

**`package.json`:**
```json
{
  "name": "@mamen/api",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "dependencies": {
    "@mamen/shared": "workspace:*"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0"
  }
}
```

`@tanstack/react-query` is a **peer dep** since the consumer (web) already has it.

### 1.2 Move files from web → api

- `packages/web/src/lib/api/client.ts` → `packages/api/src/client.ts` (unchanged)
- `packages/web/src/lib/api/accounts.ts` → `packages/api/src/accounts.ts` (update `./client` import)
- Same for all other entity files: merchants, transactions, categories, rules, subscriptions, settings, app-settings, database, import
- `packages/web/src/lib/api/queryKeys.ts` → `packages/api/src/queryKeys.ts`
- `packages/web/src/lib/api/queryClient.ts` → `packages/api/src/queryClient.ts`
- `packages/web/src/lib/api/mutations.ts` → `packages/api/src/mutations.ts`

### 1.3 `packages/api/src/index.ts` barrel

```typescript
// Client
export { api, ApiError } from "./client";

// Entity APIs
export { accountsApi } from "./accounts";
export { appSettingsApi } from "./app-settings";
export { categoriesApi } from "./categories";
export { databaseApi } from "./database";
export { importApi } from "./import";
export { merchantsApi } from "./merchants";
export { rulesApi } from "./rules";
export { settingsApi } from "./settings";
export { subscriptionsApi } from "./subscriptions";
export { transactionsApi } from "./transactions";

// React Query
export { queryKeys } from "./queryKeys";
export { queryClient } from "./queryClient";
export { invalidateEntity, invalidateAll } from "./mutations";

// Query helpers
export * from "./query";
```

## Phase 2: Runtime query helper factory ✅

### 2.1 `packages/api/src/query/factory.ts`

A `queryOptions()` / `mutationOptions()` factory that takes an entity API + key config and returns typed options objects.

```typescript
import type { QueryKey } from "@tanstack/react-query";
import type { queryKeys } from "../queryKeys";
import { invalidateEntity } from "../mutations";

type EntityName = keyof typeof queryKeys;

type QueryDef<TArgs extends unknown[], TData> = {
  queryKey: (...args: TArgs) => QueryKey;
  queryFn: (...args: TArgs) => Promise<TData>;
};

type MutationDef<TVariables, TData> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidates?: EntityName[];
};

export const defineQueries = <T extends Record<string, QueryDef<any[], any>>>(queries: T) => {
  const result = {} as {
    [K in keyof T]: T[K] extends QueryDef<infer TArgs, infer TData>
      ? (...args: TArgs) => { queryKey: QueryKey; queryFn: () => Promise<TData> }
      : never;
  };
  for (const [name, def] of Object.entries(queries)) {
    (result as any)[name] = (...args: any[]) => ({
      queryKey: def.queryKey(...args),
      queryFn: () => def.queryFn(...args),
    });
  }
  return result;
};

export const defineMutations = <T extends Record<string, MutationDef<any, any>>>(mutations: T) => {
  const result = {} as {
    [K in keyof T]: T[K] extends MutationDef<infer TVars, infer TData>
      ? () => { mutationFn: (variables: TVars) => Promise<TData>; onSuccess: () => void }
      : never;
  };
  for (const [name, def] of Object.entries(mutations)) {
    (result as any)[name] = () => ({
      mutationFn: def.mutationFn,
      onSuccess: () => {
        if (def.invalidates) {
          invalidateEntity(...def.invalidates);
        }
      },
    });
  }
  return result;
};
```

### 2.2 Example entity config: `packages/api/src/query/merchants.ts`

```typescript
import type { Merchant } from "@mamen/shared";
import { merchantsApi } from "../merchants";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const merchantQueries = defineQueries({
  list: {
    queryKey: (params?: { orderBy?: "name" }) => queryKeys.merchants.list(params),
    queryFn: (params?: { orderBy?: "name" }) => merchantsApi.getAll(params),
  },
  detail: {
    queryKey: (id: number) => queryKeys.merchants.detail(id),
    queryFn: (id: number) => merchantsApi.get(id),
  },
  byName: {
    queryKey: (name: string) => ["merchants", "by-name", name] as const,
    queryFn: (name: string) => merchantsApi.getByName(name),
  },
  byNameCaseInsensitive: {
    queryKey: (name: string) => ["merchants", "by-name-ci", name] as const,
    queryFn: (name: string) => merchantsApi.getByNameCaseInsensitive(name),
  },
});

export const merchantMutations = defineMutations({
  create: {
    mutationFn: (data: Omit<Merchant, "id">) => merchantsApi.create(data),
    invalidates: ["merchants"],
  },
  update: {
    mutationFn: (vars: { id: number; changes: Partial<Merchant> }) =>
      merchantsApi.update(vars.id, vars.changes),
    invalidates: ["merchants"],
  },
  remove: {
    mutationFn: (id: number) => merchantsApi.delete(id),
    invalidates: ["merchants"],
  },
  bulkPut: {
    mutationFn: (records: Merchant[]) => merchantsApi.bulkPut(records),
    invalidates: ["merchants"],
  },
  uploadImage: {
    mutationFn: (vars: { id: number; file: File }) =>
      merchantsApi.uploadImage(vars.id, vars.file),
    invalidates: ["merchants"],
  },
  deleteImage: {
    mutationFn: (id: number) => merchantsApi.deleteImage(id),
    invalidates: ["merchants"],
  },
});
```

Same pattern for all other entities.

### 2.3 Usage after migration (example)

```typescript
// Before
const { data } = useQuery({
  queryKey: queryKeys.merchants.list(),
  queryFn: () => merchantsApi.getAll(),
});

// After
const { data } = useQuery(merchantQueries.list());

// Before (mutation)
const handleSave = async () => {
  await merchantsApi.update(id, changes);
  invalidateEntity("merchants");
};

// After
const update = useMutation(merchantMutations.update());
const handleSave = () => update.mutate({ id, changes });
```

## Phase 3: Update web package ✅

### 3.1 Add dependency

`packages/web/package.json`: add `"@mamen/api": "workspace:*"`

### 3.2 Replace `packages/web/src/lib/api/` contents

Delete all moved files. Replace `index.ts` with a re-export:

```typescript
// Re-export everything from @mamen/api for backward compatibility
export {
  api,
  ApiError,
  accountsApi,
  appSettingsApi,
  categoriesApi,
  databaseApi,
  importApi,
  merchantsApi,
  rulesApi,
  settingsApi,
  subscriptionsApi,
  transactionsApi,
  queryKeys,
  queryClient,
  invalidateEntity,
  invalidateAll,
  // Query helpers
  merchantQueries,
  merchantMutations,
  accountQueries,
  accountMutations,
  // ... all other entity queries/mutations
} from "@mamen/api";
```

This means **zero changes** to any existing `import { ... } from "@/lib/api"` across the frontend.

### 3.3 Remove `@tanstack/react-query` from web's deps?

No — web still uses it directly for `useQuery`, `useMutation`, `QueryClientProvider` etc. The package just becomes a peer dep of `@mamen/api` too.

## Files to create/modify

| Action | File |
|--------|------|
| Create | `packages/api/package.json` |
| Create | `packages/api/tsconfig.json` |
| Create | `packages/api/src/index.ts` |
| Move   | `client.ts` → `packages/api/src/client.ts` |
| Move   | `accounts.ts` → `packages/api/src/accounts.ts` |
| Move   | `merchants.ts` → `packages/api/src/merchants.ts` |
| Move   | `transactions.ts` → `packages/api/src/transactions.ts` |
| Move   | `categories.ts` → `packages/api/src/categories.ts` |
| Move   | `rules.ts` → `packages/api/src/rules.ts` |
| Move   | `subscriptions.ts` → `packages/api/src/subscriptions.ts` |
| Move   | `settings.ts` → `packages/api/src/settings.ts` |
| Move   | `app-settings.ts` → `packages/api/src/app-settings.ts` |
| Move   | `database.ts` → `packages/api/src/database.ts` |
| Move   | `import.ts` → `packages/api/src/import.ts` |
| Move   | `queryKeys.ts` → `packages/api/src/queryKeys.ts` |
| Move   | `queryClient.ts` → `packages/api/src/queryClient.ts` |
| Move   | `mutations.ts` → `packages/api/src/mutations.ts` |
| Create | `packages/api/src/query/factory.ts` |
| Create | `packages/api/src/query/merchants.ts` (+ all other entities) |
| Create | `packages/api/src/query/index.ts` |
| Edit   | `packages/web/package.json` (add @mamen/api dep) |
| Edit   | `packages/web/src/lib/api/index.ts` (re-export from @mamen/api) |
| Delete | All moved files from `packages/web/src/lib/api/` |

## Verification ✅

1. ✅ `bun install` — workspace resolves @mamen/api
2. ✅ `bun run typecheck` — all 5 packages pass type checking
3. ⬜ `bun run dev` — app starts, API calls work as before (manual)
4. ✅ `bun run test` — all 141 test files, 1432 tests pass
5. ⬜ Manually verify one query helper works: add `useQuery(merchantQueries.list())` in a component
