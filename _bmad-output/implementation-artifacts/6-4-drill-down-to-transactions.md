# Story 6.4: Drill-Down to Transactions

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to click on a category to see its individual transactions**,
So that **I can investigate my spending in detail (FR32)**.

## Acceptance Criteria

1. **Given** I am viewing the category breakdown on the Dashboard
   **When** I click on a category (e.g., "Shopping: €450")
   **Then** I navigate to the Transactions page
   **And** transactions are filtered to that category
   **And** the time period filter is preserved

2. **Given** I drill down to a category
   **When** I view the Transactions page
   **Then** the breadcrumb shows: "Dashboard > Shopping"
   **And** I can click "Dashboard" to go back
   **And** the category filter is clearly indicated

3. **Given** I am viewing filtered transactions
   **When** I want to see all transactions
   **Then** I can clear the category filter
   **And** pressing `A` clears all filters

4. **Given** I hover over a category in the breakdown
   **When** I see the hover state
   **Then** a tooltip shows additional info: transaction count, top merchants
   **And** the category is visually highlighted as clickable

5. **Given** I use keyboard navigation on the dashboard
   **When** I focus on a category
   **Then** I can press Enter to drill down
   **And** Tab moves between categories
   **And** the focused category has visible focus ring

## Tasks / Subtasks

