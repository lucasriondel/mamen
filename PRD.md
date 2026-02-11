╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
Plan: Replace custom useApiQuery with TanStack Query

Context

The frontend already calls the server API via fetch (no more Dexie in production code). However, it uses a custom
useApiQuery hook + pub/sub invalidation system for caching/reactivity. This custom system lacks: proper cache deduplication,
background refetching, optimistic updates, loading/error states per query, stale-while-revalidate, and devtools. TanStack
Query provides all of this out of the box and will make the app feel faster through aggressive caching and optimistic
updates.

Scope

- ~35 files with useApiQuery calls (hooks + components)
- ~10 files in lib/api/ (entity API modules that call invalidate())
- 1 file lib/api/invalidation.ts + useApiQuery.ts (to be deleted)
- 1 file test/api-mock-setup.ts (to be updated)
- ~75 test files (incremental fixes as they break)

Step 1: Install TanStack Query ✅

cd packages/web && bun add @tanstack/react-query

Optionally add @tanstack/react-query-devtools for dev.

Step 2: Create QueryClient provider ✅

New file: packages/web/src/lib/api/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
defaultOptions: {
queries: {
staleTime: 30_000, // 30s - data considered fresh
gcTime: 5 \* 60_000, // 5min - garbage collect unused
refetchOnWindowFocus: false, // personal app, no multi-user
retry: 1,
},
},
})

Modify: packages/web/src/main.tsx

- Wrap <RouterProvider> with <QueryClientProvider client={queryClient}>
- Optionally add <ReactQueryDevtools> in dev mode

Step 3: Create query key factory + query options ✅

New file: packages/web/src/lib/api/queryKeys.ts

Define a structured query key factory for type-safe, consistent keys:

export const queryKeys = {
accounts: {
all: ['accounts'] as const,
detail: (id: number) => ['accounts', id] as const,
},
transactions: {
all: ['transactions'] as const,
list: (params: TransactionQueryParams) => ['transactions', 'list', params] as const,
detail: (id: number) => ['transactions', id] as const,
count: (params?: object) => ['transactions', 'count', params] as const,
},
merchants: {
all: ['merchants'] as const,
list: (params?: object) => ['merchants', 'list', params] as const,
detail: (id: number) => ['merchants', id] as const,
},
rules: {
all: ['rules'] as const,
list: (params?: object) => ['rules', 'list', params] as const,
detail: (id: number) => ['rules', id] as const,
count: (params?: object) => ['rules', 'count', params] as const,
},
categories: {
all: ['categories'] as const,
list: (params?: object) => ['categories', 'list', params] as const,
detail: (id: number) => ['categories', id] as const,
},
subscriptions: {
all: ['subscriptions'] as const,
list: (params?: object) => ['subscriptions', 'list', params] as const,
detail: (id: number) => ['subscriptions', id] as const,
},
settings: {
all: ['settings'] as const,
},
appSettings: {
all: ['appSettings'] as const,
},
}

This hierarchical structure allows queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }) to invalidate ALL
transaction queries (lists, details, counts).

Step 4: Remove invalidate() from API modules

Modify each entity API file (accounts.ts, transactions.ts, etc.):

- Remove import { invalidate } from './invalidation'
- Remove all invalidate('xxx') calls from mutation methods
- The API modules become pure fetch wrappers again - invalidation moves to TanStack Query mutations

Files to modify:

- packages/web/src/lib/api/accounts.ts
- packages/web/src/lib/api/transactions.ts
- packages/web/src/lib/api/merchants.ts
- packages/web/src/lib/api/rules.ts
- packages/web/src/lib/api/categories.ts
- packages/web/src/lib/api/subscriptions.ts
- packages/web/src/lib/api/settings.ts
- packages/web/src/lib/api/app-settings.ts
- packages/web/src/lib/api/import.ts
- packages/web/src/lib/api/database.ts

Step 5: Delete old invalidation + useApiQuery

Delete:

- packages/web/src/lib/api/invalidation.ts
- packages/web/src/lib/api/useApiQuery.ts

Modify: packages/web/src/lib/api/index.ts

- Remove export { invalidate, subscribe } and export { useApiQuery }
- Add export { queryKeys } from './queryKeys'
- Add export { queryClient } from './queryClient'

Step 6: Migrate all useApiQuery consumers to useQuery

Replace every useApiQuery(queryFn, keys, defaultValue) call with TanStack Query's useQuery. There are ~35 consumer files
split into these patterns:

Pattern A: Simple queries (most hooks)

Example - packages/web/src/hooks/useCategories.ts:
// Before
const categories = useApiQuery(
() => categoriesApi.getAll({ orderBy: 'sortOrder' }),
['categories'],
[] as Category[],
) ?? [] as Category[]

// After
const { data: categories = [] } = useQuery({
queryKey: queryKeys.categories.list({ orderBy: 'sortOrder' }),
queryFn: () => categoriesApi.getAll({ orderBy: 'sortOrder' }),
})

Pattern B: Parameterized queries

