# Story 6.2: Time Period Selection

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to filter my dashboard to a specific time period**,
So that **I can analyze spending for any month or date range (FR30)**.

## Acceptance Criteria

1. **Given** I am on the Dashboard
   **When** I view the time period selector
   **Then** I see the currently selected period (default: current month)
   **And** I can click to open a period picker

2. **Given** I open the period picker
   **When** I view the options
   **Then** I see quick options: This Month, Last Month, Last 3 Months, This Year
   **And** I see a custom date range option

3. **Given** I select "Last Month"
   **When** the selection is applied
   **Then** all dashboard data updates to show only last month's transactions
   **And** the period label updates (e.g., "December 2025")
   **And** category totals reflect only that period

4. **Given** I select "Custom Range"
   **When** I open the custom picker
   **Then** I can select a start date and end date
   **And** I see a calendar UI for date selection
   **And** the range is validated (start before end)

5. **Given** I select a time period
   **When** the dashboard updates
   **Then** the update is fast (<100ms for UI response)
   **And** all visualizations reflect the selected period

6. **Given** I change the time period
   **When** I have the period selector open
   **Then** I can use keyboard to navigate (arrows, Enter)
   **And** Esc closes the picker

## Tasks / Subtasks

- [ ] Task 1: Create `TimePeriod` type and utilities (AC: #1, #2, #3, #4)
  - [ ] Create `src/features/dashboard/types.ts` (or extend if exists)
  - [ ] Define types:
    ```typescript
    type TimePeriodPreset = 'this-month' | 'last-month' | 'last-3-months' | 'this-year'

    type TimePeriodCustom = {
      type: 'custom'
      startDate: Date
      endDate: Date
    }

    type TimePeriod = { type: TimePeriodPreset } | TimePeriodCustom

    type ResolvedDateRange = {
      startDate: Date
      endDate: Date
      label: string
    }
    ```
  - [ ] Create `src/features/dashboard/utils/resolveTimePeriod.ts`
  - [ ] Create `src/features/dashboard/utils/resolveTimePeriod.test.ts`
  - [ ] Implement `resolveTimePeriod(period: TimePeriod): ResolvedDateRange`:
    - `this-month`: first day of current month to now
    - `last-month`: first day to last day of previous month
    - `last-3-months`: first day 3 months ago to now
    - `this-year`: January 1st of current year to now
    - `custom`: use provided startDate/endDate
  - [ ] Implement `getTimePeriodLabel(period: TimePeriod): string`:
    - `this-month`: "This Month" or "February 2026"
    - `last-month`: month name + year (e.g., "January 2026")
    - `last-3-months`: "Last 3 Months"
    - `this-year`: "2026" or "This Year"
    - `custom`: "Jan 15 - Feb 7, 2026"

- [ ] Task 2: Update `useSpendingBreakdown` hook to accept date range (AC: #3, #5)
  - [ ] Modify `src/features/dashboard/hooks/useSpendingBreakdown.ts`
  - [ ] Add `dateRange?: { startDate: Date; endDate: Date }` parameter
  - [ ] When `dateRange` is provided, filter transactions with Dexie `.where('date').between(startDate, endDate)`
  - [ ] When `dateRange` is undefined, show ALL transactions (backward compatible with 6.1)
  - [ ] Update tests in `useSpendingBreakdown.test.ts`:
    - Test: Filters transactions within date range
    - Test: Returns all transactions when no date range
    - Test: Handles empty results for date range with no transactions

- [ ] Task 3: Create `useTimePeriod` hook for dashboard state (AC: #1, #2, #3)
  - [ ] Create `src/features/dashboard/hooks/useTimePeriod.ts`
  - [ ] Create `src/features/dashboard/hooks/useTimePeriod.test.ts`
  - [ ] Manage selected time period as React state (default: `{ type: 'this-month' }`)
  - [ ] Expose: `selectedPeriod`, `setSelectedPeriod`, `resolvedRange`, `periodLabel`
  - [ ] Memoize `resolvedRange` computation with `useMemo`

- [ ] Task 4: Create `TimePeriodSelector` component (AC: #1, #2, #4, #6)
  - [ ] Create `src/features/dashboard/components/TimePeriodSelector/index.tsx`
  - [ ] Create `src/features/dashboard/components/TimePeriodSelector/TimePeriodSelector.test.tsx`
  - [ ] Use shadcn Popover + Command (or DropdownMenu) as base
  - [ ] Trigger button: displays current period label with chevron icon
  - [ ] Dropdown content:
    ```
    ┌─────────────────────────────────────┐
    │ This Month                     ✓    │
    │ Last Month                          │
    │ Last 3 Months                       │
    │ This Year                           │
    │ ──────────────────────────────────  │
    │ Custom Range...                     │
    └─────────────────────────────────────┘
    ```
  - [ ] Checkmark on currently selected preset
  - [ ] "Custom Range..." opens inline date picker (see Task 5)
  - [ ] Keyboard: arrow keys to navigate options, Enter to select, Esc to close
  - [ ] Close popover on selection (except "Custom Range...")

- [ ] Task 5: Create custom date range picker (AC: #4)
  - [ ] Extend `TimePeriodSelector` with inline custom range UI
  - [ ] When "Custom Range..." is selected, show:
    ```
    ┌─────────────────────────────────────┐
    │ ← Back to presets                   │
    │                                     │
    │ Start: [_____date input_____]       │
    │ End:   [_____date input_____]       │
    │                                     │
    │           [Cancel] [Apply]          │
    └─────────────────────────────────────┘
    ```
  - [ ] Use native `<input type="date">` for date inputs (simple, accessible, no extra dependency)
  - [ ] Validate: start date must be before end date
  - [ ] Show inline error if validation fails
  - [ ] "Apply" sets the custom range and closes popover
  - [ ] "Cancel" or "Back to presets" returns to preset list

- [ ] Task 6: Wire TimePeriodSelector into DashboardPage (AC: #1, #3, #5)
  - [ ] Modify `src/features/dashboard/components/DashboardPage/index.tsx`
  - [ ] Add `useTimePeriod` hook
  - [ ] Pass `resolvedRange` to `useSpendingBreakdown`
  - [ ] Render `TimePeriodSelector` between `SpendingSummary` and `CategoryBreakdown` (or in header area)
  - [ ] Ensure all dashboard data reflects selected period

- [ ] Task 7: Write tests (AC: all)
  - [ ] `resolveTimePeriod.test.ts`:
    - Test: Resolves "this-month" to correct date range
    - Test: Resolves "last-month" to correct date range
    - Test: Resolves "last-3-months" to correct date range
    - Test: Resolves "this-year" to correct date range
    - Test: Resolves custom range to provided dates
    - Test: Generates correct labels for all presets
    - Test: Generates correct label for custom range
  - [ ] `useTimePeriod.test.ts`:
    - Test: Defaults to "this-month"
    - Test: Updates period on selection
    - Test: Resolves date range correctly
  - [ ] `TimePeriodSelector.test.tsx`:
    - Test: Renders current period label on trigger button
    - Test: Opens dropdown on click
    - Test: Shows all preset options
    - Test: Shows checkmark on selected preset
    - Test: Calls onSelect when preset clicked
    - Test: Opens custom range UI on "Custom Range..." click
    - Test: Validates custom range (start before end)
    - Test: Closes on Esc
    - Test: Keyboard navigable
  - [ ] `DashboardPage.test.tsx` (update existing):
    - Test: TimePeriodSelector is rendered
    - Test: Changing period updates displayed data

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Time Period State | React state in `useTimePeriod` hook | UI-only state, not persisted |
| Date Filtering | Dexie `.where('date').between()` | Indexed query, fast for 10k+ transactions |

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

### Dexie Date Filtering

Dexie supports indexed range queries on dates. The `transactions` table should have a `date` field indexed. Use:

```typescript
const { startDate, endDate } = resolvedRange
const transactions = useLiveQuery(
  () => dateRange
    ? db.transactions.where('date').between(startDate, endDate, true, true).toArray()
    : db.transactions.toArray(),
  [dateRange?.startDate, dateRange?.endDate]
)
```

The `between(lower, upper, includeLower, includeUpper)` method is inclusive on both ends when both flags are `true`.

### No Extra Date Library

Use native JavaScript `Date` for all date operations. No need for date-fns, dayjs, or luxon for this story. The date math is simple:
- `new Date(year, month, 1)` for first day of month
- `new Date(year, month + 1, 0)` for last day of month
- Compare with `>=` and `<=`

### Date Input Strategy

Use native `<input type="date">` for the custom range picker. Rationale:
- No extra dependency (no date picker library)
- Built-in accessibility (keyboard navigable, screen reader support)
- Sufficient for this use case (selecting a date range)
- Consistent with project philosophy of minimal dependencies
- If a richer calendar UI is needed later, shadcn has a Calendar component based on react-day-picker that can replace it

### Integration with Story 6.1

Story 6.1 created `useSpendingBreakdown` which currently shows ALL transactions. This story modifies it to accept an optional date range parameter. When no date range is provided, behavior is unchanged (shows all transactions). This ensures backward compatibility.

### Integration with Story 6.3 (Future)

Story 6.3 (Month-over-Month Comparison) will use the resolved date range from `useTimePeriod` to compute comparison data. The `resolveTimePeriod` utility makes it easy to get the "previous period" by shifting the date range back.

### Integration with Story 6.4 (Future)

Story 6.4 (Drill-Down to Transactions) will need to preserve the selected time period when navigating from dashboard to transactions. Consider storing the selected period in URL search params or passing via route state. For now, just manage it as React state within the dashboard.

### No Charting Library

Continue using CSS/Tailwind proportional bars from Story 6.1. No charting library needed for time period selection.

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `useSpendingBreakdown` | `src/features/dashboard/hooks/useSpendingBreakdown.ts` | Spending aggregation (modify, don't recreate) |
| `CategoryBreakdown` | `src/features/dashboard/components/CategoryBreakdown/` | Category display (unchanged) |
| `SpendingSummary` | `src/features/dashboard/components/SpendingSummary/` | Summary stats (unchanged) |
| `DashboardPage` | `src/features/dashboard/components/DashboardPage/` | Page composition (modify) |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |
| Popover | `src/components/ui/popover.tsx` | shadcn Popover for dropdown |
| Button | `src/components/ui/button.tsx` | Trigger button |
| Lucide icons | `lucide-react` | ChevronDown, Calendar, Check icons |

### Previous Story Intelligence

**Story 6.1 established:**
- Dashboard feature module at `src/features/dashboard/`
- `useSpendingBreakdown` hook querying all transactions via `useLiveQuery`
- `CategoryBreakdown` component rendering proportional bars
- `SpendingSummary` component rendering total stats
- `DashboardPage` composing the above
- Dashboard as the home route (`src/routes/index.tsx`)
- Category color palette from CSS custom properties
- `SpendingBreakdownItem` and `SpendingBreakdown` types
- Pattern: amounts formatted with `formatCurrency`, monospace font

### Git Intelligence

All recent commits are story creation commits. No implementation code deployed yet. Pattern: `feat(story): create story X-Y description`.

### Project Structure for This Story

```
src/
├── features/
│   └── dashboard/
│       ├── index.ts (modify - add new exports)
│       ├── types.ts (new or extend - TimePeriod types)
│       ├── utils/
│       │   ├── resolveTimePeriod.ts (new)
│       │   └── resolveTimePeriod.test.ts (new)
│       ├── hooks/
│       │   ├── useSpendingBreakdown.ts (modify - add dateRange param)
│       │   ├── useSpendingBreakdown.test.ts (modify - add date range tests)
│       │   ├── useTimePeriod.ts (new)
│       │   └── useTimePeriod.test.ts (new)
│       └── components/
│           ├── TimePeriodSelector/
│           │   ├── index.tsx (new)
│           │   └── TimePeriodSelector.test.tsx (new)
│           └── DashboardPage/
│               ├── index.tsx (modify - add TimePeriodSelector)
│               └── DashboardPage.test.tsx (modify - add period tests)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT duplicate Dexie data in React state -- use `useLiveQuery` directly
- DO NOT use `interface` -- use `type`
- DO NOT use default exports -- use named exports
- DO NOT create `__tests__/` directories -- co-locate tests
- DO NOT add a date picker library (date-fns, dayjs, react-day-picker) -- use native Date + native input
- DO NOT implement month-over-month comparison (that's Story 6.3)
- DO NOT implement drill-down click behavior (that's Story 6.4)
- DO NOT persist the selected time period to database -- it's UI-only state
- DO NOT filter transactions in JavaScript after fetching all -- use Dexie indexed `.where().between()` for performance

### Validation Checklist

Before marking complete:
- [ ] Time period selector renders on dashboard with current period label
- [ ] Quick presets work: This Month, Last Month, Last 3 Months, This Year
- [ ] Custom date range picker works with start/end date inputs
- [ ] Custom range validates start < end
- [ ] Dashboard data updates when period changes
- [ ] Category breakdown reflects only the selected period
- [ ] SpendingSummary reflects only the selected period
- [ ] Default period is "This Month"
- [ ] Period selector is keyboard navigable (arrows, Enter, Esc)
- [ ] Existing behavior (no date range = all transactions) is preserved
- [ ] Update is fast (<100ms UI response)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass
- [ ] `useLiveQuery` used with Dexie `.where().between()` for filtered queries
- [ ] No extra date libraries added

### References

- [Source: epics.md#Epic-6-Story-6.2-Time-Period-Selection]
- [Source: prd.md#FR30 - User can view spending for a selected time period (month, custom range)]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Frontend-Architecture - Dexie useLiveQuery]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Performance-Requirements]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: ux-design-specification.md#Empty-Loading-States]
- [Source: ux-design-specification.md#Visual-Design-Foundation]
- [Story 6.1: Spending Breakdown by Category - useSpendingBreakdown hook, dashboard structure]
- [Story 6.3: Month-over-Month Comparison - future consumer of date range]
- [Story 6.4: Drill-Down to Transactions - future consumer of date range]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