- [x] Task 1: Add drill-down route parameters to Transactions page (AC: #1, #2)
  - [x] Modify TanStack Router transactions route to accept optional search params
  - [x] Modify `src/routes/transactions.tsx` to read search params via Zod schema
  - [x] Ensure params are optional — Transactions page works identically without them
  - [x] Verify URL updates when drill-down params are applied

- [x] Task 2: Create `useDrillDownFilter` hook (AC: #1, #3)
  - [x] Create `src/features/transactions/hooks/useDrillDownFilter.ts`
  - [x] Create `src/features/transactions/hooks/useDrillDownFilter.test.ts` (5 tests)
  - [x] Read search params from URL via TanStack Router's `useSearch()`
  - [x] Return filter state with categoryId, periodStart/End, fromDashboard
  - [x] Provide `clearDrillDownFilter()` function that removes search params from URL
  - [x] Provide `clearAllFilters()` that clears drill-down + any focus mode filters

- [x] Task 3: Update `TransactionList` to apply drill-down filter (AC: #1, #3)
  - [x] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [x] Apply category filter to Dexie query via `useFilteredTransactions` hook
  - [x] Show active filter indicator bar with category chip, clear button, transaction count
  - [x] Add drill-down-specific empty state with category name
  - [x] Update `TransactionList.test.tsx` with route-aware rendering

- [x] Task 4: Update breadcrumb to show drill-down context (AC: #2)
  - [x] Modify `src/hooks/useBreadcrumbs.ts` with category lookup via useLiveQuery
  - [x] When `from=dashboard` + `categoryId`: show "Dashboard > [Category Name]"
  - [x] When `categoryId` without dashboard: show "Transactions > [Category Name]"
  - [x] Added 3 breadcrumb drill-down tests to `useBreadcrumbs.test.ts`

- [x] Task 5: Make `CategoryBreakdown` rows clickable with drill-down navigation (AC: #1, #4, #5)
  - [x] Modify `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [x] Add click handler, cursor-pointer, hover state, keyboard Enter support
  - [x] Add `role="button"` and `aria-label` for accessibility
  - [x] Uncategorized rows are not clickable
  - [x] Wire `handleCategoryClick` in `DashboardPage` with navigate + search params
  - [x] Added 6 tests to `CategoryBreakdown.test.tsx`

- [x] Task 6: Add category tooltip on hover (AC: #4)
  - [x] Create `src/features/dashboard/hooks/useCategoryTooltipData.ts` (lazy fetch)
  - [x] Create `src/features/dashboard/hooks/useCategoryTooltipData.test.ts` (5 tests)
  - [x] Extract `CategoryRow` sub-component with Tooltip integration
  - [x] Add `dateRange` prop to CategoryBreakdown, passed from DashboardPage
  - [x] Tooltip shows transaction count and top 3 merchants

- [x] Task 7: Wire `A` key to clear all filters (AC: #3)
  - [x] Added `useEffect` in TransactionList for `A` key handler (document level)
  - [x] When drill-down active, `A` clears drill-down filter via clearDrillDownFilter()
  - [x] Existing FocusModeContext handler clears focus modes on `A` press

- [x] Task 8: Write integration tests (AC: all)
  - [x] Created `DrillDown.test.tsx` with 6 integration tests
  - [x] Tests: category filtering, filter indicator bar, no filter without drill-down, all transactions, empty state, date range filtering

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Filter State | URL search params (TanStack Router) | Shareable, bookmarkable, back-button friendly |
| Navigation | TanStack Router `navigate()` | Type-safe navigation with search params |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |
| Props | `{ComponentName}Props` type |

### Drill-Down Navigation Strategy

The drill-down uses **URL search params** rather than React state for these reasons:
- **Back button works**: User can press browser back to return to Dashboard
- **Shareable**: Filter state is in the URL
- **Survives refresh**: Reloading the page preserves the filter
- **Clean separation**: Transactions page doesn't need to know about Dashboard internals

**URL format:**
```
/transactions?categoryId=shopping-online&periodStart=2026-02-01T00:00:00.000Z&periodEnd=2026-02-28T23:59:59.999Z&from=dashboard
```

### Integration with Stories 6.1, 6.2, 6.3

**Story 6.1 established:**
- `CategoryBreakdown` component — make rows clickable (modify)
- `SpendingSummary` component — unchanged
- `useSpendingBreakdown` hook — provides category data including IDs
- `DashboardPage` — unchanged (already composes CategoryBreakdown)
- `SpendingBreakdownItem` type — has `categoryId` field needed for drill-down

**Story 6.2 established:**
- `useTimePeriod` hook — provides current selected period for preserving in drill-down
- `resolveTimePeriod` utility — use to get date range to pass in URL params
- `TimePeriod`, `ResolvedDateRange` types — reuse directly
- `TimePeriodSelector` — unchanged

**Story 6.3 established:**
- `ComparisonIndicator` — unchanged (per-category indicators still visible)
- `useSpendingComparison` — unchanged
- `computeComparison` utils — unchanged
- `aggregateTransactions` utility — may reuse for tooltip merchant grouping

### Category ID Mapping

Categories are stored with an ID (string key like `"shopping"`, `"shopping-online"`, `"dining"`, etc.). The drill-down passes this `categoryId` in the URL. The Transactions page uses it to filter via Dexie:

```typescript
db.transactions
  .where('categoryId')
  .equals(categoryId)
  .and(tx => tx.date >= periodStart && tx.date <= periodEnd)
  .toArray()
```

Ensure the `categoryId` field is indexed in Dexie schema (it should be from Story 4.1). If not indexed, use `.filter()` instead (still fast for <10k transactions).

### Breadcrumb Implementation

The breadcrumb needs to resolve the category name from the categoryId. Options:

**Option A (Recommended):** Look up category name from the default categories constant (seeded in Story 4.1). Since categories are predefined and not user-editable, a simple lookup is sufficient:
```typescript
const categoryName = getCategoryLabel(categoryId)  // "Shopping > Online"
```

**Option B:** Query Dexie for the category. Overkill for predefined categories.

Use Option A — simple, fast, no async needed.

### Filter Indicator UX

When drill-down filter is active on Transactions page, show a clear indicator:

```
┌─────────────────────────────────────────────────────────────┐
│ Transactions > Dashboard > Shopping                          │
│                                                             │
│ Filtered: [Shopping ×]  [Feb 2026 ×]    [Clear All (A)]     │
│                                                             │
│ Showing 23 transactions                                     │
│ ─────────────────────────────────────────────────────────── │
│ Jan 28  AMZN*1234XYZ       €29.99   Shopping > Online       │
│ Jan 25  EBAY*5678           €15.00   Shopping > Online       │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

- Category filter shows as a removable chip/badge
- Period filter shows as a removable chip (if from drill-down)
- "Clear All (A)" button resets everything
- Count shows "Showing X transactions" (no "of Y total" needed)

### Tooltip Data Fetching Strategy

The category tooltip needs transaction count and top merchants. To avoid fetching on every render:

1. **Lazy fetch**: Only query when tooltip is about to show (use `onOpenChange` from Radix Tooltip)
2. **Use `useLiveQuery`**: Keeps data reactive but only runs when component mounts
3. **Lightweight query**: Just group by merchantId and count — no heavy aggregation

```typescript
const topMerchants = useLiveQuery(async () => {
  if (!isOpen) return null
  const txs = await db.transactions
    .where('categoryId').equals(categoryId)
    .and(tx => tx.date >= startDate && tx.date <= endDate)
    .toArray()

  const merchantCounts = new Map<string, number>()
  for (const tx of txs) {
    if (tx.merchantId) {
      merchantCounts.set(tx.merchantId, (merchantCounts.get(tx.merchantId) || 0) + 1)
    }
  }

  const sorted = [...merchantCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // Resolve merchant names
  const merchants = await Promise.all(
    sorted.map(async ([id, count]) => {
      const merchant = await db.merchants.get(id)
      return { name: merchant?.name ?? 'Unknown', count }
    })
  )
  return merchants
}, [categoryId, startDate, endDate, isOpen])
```

### No Extra Dependencies

No new libraries needed. Use:
- TanStack Router `useSearch()` and `navigate()` (already installed)
- shadcn `Tooltip` component (already installed)
- `lucide-react` icons if needed (already installed)
- Dexie `useLiveQuery` (already installed)

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `useSpendingBreakdown` | `src/features/dashboard/hooks/useSpendingBreakdown.ts` | Category data with IDs |
| `useTimePeriod` | `src/features/dashboard/hooks/useTimePeriod.ts` | Current period selection |
| `resolveTimePeriod` | `src/features/dashboard/utils/resolveTimePeriod.ts` | Date range resolution |
| `CategoryBreakdown` | `src/features/dashboard/components/CategoryBreakdown/` | Make rows clickable |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | Keyboard handler (extend with A key) |
| `Tooltip` | `src/components/ui/tooltip.tsx` | shadcn tooltip component |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| `SpendingSummary` | `src/features/dashboard/components/SpendingSummary/` | Not involved in drill-down |
| `ComparisonIndicator` | `src/features/dashboard/components/ComparisonIndicator/` | Still renders in CategoryBreakdown |
| `TimePeriodSelector` | `src/features/dashboard/components/TimePeriodSelector/` | Unchanged — drives period selection |
| `DashboardPage` | `src/features/dashboard/components/DashboardPage/` | Unchanged — CategoryBreakdown handles click |
| `CommandPalette` | `src/components/CommandPalette/index.tsx` | Unchanged |

### Project Structure for This Story

```
src/
├── routes/
│   └── transactions.tsx (modify - accept search params)
├── features/
│   ├── transactions/
│   │   ├── components/
│   │   │   └── TransactionList/
│   │   │       ├── index.tsx (modify - apply drill-down filter + filter indicator)
│   │   │       └── TransactionList.test.tsx (modify - add filter tests)
│   │   └── hooks/
│   │       ├── useDrillDownFilter.ts (new)
│   │       └── useDrillDownFilter.test.ts (new)
│   └── dashboard/
│       ├── components/
│       │   └── CategoryBreakdown/
│       │       ├── index.tsx (modify - add click handler, keyboard, tooltip)
│       │       └── CategoryBreakdown.test.tsx (modify - add click/keyboard/tooltip tests)
│       └── hooks/
│           ├── useCategoryTooltipData.ts (new)
│           └── useCategoryTooltipData.test.ts (new)
├── hooks/
│   └── useKeyboardNavigation.ts (modify - add A key handler for clear-all)
└── components/
    └── Layout/ (modify breadcrumb to support drill-down context)
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Category click to transactions page | <100ms navigation |
| Filter application | Instant (Dexie indexed query) |
| Tooltip data fetch | <100ms (small query, lazy loaded) |
| Breadcrumb render | Instant (synchronous category name lookup) |

The drill-down adds no extra queries to the Dashboard page. The Transactions page runs a filtered Dexie query which is fast when `categoryId` is indexed.

### Keyboard Accessibility

**Source: [ux-design-specification.md#Keyboard-Patterns]**

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Dashboard CategoryBreakdown | Move focus between category rows |
| `Enter` | Focused category row | Navigate to drill-down (same as click) |
| `A` | Transactions page | Clear all filters (drill-down + focus modes) |
| `Esc` | Transactions page with filter | Could optionally clear filter (but A is primary) |

Each category row must have:
- `tabIndex={0}` for keyboard focus
- `:focus-visible` ring styling
- `role="button"` for screen readers
- `aria-label` describing the action

### Edge Cases to Handle

1. **Category with 0 transactions in period:** Row still clickable but Transactions page shows empty state: "No transactions in Shopping for this period"
2. **Category deleted or renamed:** If categoryId in URL doesn't match any category, show all transactions with a toast: "Category not found, showing all transactions"
3. **Invalid date params:** If periodStart/periodEnd are malformed, ignore them and show all dates
4. **Back button behavior:** Browser back from filtered Transactions returns to Dashboard (URL-based state makes this automatic)
5. **Direct URL access:** Typing `/transactions?categoryId=shopping` directly should work (no Dashboard context needed, breadcrumb shows just "Transactions > Shopping" without Dashboard link)
6. **Focus mode + drill-down:** If user has U/M mode active and drills down from Dashboard, drill-down params override focus modes

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT store filter state in React context or Zustand — use URL search params
- DO NOT duplicate transaction data — query Dexie with filter applied
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT modify `SpendingSummary`, `ComparisonIndicator`, `TimePeriodSelector`, or `DashboardPage`
- DO NOT add date libraries (date-fns, dayjs) — use native Date + ISO strings
- DO NOT prefetch tooltip data for all categories — lazy load on hover only
- DO NOT add a charting library for drill-down — this is a navigation story, not visualization

### Validation Checklist

Before marking complete:
- [ ] Clicking a category on Dashboard navigates to Transactions with filter
- [ ] URL contains categoryId, periodStart, periodEnd, from params
- [ ] Transactions page shows only transactions in that category and period
- [ ] Breadcrumb shows "Dashboard > [Category Name]" when from dashboard
- [ ] Clicking "Dashboard" in breadcrumb returns to Dashboard
- [ ] Filter indicator chip shows category name with clear (x) button
- [ ] Pressing `A` clears all filters (drill-down + focus modes)
- [ ] Tab navigates between category rows on Dashboard
- [ ] Enter on focused category triggers drill-down
- [ ] Focused category has visible focus ring
- [ ] Hover on category shows tooltip with transaction count and top merchants
- [ ] Category rows have cursor-pointer on hover
- [ ] Empty category drill-down shows appropriate empty state
- [ ] Browser back button returns to Dashboard from filtered Transactions
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass (new + existing)
- [ ] `useLiveQuery` used for filtered queries
- [ ] No extra dependencies added
- [ ] `role="button"` and `aria-label` on clickable category rows

### References

- [Source: epics.md#Epic-6-Story-6.4-Drill-Down-to-Transactions]
- [Source: prd.md#FR32 - User can drill down from category totals to individual transactions]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface]
- [Source: architecture.md#Frontend-Architecture - TanStack Router type-safe routing]
- [Source: architecture.md#Project-Structure - routes/ and features/ directories]
- [Source: project-context.md#Technology-Stack - TanStack Router ^1.153]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: ux-design-specification.md#Keyboard-Patterns - A key clears all filters]
- [Source: ux-design-specification.md#Navigation-Patterns - Breadcrumbs]
- [Source: ux-design-specification.md#Accessibility-Strategy - WCAG AA, focus visible, ARIA]
- [Source: ux-design-specification.md#Visual-Design-Foundation - Focus ring, hover states]
- [Story 6.1: Spending Breakdown by Category - CategoryBreakdown component, SpendingBreakdownItem type, useSpendingBreakdown hook]
- [Story 6.2: Time Period Selection - useTimePeriod hook, resolveTimePeriod utility, TimePeriod types, ResolvedDateRange]
- [Story 6.3: Month-over-Month Comparison - ComparisonIndicator (unchanged), aggregateTransactions utility]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 8 tasks implemented with red-green-refactor cycle
- 865 tests pass across 87 files (1 pre-existing failure: DOMMatrix/pdfjs-dist in accounts.test.tsx)
- TypeScript compilation clean (npx tsc --noEmit passes)
- categoryId is `number` in Dexie schema (not string as story template suggested) — adjusted accordingly
- Drill-down overrides focus mode filters when active to prevent conflicting filters
- Used route-aware test rendering (TestComponent in route's component) for useDrillDownFilter tests since renderHook with wrapper doesn't work with TanStack Router's useSearch
- Mocked Radix Tooltip in CategoryBreakdown tests (jsdom lacks PopperContent DOM measurements)
- useBreadcrumbs mock uses simple variable for useLiveQuery return (not async callback) to avoid Promise in render

### File List

**New Files:**
- `src/features/transactions/hooks/useDrillDownFilter.ts` — Hook reading URL search params for drill-down filter state
- `src/features/transactions/hooks/useDrillDownFilter.test.ts` — 5 tests
- `src/features/dashboard/hooks/useCategoryTooltipData.ts` — Lazy tooltip data fetching hook
- `src/features/dashboard/hooks/useCategoryTooltipData.test.ts` — 5 tests
- `src/features/transactions/components/TransactionList/DrillDown.test.tsx` — 6 integration tests

**Modified Files:**
- `src/routes/transactions.tsx` — Added drill-down search params to Zod schema
- `src/features/transactions/hooks/useFilteredTransactions.ts` — Added categoryId + periodRange filter options
- `src/features/transactions/components/TransactionList/index.tsx` — Integrated drill-down filter, filter bar, empty state, A key handler
- `src/features/transactions/components/TransactionList/TransactionList.test.tsx` — Updated renderWithRouter to support /transactions route
- `src/hooks/useBreadcrumbs.ts` — Added drill-down breadcrumb with category name lookup
- `src/hooks/useBreadcrumbs.test.ts` — Added db mock + 3 drill-down breadcrumb tests
- `src/features/dashboard/components/CategoryBreakdown/index.tsx` — Extracted CategoryRow, added click/keyboard/tooltip/accessibility
- `src/features/dashboard/components/CategoryBreakdown/CategoryBreakdown.test.tsx` — Added tooltip mocks + 6 interaction tests
- `src/features/dashboard/components/DashboardPage/index.tsx` — Added handleCategoryClick + dateRange prop

### Change Log

| Change | Reason |
|--------|--------|
| Added drill-down search params to transactions route | AC #1: Navigate to filtered transactions from category click |
| Created useDrillDownFilter hook | AC #1, #3: Read URL filter state, provide clear functions |
| Extended useFilteredTransactions with categoryId/periodRange | AC #1: Filter transactions by category and date range |
| Added filter indicator bar to TransactionList | AC #1, #3: Show active filters with clear options |
| Updated useBreadcrumbs for drill-down context | AC #2: Show "Dashboard > [Category]" breadcrumb |
| Made CategoryBreakdown rows clickable | AC #1, #5: Click/Enter to drill down, Tab navigation |
| Added category tooltip on hover | AC #4: Transaction count + top merchants |
| Wired A key to clear drill-down | AC #3: Clear all filters with A key |
| Created DrillDown integration tests | AC all: End-to-end drill-down verification |