Example - packages/web/src/features/transactions/hooks/useFilteredTransactions.ts:
// After
const { data: transactions = [] } = useQuery({
queryKey: queryKeys.transactions.list({ accountId, startDate, endDate }),
queryFn: () => transactionsApi.getAll({ accountId, startDate, endDate, orderBy: 'date', direction: 'desc' }),
})

Pattern C: Composed multi-fetch queries

Example - packages/web/src/features/merchants/hooks/useMerchantDetail.ts:

Keep as a single useQuery with the composed queryFn. The key should include all entity types it depends on:
const { data, isLoading } = useQuery({
queryKey: ['merchantDetail', merchantId],
queryFn: async () => {
const merchant = await merchantsApi.get(merchantId)
// ... rest of composition logic
},
})

For invalidation, these composed queries will be invalidated via a custom helper that invalidates all related keys when any
entity changes. See Step 7.

Pattern D: Conditional queries

// After
const { data: merchant } = useQuery({
queryKey: queryKeys.merchants.detail(merchantId!),
queryFn: () => merchantsApi.get(merchantId!),
enabled: merchantId != null,
})

Pattern E: Count queries (Sidebar, etc.)

const { data: merchantCount = 0 } = useQuery({
queryKey: [...queryKeys.merchants.all, 'count'],
queryFn: () => merchantsApi.getAll().then(m => m.length),
})

Full list of files to migrate:

Hooks in packages/web/src/hooks/:

- useCategories.ts (Pattern A)
- useMerchants.ts (Pattern A)
- useUnmatchedCount.ts (Pattern A + derived count)
- useCurrentMonthCount.ts (Pattern B)
- useBreadcrumbs.ts (Pattern D x2)

Feature hooks:

- features/categories/hooks/useCategoryTree.ts (Pattern A)
- features/transactions/hooks/useFilteredTransactions.ts (Pattern B)
- features/transactions/hooks/useQuickCategoryAssign.ts (no query, mutations only - skip)
- features/rules/hooks/useRuleMatchPreview.ts (Pattern B)
- features/rules/hooks/useRulesEngine.ts (no query, mutations only - skip)
- features/merchants/hooks/useMerchantDetail.ts (Pattern C)
- features/merchants/hooks/useMerchantsList.ts (Pattern C)
- features/merchants/hooks/useExistingMerchant.ts (Pattern C)
- features/subscriptions/hooks/useSubscriptions.ts (Pattern A)
- features/anomalies/hooks/useAnomalies.ts (Pattern A)
- features/dashboard/hooks/useNetSpending.ts (Pattern C)
- features/dashboard/hooks/useSpendingComparison.ts (Pattern B)
- features/dashboard/hooks/useSpendingBreakdown.ts (Pattern C)
- features/dashboard/hooks/useCategoryTooltipData.ts (Pattern C)
- features/settings/hooks/useSettings.ts (Pattern A)
- features/settings/hooks/useDisplayPreferences.ts (Pattern A)
- features/search/hooks/useTransactionSearch.ts (Pattern A)
- features/import/hooks/useAccountMonthData.ts (Pattern B)

Components with inline useApiQuery:

- routes/accounts.tsx (Pattern A)
- components/Layout/Sidebar.tsx (Pattern E x3)
- components/MatchPreviewList/index.tsx (Pattern B)
- features/dev/DbTestPanel/index.tsx (Pattern A)
- features/anomalies/components/AnomalySettingsForm/index.tsx (Pattern A)
- features/rules/components/RulesListByMerchant/index.tsx (Pattern C)
- features/rules/components/RulesPage/index.tsx (Pattern A)
- features/rules/components/RuleEditModal/index.tsx (Pattern D)
- features/transactions/components/RefundLinkModal/index.tsx (Pattern D)
- features/transactions/components/TransactionDataTable/index.tsx (Pattern A + C)
- features/subscriptions/components/SubscriptionDetail/index.tsx (Pattern B)
- features/dashboard/components/DashboardPage/index.tsx (Pattern A)
- features/settings/components/DataManagementSection/index.tsx (Pattern C)
- features/accounts/components/AccountCard/index.tsx (Pattern B)
- features/merchants/components/MerchantSearchSelect/index.tsx (Pattern C)
- features/merchants/components/MerchantRulesList/index.tsx (Pattern B)

Step 7: Add invalidation helpers for mutations

New file: packages/web/src/lib/api/mutations.ts

Create invalidation helpers that mutation hooks/services can import:

import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'

// Invalidate all queries related to an entity
export const invalidateEntity = (...entities: (keyof typeof queryKeys)[]) => {
for (const entity of entities) {
queryClient.invalidateQueries({ queryKey: queryKeys[entity].all })
}
// Also invalidate composed queries that span entities
invalidateComposedQueries(entities)
}

const composedQueryPrefixes = [
'merchantDetail',
'merchantsList',
'spendingBreakdown',
'netSpending',
'categoryTooltip',
'spendingComparison',
] as const

const invalidateComposedQueries = (entities: (keyof typeof queryKeys)[]) => {
// Composed queries that reference these entities need manual invalidation
// since their keys don't start with entity prefixes
for (const prefix of composedQueryPrefixes) {
queryClient.invalidateQueries({ queryKey: [prefix] })
}
}

