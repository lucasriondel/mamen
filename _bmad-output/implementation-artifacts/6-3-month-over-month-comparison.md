# Story 6.3: Month-over-Month Comparison

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to compare my spending between time periods**,
So that **I can see if I'm spending more or less than before (FR31)**.

## Acceptance Criteria

1. **Given** I am viewing a month on the Dashboard
   **When** I look at the spending summary
   **Then** I see the current period total
   **And** I see a comparison to the previous period
   **And** the change is shown as amount and percentage

2. **Given** spending increased from last period
   **When** I view the comparison
   **Then** I see an upward indicator (arrow icon)
   **And** the change is shown in warning/red color
   **And** text shows: "+€150 (+12%) vs last month"

3. **Given** spending decreased from last period
   **When** I view the comparison
   **Then** I see a downward indicator (arrow icon)
   **And** the change is shown in success/green color
   **And** text shows: "-€75 (-8%) vs last month"

4. **Given** I view the category breakdown
   **When** comparison mode is active
   **Then** each category shows its change vs previous period
   **And** I can see which categories increased or decreased

5. **Given** I'm viewing "This Year"
   **When** comparison is calculated
   **Then** it compares to the same period last year (if data exists)
   **And** or shows "No previous data" if not available

6. **Given** there is no previous period data
   **When** I view the comparison
   **Then** I see "No previous data to compare"
   **And** the comparison section is gracefully hidden or muted

## Tasks / Subtasks

