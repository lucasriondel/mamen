# Story 6.4: Drill-Down to Transactions

Status: ready-for-dev

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

- [ ] Task 1: Add drill-down route parameters to Transactions page (AC: #1, #2)
  - [ ] Modify TanStack Router transactions route to accept optional search params:
    ```typescript
    type TransactionSearchParams = {
      categoryId?: string
      periodStart?: string  // ISO date string
      periodEnd?: string    // ISO date string
      from?: string         // "dashboard" — for breadcrumb back-navigation
    }
    ```
  - [ ] Modify `src/routes/transactions.tsx` to read search params
  - [ ] Ensure params are optional — Transactions page works identically without them
  - [ ] Verify URL updates when drill-down params are applied (e.g., `/transactions?categoryId=shopping&periodStart=2026-02-01&periodEnd=2026-02-28&from=dashboard`)

- [ ] Task 2: Create `useDrillDownFilter` hook (AC: #1, #3)
  - [ ] Create `src/features/transactions/hooks/useDrillDownFilter.ts`
  - [ ] Create `src/features/transactions/hooks/useDrillDownFilter.test.ts`
  - [ ] Read search params from URL via TanStack Router's `useSearch()`
  - [ ] Return filter state:
    ```typescript
    type DrillDownFilter = {
      categoryId: string | null
      periodStart: Date | null
      periodEnd: Date | null
      fromDashboard: boolean
    }
    ```
  - [ ] Provide `clearDrillDownFilter()` function that removes search params from URL
  - [ ] Provide `clearAllFilters()` that clears drill-down + any focus mode filters
  - [ ] Wire into `A` key handler — pressing `A` calls `clearAllFilters()`

- [ ] Task 3: Update `TransactionList` to apply drill-down filter (AC: #1, #3)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] Apply category filter to Dexie query when `categoryId` is present:
    ```typescript
    const transactions = useLiveQuery(() => {
      let query = db.transactions.orderBy('date').reverse()
      if (categoryId) {
        query = db.transactions.where('categoryId').equals(categoryId)
          .reverse().sortBy('date')
      }
      if (periodStart && periodEnd) {
        // Further filter by date range
      }
      return query
    }, [categoryId, periodStart, periodEnd])
    ```
  - [ ] Show active filter indicator: badge or chip showing "Shopping" with [x] to clear
  - [ ] When filter is active, show filtered count: "Showing 23 of 450 transactions"
  - [ ] Update `TransactionList.test.tsx`:
    - Test: Shows all transactions when no filter
    - Test: Filters to category when categoryId param present
    - Test: Filters by date range when period params present
    - Test: Shows filter indicator with category name
    - Test: Clear button removes filter and navigates to all transactions

- [ ] Task 4: Update breadcrumb to show drill-down context (AC: #2)
  - [ ] Modify breadcrumb component (likely in `src/components/Layout/` or transactions page)
  - [ ] When `from=dashboard` and `categoryId` is present:
    - Render: `Dashboard > [Category Name]`
    - "Dashboard" links back to `/` (Dashboard route)
    - Category name is the current page (non-clickable, bold)
  - [ ] When no drill-down context: render normal breadcrumb ("Transactions")
  - [ ] Clicking "Dashboard" in breadcrumb preserves the time period the user was viewing
  - [ ] Test: Breadcrumb shows "Dashboard > Shopping" when drilled down
  - [ ] Test: Breadcrumb shows "Transactions" when normal view
  - [ ] Test: Clicking "Dashboard" navigates back

- [ ] Task 5: Make `CategoryBreakdown` rows clickable with drill-down navigation (AC: #1, #4, #5)
  - [ ] Modify `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [ ] Add click handler to each category row:
    ```typescript
    const handleCategoryClick = (categoryId: string) => {
      navigate({
        to: '/transactions',
        search: {
          categoryId,
          periodStart: resolvedPeriod.startDate.toISOString(),
          periodEnd: resolvedPeriod.endDate.toISOString(),
          from: 'dashboard',
        },
      })
    }
    ```
  - [ ] Add `cursor-pointer` and hover state to category rows:
    - Hover: subtle background highlight (`bg-accent/50`)
    - Transition: `transition-colors duration-150`
  - [ ] Add keyboard support:
    - `tabIndex={0}` on each category row
    - `onKeyDown` handler: Enter triggers drill-down
    - Visible focus ring on `:focus-visible` (use `ring` color)
  - [ ] Add `role="button"` and `aria-label="View Shopping transactions"` for accessibility
  - [ ] Update `CategoryBreakdown.test.tsx`:
    - Test: Clicking category navigates to transactions with filter
    - Test: Enter key on focused category navigates
    - Test: Category rows have cursor-pointer
    - Test: Tab navigates between category rows
    - Test: Focus ring visible on keyboard focus

- [ ] Task 6: Add category tooltip on hover (AC: #4)
  - [ ] Use shadcn `Tooltip` component (already available)
  - [ ] On hover over a category row in `CategoryBreakdown`, show tooltip:
    ```
    Shopping
    23 transactions
    Top merchants: Amazon (12), eBay (5), Etsy (3)
    ```
  - [ ] Compute tooltip data:
    - Transaction count: from current period query (already available in breakdown data)
    - Top merchants: query Dexie for top 3 merchants by transaction count within this category and period
  - [ ] Create `useCategoryTooltipData(categoryId: string, dateRange: ResolvedDateRange)` hook
    - Use `useLiveQuery` to fetch merchants for category in period
    - Group by merchantId, count, sort descending, take top 3
    - Return: `{ transactionCount: number, topMerchants: { name: string, count: number }[] }`
  - [ ] Only fetch tooltip data when tooltip is about to show (lazy / on hover)
  - [ ] Create `src/features/dashboard/hooks/useCategoryTooltipData.ts`
  - [ ] Create `src/features/dashboard/hooks/useCategoryTooltipData.test.ts`
  - [ ] Test: Tooltip shows transaction count
  - [ ] Test: Tooltip shows top 3 merchants sorted by count
  - [ ] Test: Tooltip handles category with no merchants (shows "No merchants")

- [ ] Task 7: Wire `A` key to clear all filters (AC: #3)
  - [ ] Ensure the existing keyboard navigation hook handles `A` key on the Transactions page
  - [ ] When `A` is pressed:
    - Clear drill-down filter (remove URL search params)
    - Clear focus mode filters (U/M/S) if active
    - Navigate to clean `/transactions` route
  - [ ] Only handle `A` when not in an input field (standard keyboard guard)
  - [ ] Test: `A` key clears drill-down filter
  - [ ] Test: `A` key clears focus mode filters
  - [ ] Test: `A` key does nothing when typing in input

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Full drill-down flow test:
    - Render DashboardPage with mock data
    - Click on a category
    - Verify navigation to Transactions with correct search params
    - Verify filtered transaction list
    - Verify breadcrumb shows "Dashboard > [Category]"
    - Press `A` to clear
    - Verify all transactions shown
  - [ ] Keyboard drill-down flow test:
    - Tab to category on dashboard
    - Press Enter
    - Verify navigation with correct params
  - [ ] Back-navigation test:
    - Click "Dashboard" in breadcrumb
    - Verify return to Dashboard

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