Then update mutation hooks and service files to call invalidateEntity('transactions') after mutations, replacing the old
invalidate() system. The API modules stay clean (no invalidation logic), and the mutation call-sites handle cache
management.

Key mutation files that need invalidateEntity calls:

- features/rules/hooks/useRuleMutations.ts - after rule CRUD
- features/transactions/hooks/useQuickCategoryAssign.ts - after category assign
- features/rules/services/ruleOperations.ts - after rule update/delete
- features/transactions/services/assignManualCategory.ts - after category assign
- features/transactions/services/deleteTransactions.ts - after bulk delete
- features/merchants/services/batchAssignMerchant.ts - after merchant assign
- features/transactions/services/batchCategoryAssign.ts - after batch category
- features/rules/services/addRuleToMerchant.ts - after rule add
- features/categories/hooks/useCategoryMutations.ts - after category CRUD
- features/settings/services/importService.ts - after data import
- features/settings/services/exportService.ts - read-only, no change
- features/subscriptions/services/subscriptionDetector.ts - after subscription CRUD
- features/anomalies/services/anomalyDetector.ts - read-only, no change
- features/import/services/importWithRules.ts - after import

Step 8: Add optimistic updates for key interactions

For the most latency-sensitive operations, add optimistic updates:

1.  Quick category assign (useQuickCategoryAssign.ts): Optimistically update the transaction's category in cache before the
    API call completes. On error, roll back.
2.  Transaction delete (deleteTransactions.ts): Optimistically remove transactions from cache.
3.  Rule delete (useRuleMutations.ts / ruleOperations.ts): Optimistically remove rule from the rules list cache.

Pattern for optimistic updates:
// Snapshot previous data
const previousTxs = queryClient.getQueryData(queryKeys.transactions.list(...))
// Optimistically update
queryClient.setQueryData(queryKeys.transactions.list(...), (old) =>
old?.map(tx => tx.id === id ? { ...tx, categoryId } : tx)
)
// On error, restore
queryClient.setQueryData(queryKeys.transactions.list(...), previousTxs)

Step 9: Update test infrastructure

Modify: packages/web/src/test/api-mock-setup.ts

Major changes:

1.  Remove the useApiQuery mock - no longer needed (real useQuery will be used)
2.  Remove the invalidation mock - no longer needed
3.  Keep all entity API mocks (accountsApi, transactionsApi, etc.) - they still use the in-memory db
4.  Add a test QueryClient and wrapper:

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export const createTestQueryClient = () => new QueryClient({
defaultOptions: {
queries: { retry: false, gcTime: 0, staleTime: 0 },
mutations: { retry: false },
},
})

export const createTestWrapper = () => {
const queryClient = createTestQueryClient()
return ({ children }) => (
<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)
}

5.  Update the barrel mock (vi.mock('@/lib/api', ...)) to no longer re-export useApiQuery/invalidate, and instead export
    queryKeys and queryClient.

Modify: packages/web/src/test/setup.ts (if needed)

- Ensure test wrapper is available globally or per-test

Fix test files incrementally:

- Tests that render components need to wrap in createTestWrapper()
- Tests that use renderHook need wrapper: createTestWrapper()
- Tests that call mutations and check data need await waitFor() for cache updates
- ~75 test files will need the wrapper, but the pattern is mechanical

Step 10: Cleanup

- Delete packages/web/src/lib/api/invalidation.ts
- Delete packages/web/src/lib/api/useApiQuery.ts
- Update packages/web/src/lib/api/index.ts barrel exports
- Remove any remaining import { invalidate } or import { useApiQuery } references
- Run bun run typecheck to catch any remaining import issues

Execution Order

We'll work feature-by-feature to keep the app functional throughout:

1.  Steps 1-3: Install, create QueryClient + provider, create queryKeys (foundation)
2.  Step 4-5: Remove invalidation from API modules, delete old files
3.  Step 6: Migrate all consumers (this is the bulk - do one entity domain at a time)

- Start with categories (simple, used everywhere as base data)
- Then accounts
- Then merchants + rules (tightly coupled)
- Then transactions (most queries)
- Then subscriptions, settings, appSettings, anomalies, dashboard, search, import

4.  Step 7: Add invalidation helpers + wire into mutation hooks/services
5.  Step 8: Add optimistic updates for key interactions
6.  Step 9-10: Fix tests, cleanup

Verification

1.  cd packages/web && bun run typecheck - no type errors
2.  cd packages/web && bun run test - all tests pass
3.  Manual testing: bun run dev from root, exercise all pages:

- Dashboard: verify data loads, spending charts render
- Transactions: filter, sort, assign category (should feel instant with optimistic update)
- Merchants: list loads, detail page shows stats
- Rules: create/edit/delete rules, verify toast undo works
- Settings: change preferences, export/import data
- Import: import CSV, verify transactions appear

4.  Check React Query Devtools (if installed): verify cache entries, no stale queries