- [ ] Task 1: Create comparison utility functions (AC: #1, #2, #3, #5, #6)
  - [ ] Create `src/features/dashboard/utils/computeComparison.ts`
  - [ ] Create `src/features/dashboard/utils/computeComparison.test.ts`
  - [ ] Implement `getPreviousPeriodRange(period: TimePeriod): ResolvedDateRange`:
    - `this-month`: previous calendar month
    - `last-month`: the month before last month
    - `last-3-months`: the 3-month window before the current 3 months
    - `this-year`: same date range in the previous year
    - `custom`: shift the custom range back by its own duration
  - [ ] Implement `computeComparison(current: number, previous: number): ComparisonResult`:
    ```typescript
    type ComparisonResult = {
      absoluteChange: number      // current - previous (e.g., +150 or -75)
      percentageChange: number    // percentage change (e.g., 12 or -8)
      direction: 'up' | 'down' | 'flat'
      hasPreviousData: boolean
    }
    ```
    - `direction`: 'up' if increased, 'down' if decreased, 'flat' if within ±0.5%
    - Handle edge case: previous = 0 (show "New" or 100% increase)
    - Handle edge case: current = 0 (show -100%)
  - [ ] Implement `getComparisonLabel(period: TimePeriod): string`:
    - `this-month`: "vs last month"
    - `last-month`: "vs [month before last]"
    - `last-3-months`: "vs previous 3 months"
    - `this-year`: "vs last year"
    - `custom`: "vs previous period"

- [ ] Task 2: Create `useSpendingComparison` hook (AC: #1, #4, #5, #6)
  - [ ] Create `src/features/dashboard/hooks/useSpendingComparison.ts`
  - [ ] Create `src/features/dashboard/hooks/useSpendingComparison.test.ts`
  - [ ] Accept `selectedPeriod: TimePeriod` parameter
  - [ ] Use `getPreviousPeriodRange` to compute previous date range
  - [ ] Use `useLiveQuery` to query previous period transactions from Dexie:
    ```typescript
    const prevTransactions = useLiveQuery(
      () => prevRange
        ? db.transactions.where('date').between(prevRange.startDate, prevRange.endDate, true, true).toArray()
        : Promise.resolve([]),
      [prevRange?.startDate, prevRange?.endDate]
    )
    ```
  - [ ] Aggregate previous period data: group by categoryId, sum amounts (same logic as `useSpendingBreakdown`)
  - [ ] Compute comparison for total spending AND per-category:
    ```typescript
    type SpendingComparison = {
      totalComparison: ComparisonResult
      comparisonLabel: string
      categoryComparisons: Map<string | null, ComparisonResult>
      previousPeriodTotal: number
    }
    ```
  - [ ] Return `undefined` when previous period has no transactions (AC: #6)

- [ ] Task 3: Create `ComparisonIndicator` component (AC: #2, #3, #6)
  - [ ] Create `src/features/dashboard/components/ComparisonIndicator/index.tsx`
  - [ ] Create `src/features/dashboard/components/ComparisonIndicator/ComparisonIndicator.test.tsx`
  - [ ] Props:
    ```typescript
    type ComparisonIndicatorProps = {
      comparison: ComparisonResult | undefined
      label: string   // e.g., "vs last month"
      size?: 'sm' | 'md'
    }
    ```
  - [ ] Render:
    - **Up (spending increased):** `↑ +€150 (+12%) vs last month` in `text-destructive` (warning/red)
    - **Down (spending decreased):** `↓ -€75 (-8%) vs last month` in `text-green-500` (success/green)
    - **Flat:** `→ No change vs last month` in `text-muted-foreground`
    - **No data:** `No previous data to compare` in `text-muted-foreground`
  - [ ] Use `TrendingUp` / `TrendingDown` / `Minus` icons from `lucide-react`
  - [ ] Format amounts with `formatCurrency` utility
  - [ ] `size='sm'` for per-category indicators (smaller font, inline)
  - [ ] `size='md'` for total spending indicator (default)

- [ ] Task 4: Update `SpendingSummary` to show total comparison (AC: #1, #2, #3, #6)
  - [ ] Modify `src/features/dashboard/components/SpendingSummary/index.tsx`
  - [ ] Add optional `comparison` prop: `SpendingComparison | undefined`
  - [ ] Render `ComparisonIndicator` below total expenses with `size='md'`
  - [ ] Update `SpendingSummary.test.tsx`:
    - Test: Shows comparison when data available
    - Test: Shows "No previous data" when no comparison
    - Test: Correct color for increase (destructive)
    - Test: Correct color for decrease (success/green)
    - Test: Hides comparison gracefully when undefined

- [ ] Task 5: Update `CategoryBreakdown` to show per-category comparison (AC: #4)
  - [ ] Modify `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [ ] Add optional `categoryComparisons` prop: `Map<string | null, ComparisonResult> | undefined`
  - [ ] For each category row, render inline `ComparisonIndicator` with `size='sm'`:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ [Color] Shopping        €1,200.00  (35%)  ↑ +12% vs last   │
    │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
    ├─────────────────────────────────────────────────────────────┤
    │ [Color] Dining            €450.00  (13%)  ↓ -8% vs last    │
    │ ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [ ] Only show comparison if `categoryComparisons` is defined
  - [ ] Categories not present in previous period show "New"
  - [ ] Update `CategoryBreakdown.test.tsx`:
    - Test: Shows per-category comparison indicators
    - Test: Hides comparison when no data
    - Test: Shows "New" for categories not in previous period

- [ ] Task 6: Wire comparison into `DashboardPage` (AC: all)
  - [ ] Modify `src/features/dashboard/components/DashboardPage/index.tsx`
  - [ ] Add `useSpendingComparison(selectedPeriod)` hook
  - [ ] Pass `comparison` to `SpendingSummary`
  - [ ] Pass `categoryComparisons` to `CategoryBreakdown`
  - [ ] Comparison updates reactively when time period changes
  - [ ] Update `DashboardPage.test.tsx`:
    - Test: Comparison data flows to SpendingSummary
    - Test: Comparison data flows to CategoryBreakdown
    - Test: Comparison updates when period changes

- [ ] Task 7: Write tests (AC: all)
  - [ ] `computeComparison.test.ts`:
    - Test: `getPreviousPeriodRange` returns correct range for each preset
    - Test: `getPreviousPeriodRange` returns correct range for custom period
    - Test: `computeComparison` returns 'up' when current > previous
    - Test: `computeComparison` returns 'down' when current < previous
    - Test: `computeComparison` returns 'flat' when within ±0.5%
    - Test: Handles previous = 0 (new spending)
    - Test: Handles current = 0 (stopped spending)
    - Test: `getComparisonLabel` returns correct labels
  - [ ] `useSpendingComparison.test.ts`:
    - Test: Returns comparison when both periods have data
    - Test: Returns undefined when no previous period data
    - Test: Correctly computes per-category comparisons
    - Test: Handles categories present in only one period
    - Test: Recomputes when selected period changes
  - [ ] `ComparisonIndicator.test.tsx`:
    - Test: Renders upward indicator with destructive color
    - Test: Renders downward indicator with success color
    - Test: Renders flat indicator with muted color
    - Test: Renders "No previous data" when undefined
    - Test: Formats amounts with currency
    - Test: Renders correctly in 'sm' and 'md' sizes

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Comparison State | Derived from queries (no separate storage) | Compute on the fly from two period queries |
| Date Filtering | Dexie `.where('date').between()` | Indexed query for both current and previous periods |

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

### Previous Period Calculation Logic

The comparison always compares against the equivalent previous period:

| Selected Period | Previous Period | Label |
|-----------------|-----------------|-------|
| This Month (Feb 2026) | Jan 2026 | "vs last month" |
| Last Month (Jan 2026) | Dec 2025 | "vs December 2025" |
| Last 3 Months (Dec-Feb) | Sep-Nov | "vs previous 3 months" |
| This Year (2026) | Same dates in 2025 | "vs last year" |
| Custom (Jan 15 - Feb 7) | Dec 22 - Jan 14 (same duration, shifted back) | "vs previous period" |

For custom ranges, shift back by the exact duration of the range:
```typescript
const durationMs = endDate.getTime() - startDate.getTime()
const prevEnd = new Date(startDate.getTime() - 1) // day before current start
const prevStart = new Date(prevEnd.getTime() - durationMs)
```

### Spending Direction Colors

**Source: [ux-design-specification.md#Semantic-Colors]**

For a personal finance app, spending INCREASE is bad and DECREASE is good:
- **Spending UP (bad):** `text-destructive` — `hsl(0 84% 60%)` — red
- **Spending DOWN (good):** Use Tailwind `text-green-500` or `text-emerald-500` (closest to `hsl(142 76% 36%)` success color)
- **Flat/No change:** `text-muted-foreground` — `hsl(215 20% 65%)`

### Comparison Indicator Format

```
↑ +€150.00 (+12%) vs last month     // spending increased (destructive)
↓ -€75.00 (-8%) vs last month       // spending decreased (success)
→ No change vs last month            // flat (muted)
— No previous data to compare        // no data (muted)
```

For per-category (compact `size='sm'`):
```
↑ +12%    // just percentage, no amount
↓ -8%
New       // category didn't exist in previous period
```

### Integration with Story 6.1 and 6.2

**Story 6.1 established:**
- `useSpendingBreakdown` hook — reuse its aggregation pattern for previous period
- `CategoryBreakdown` component — extend with per-category comparison indicators
- `SpendingSummary` component — extend with total comparison indicator
- `DashboardPage` — compose with new comparison data
- Category color palette from CSS custom properties
- `SpendingBreakdownItem` and `SpendingBreakdown` types

**Story 6.2 established:**
- `useTimePeriod` hook — provides `selectedPeriod` to feed into comparison
- `resolveTimePeriod` utility — reuse for resolving previous period date range
- `TimePeriod`, `TimePeriodPreset`, `ResolvedDateRange` types — reuse directly
- `TimePeriodSelector` component — unchanged, already drives period selection
- Dexie `.where('date').between()` pattern — reuse for previous period query

### Aggregation Reuse Strategy

The previous period needs the same aggregation as the current period (group by category, sum amounts). To avoid duplicating aggregation logic:

**Option A (Recommended):** Extract aggregation logic from `useSpendingBreakdown` into a shared utility:
```typescript
// src/features/dashboard/utils/aggregateTransactions.ts
export const aggregateByCategory = (transactions: Transaction[]): SpendingBreakdownItem[] => {
  // Group by categoryId, sum amounts, calc percentages, assign colors
}
```
Then both `useSpendingBreakdown` and `useSpendingComparison` call it.

**Option B:** Have `useSpendingComparison` duplicate the aggregation inline (simpler but violates DRY).

Use Option A — extract the aggregation to prevent code duplication.

### No Extra Dependencies

No new libraries needed. Use:
- `lucide-react` icons: `TrendingUp`, `TrendingDown`, `Minus` (already installed)
- Native `Date` for all date math (no date-fns/dayjs — per Story 6.2 decision)
- `formatCurrency` utility (existing)

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `useSpendingBreakdown` | `src/features/dashboard/hooks/useSpendingBreakdown.ts` | Current period aggregation |
| `useTimePeriod` | `src/features/dashboard/hooks/useTimePeriod.ts` | Period selection state |
| `resolveTimePeriod` | `src/features/dashboard/utils/resolveTimePeriod.ts` | Date range resolution |
| `TimePeriod` types | `src/features/dashboard/types.ts` | Type definitions |
| `CategoryBreakdown` | `src/features/dashboard/components/CategoryBreakdown/` | Modify to add comparison |
| `SpendingSummary` | `src/features/dashboard/components/SpendingSummary/` | Modify to add comparison |
| `DashboardPage` | `src/features/dashboard/components/DashboardPage/` | Modify to wire comparison |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |
| Lucide icons | `lucide-react` | TrendingUp, TrendingDown, Minus |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| `TimePeriodSelector` | `src/features/dashboard/components/TimePeriodSelector/` | Unchanged — drives period selection |
| `TransactionRow` | `src/components/TransactionRow/index.tsx` | Not used in comparison |
| `CommandPalette` | `src/components/CommandPalette/index.tsx` | Unchanged |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | Unchanged |

### Project Structure for This Story

```
src/
├── features/
│   └── dashboard/
│       ├── index.ts (modify - export new utilities and components)
│       ├── utils/
│       │   ├── computeComparison.ts (new)
│       │   ├── computeComparison.test.ts (new)
│       │   └── aggregateTransactions.ts (new - extracted from useSpendingBreakdown)
│       ├── hooks/
│       │   ├── useSpendingBreakdown.ts (modify - use extracted aggregation utility)
│       │   ├── useSpendingBreakdown.test.ts (verify existing tests still pass)
│       │   ├── useSpendingComparison.ts (new)
│       │   └── useSpendingComparison.test.ts (new)
│       └── components/
│           ├── ComparisonIndicator/
│           │   ├── index.tsx (new)
│           │   └── ComparisonIndicator.test.tsx (new)
│           ├── SpendingSummary/
│           │   ├── index.tsx (modify - add comparison prop)
│           │   └── SpendingSummary.test.tsx (modify - add comparison tests)
│           ├── CategoryBreakdown/
│           │   ├── index.tsx (modify - add per-category comparison)
│           │   └── CategoryBreakdown.test.tsx (modify - add comparison tests)
│           └── DashboardPage/
│               ├── index.tsx (modify - wire useSpendingComparison)
│               └── DashboardPage.test.tsx (modify - add comparison tests)
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Dashboard render with comparison | <100ms (two Dexie indexed queries) |
| Comparison computation | Lightweight — just subtraction and division |
| Reactivity | Both current and previous queries via `useLiveQuery` |

The comparison adds one additional Dexie query (previous period). Since both queries use indexed `.where('date').between()`, performance impact is minimal.

### Typography for Comparison

**Source: [ux-design-specification.md#Typography-System]**

- Amounts in comparison: `font-mono tabular-nums` (same as all amounts)
- Percentage: regular font, inline with amount
- "vs last month" label: `text-muted-foreground text-sm`

### Edge Cases to Handle

1. **First month of data:** No previous period exists → show "No previous data to compare" (muted)
2. **Category exists only in current period:** Show "New" instead of percentage
3. **Category exists only in previous period:** Don't show it in current breakdown (it has €0)
4. **Both periods have €0:** Show "flat" / "No change"
5. **Previous period total is 0, current is non-zero:** Show "New spending" or omit percentage
6. **Custom range spanning months:** Previous period shifts back by duration, may cross month boundaries — this is fine

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT duplicate Dexie data in React state — use `useLiveQuery` directly
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT duplicate aggregation logic — extract to shared utility
- DO NOT add a charting library for comparison indicators — use icons + text
- DO NOT implement drill-down click behavior (that's Story 6.4)
- DO NOT store comparison results — compute from two queries
- DO NOT add date libraries (date-fns, dayjs) — use native Date
- DO NOT modify `TimePeriodSelector` — it works as-is from Story 6.2

### Validation Checklist

Before marking complete:
- [ ] Spending summary shows total comparison with amount and percentage
- [ ] Increased spending shows upward arrow in destructive/red color
- [ ] Decreased spending shows downward arrow in success/green color
- [ ] Flat spending shows neutral indicator in muted color
- [ ] "No previous data to compare" shown when no previous period data
- [ ] Each category row shows per-category comparison (compact)
- [ ] Categories new to current period show "New"
- [ ] Comparison updates reactively when time period changes
- [ ] Previous period calculated correctly for all presets (this-month, last-month, last-3-months, this-year)
- [ ] Custom range previous period shifts back by duration
- [ ] Aggregation logic extracted to shared utility (no duplication)
- [ ] Amounts formatted with `formatCurrency` and monospace font
- [ ] Icons from lucide-react (TrendingUp, TrendingDown, Minus)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass (new + existing)
- [ ] `useLiveQuery` used for both current and previous period queries
- [ ] No extra dependencies added

### References

- [Source: epics.md#Epic-6-Story-6.3-Month-over-Month-Comparison]
- [Source: prd.md#FR31 - User can compare spending between time periods (month-over-month)]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Frontend-Architecture - Dexie useLiveQuery]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Performance-Requirements]
- [Source: ux-design-specification.md#Semantic-Colors]
- [Source: ux-design-specification.md#Typography-System]
- [Source: ux-design-specification.md#Visual-Design-Foundation]
- [Story 6.1: Spending Breakdown by Category - useSpendingBreakdown hook, aggregation logic, CategoryBreakdown, SpendingSummary]
- [Story 6.2: Time Period Selection - useTimePeriod hook, resolveTimePeriod utility, TimePeriod types, Dexie date filtering pattern]
- [Story 6.4: Drill-Down to Transactions - future consumer of comparison data]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
