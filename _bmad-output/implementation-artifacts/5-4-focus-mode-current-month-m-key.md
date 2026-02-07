# Story 5.4: Focus Mode - Current Month (M Key)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to quickly filter transactions to the current month**,
So that **I can focus on recent activity for my monthly review (FR27)**.

## Acceptance Criteria

1. **Given** I am on the Transactions page
   **When** I press `M`
   **Then** transactions are filtered to the current month only
   **And** the view title/breadcrumb shows "This Month" or the month name (e.g., "February 2026")
   **And** the sidebar shows "This Month" as active

2. **Given** I am in Month focus mode
   **When** I view the sidebar
   **Then** "M This Month" is highlighted
   **And** the transaction count for this month is shown

3. **Given** I am in Month focus mode
   **When** I press `M` again
   **Then** the filter is toggled off
   **And** I see all transactions

4. **Given** I am in Month focus mode
   **When** I press `U` (Unmatched)
   **Then** filters combine: unmatched transactions from this month
   **And** both modes are shown as active in the sidebar

5. **Given** I am in Month focus mode
   **When** I press `A` (All)
   **Then** all filters are cleared
   **And** I see all transactions

## Tasks / Subtasks

- [ ] Task 1: Extend FocusModeContext to support 'month' mode (AC: #1, #3)
  - [ ] Modify `src/context/FocusModeContext.tsx`
  - [ ] The `FocusMode` type already includes `'month'` (defined in Story 4.2 as `'all' | 'unmatched' | 'month' | 'subscriptions'`)
  - [ ] Add `currentMonthRange` computed value to context:
    ```typescript
    type FocusModeContextValue = {
      focusMode: FocusMode
      setFocusMode: (mode: FocusMode) => void
      toggleFocusMode: (mode: FocusMode) => void
      // New for Story 5.4
      currentMonthRange: { start: Date; end: Date }
      activeFilters: Set<FocusMode>  // Supports combined filters (month + unmatched)
    }
    ```
  - [ ] `currentMonthRange` computation:
    - `start`: First day of current month at 00:00:00
    - `end`: Last day of current month at 23:59:59.999
    - Recompute when month changes (edge case: app open across midnight on month boundary)
  - [ ] Support **combined filters** (AC: #4):
    - Maintain `activeFilters: Set<FocusMode>` instead of single `focusMode`
    - `toggleFocusMode('month')`: Adds/removes 'month' from active filters
    - `toggleFocusMode('unmatched')`: Adds/removes 'unmatched' from active filters
    - `toggleFocusMode('all')`: Clears all active filters (AC: #5)
    - Backward compatible: `focusMode` returns primary active filter or 'all' if empty
  - [ ] If Story 4.2 already implemented single-mode only, refactor to `Set<FocusMode>` for composability

- [ ] Task 2: Extend useFilteredTransactions for month filtering (AC: #1, #4)
  - [ ] Modify `src/features/transactions/hooks/useFilteredTransactions.ts`
  - [ ] Accept month range filter:
    ```typescript
    type FilterOptions = {
      unmatchedOnly?: boolean
      monthRange?: { start: Date; end: Date }
      // Existing filters from other stories...
    }
    ```
  - [ ] Month filter query using Dexie:
    ```typescript
    // Use compound index on 'date' field
    let query = db.transactions.orderBy('date')
    if (monthRange) {
      query = query.and(tx => tx.date >= monthRange.start && tx.date <= monthRange.end)
    }
    if (unmatchedOnly) {
      query = query.and(tx => !tx.merchantId && !tx.manualCategory)
    }
    ```
  - [ ] **Combined filter support (AC: #4):** When both month AND unmatched active:
    - Filter by date range AND unmatched status
    - Both conditions applied simultaneously
  - [ ] Use `useLiveQuery` so results update reactively

- [ ] Task 3: Create useCurrentMonthCount hook (AC: #2)
  - [ ] Create `src/hooks/useCurrentMonthCount.ts`
  - [ ] Create `src/hooks/useCurrentMonthCount.test.ts`
  - [ ] Implementation:
    ```typescript
    export const useCurrentMonthCount = (): number => {
      const { currentMonthRange } = useFocusMode()
      const count = useLiveQuery(
        () => db.transactions
          .where('date')
          .between(currentMonthRange.start, currentMonthRange.end, true, true)
          .count(),
        [currentMonthRange.start.getTime(), currentMonthRange.end.getTime()],
        0
      )
      return count ?? 0
    }
    ```
  - [ ] Efficient: uses Dexie indexed query on `date` field
  - [ ] Reactive: updates when transactions are added/removed

- [ ] Task 4: Add M key handler to keyboard navigation (AC: #1, #3, #5)
  - [ ] Modify `src/hooks/useKeyboardNavigation.ts`
  - [ ] Add M key case:
    ```typescript
    case 'm':
      e.preventDefault()
      toggleFocusMode('month')
      break
    ```
  - [ ] Add A key case for clearing all filters (AC: #5):
    ```typescript
    case 'a':
      e.preventDefault()
      toggleFocusMode('all')  // Clears all active filters
      break
    ```
  - [ ] Ensure M key is ignored when typing in input fields (existing guard from Story 3.2)
  - [ ] Ensure M works alongside existing U key (Story 4.2) and future S key (Story 5.5)

- [ ] Task 5: Update Sidebar to show month focus mode (AC: #2)
  - [ ] Modify `src/components/Layout/Sidebar.tsx`
  - [ ] Add "M This Month" item in Focus Modes section:
    ```
    Focus Modes
    ──────────
    U Unmatched (12)
    M This Month (47)    ← New
    S Subscriptions
    ```
  - [ ] Show current month transaction count from `useCurrentMonthCount`
  - [ ] Highlight state:
    - Active when `activeFilters.has('month')`
    - Support multiple highlights when combined (month + unmatched both active)
  - [ ] Click behavior: Same as pressing M key (toggle month filter)
  - [ ] Show "This Month" label (not dynamic month name, to keep it concise)

- [ ] Task 6: Update Breadcrumb for month focus mode (AC: #1)
  - [ ] Modify breadcrumb component (from Story 3.5, likely in `src/components/Layout/Header.tsx` or breadcrumb component)
  - [ ] When month focus active:
    - Show "Transactions > February 2026" (dynamic month name)
    - If combined with unmatched: "Transactions > February 2026 > Unmatched"
  - [ ] Format month name: Use `Intl.DateTimeFormat` for locale-aware month formatting
  - [ ] Breadcrumb segments are clickable:
    - Click "Transactions" clears all filters
    - Click month name clears only unmatched filter (keeps month)

- [ ] Task 7: Wire focus mode to TransactionList (AC: #1, #4)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] Read active filters from FocusModeContext
  - [ ] Pass filter options to `useFilteredTransactions`:
    ```typescript
    const { activeFilters, currentMonthRange } = useFocusMode()
    const transactions = useFilteredTransactions({
      unmatchedOnly: activeFilters.has('unmatched'),
      monthRange: activeFilters.has('month') ? currentMonthRange : undefined,
    })
    ```
  - [ ] Ensure J/K navigation, selection, and quick actions all work on filtered list
  - [ ] Empty state when no transactions in current month:
    - "No transactions this month"
    - CTA: "Import a statement" or "View all transactions"

- [ ] Task 8: Write tests (AC: all)
  - [ ] `useCurrentMonthCount.test.ts`:
    - Test: Returns correct count for current month transactions
    - Test: Excludes transactions from other months
    - Test: Updates reactively when transactions added/removed
    - Test: Returns 0 when no transactions exist
  - [ ] `FocusModeContext.test.tsx`:
    - Test: toggleFocusMode('month') adds 'month' to active filters
    - Test: toggleFocusMode('month') again removes 'month'
    - Test: toggleFocusMode('all') clears all active filters
    - Test: Combined filters: month + unmatched both active simultaneously
    - Test: currentMonthRange returns correct start/end dates
    - Test: currentMonthRange handles month boundary correctly
  - [ ] Integration tests:
    - Test: M key filters transactions to current month only
    - Test: M key again restores all transactions
    - Test: M + U combines: shows only unmatched from this month
    - Test: A key clears all filters when in combined mode
    - Test: Sidebar "M This Month" highlighted when month active
    - Test: Sidebar shows correct transaction count for current month
    - Test: Breadcrumb shows "Transactions > [Month Year]" when active
    - Test: Combined breadcrumb shows "Transactions > [Month] > Unmatched"
    - Test: Click sidebar "M This Month" toggles filter
    - Test: J/K navigation works on filtered transaction list
    - Test: Quick actions (R/C/F) work on filtered transactions
    - Test: M key ignored when typing in input field
    - Test: Empty state shown when no transactions in current month
    - Test: Selection cleared when focus mode changes (avoid stale selection)

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| UI State | React context | Focus mode is UI-only state, not persisted to Dexie |
| Filter Composition | `Set<FocusMode>` in context | Supports combined filters (month + unmatched) |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### This Story Extends FocusModeContext, NOT Creates New State

**CRITICAL: Reuse the FocusModeContext from Story 4.2.**

Story 4.2 created `FocusModeContext` at `src/context/FocusModeContext.tsx` with the `FocusMode` type already including `'month'`. This story activates the 'month' mode that was defined but not yet wired.

The key change is evolving from a single `focusMode` value to a `Set<FocusMode>` approach so filters can be combined (AC: #4 requires month + unmatched simultaneously).

### Combined Filter Design

**This is the novel aspect of Story 5.4** - focus modes are NOT mutually exclusive:

| Key Press | Behavior |
|-----------|----------|
| M (no active filters) | Activates month filter only |
| U (month active) | Adds unmatched filter → both active |
| M (month + unmatched active) | Removes month → unmatched only |
| U (month + unmatched active) | Removes unmatched → month only |
| A (any active) | Clears all → shows everything |

This means the sidebar can show multiple items highlighted simultaneously, and the transaction list applies all active filters as AND conditions.

### Date Range Computation

```typescript
const getMonthRange = (): { start: Date; end: Date } => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}
```

**Edge case:** If the app stays open across a month boundary (e.g., midnight Jan 31 → Feb 1), the filter should still work correctly. Consider recomputing `currentMonthRange` periodically or on visibility change.

### Dexie Query Optimization

The `date` field in the transactions table is indexed (from Story 1.2 schema). Use the index for efficient month range queries:

```typescript
// Efficient: Uses Dexie index on 'date'
db.transactions.where('date').between(start, end, true, true)

// For combined filters, chain with .and():
db.transactions
  .where('date').between(start, end, true, true)
  .and(tx => !tx.merchantId && !tx.manualCategory)
```

**Performance:** Dexie's `.between()` uses the B-tree index, so even with 10k+ transactions, the month filter query completes in <10ms. The `.and()` clause for unmatched is a JavaScript filter on the already-narrowed result set.

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `FocusModeContext` | `src/context/FocusModeContext.tsx` | Focus mode state management (extend for combined filters) |
| `useFocusMode` | `src/context/FocusModeContext.tsx` | Hook to access focus mode state |
| `useFilteredTransactions` | `src/features/transactions/hooks/useFilteredTransactions.ts` | Transaction filtering (extend for month range) |
| `useUnmatchedCount` | `src/hooks/useUnmatchedCount.ts` | Unmatched count in sidebar (reference pattern for month count) |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | Keyboard handler (add M and A keys) |
| `Sidebar` | `src/components/Layout/Sidebar.tsx` | Sidebar nav (add month focus mode item) |
| `TransactionList` | `src/features/transactions/components/TransactionList/index.tsx` | Transaction list (wire up filters) |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| TransactionRow | `src/components/TransactionRow/index.tsx` | Rows render the same regardless of filter |
| SelectionStatusBar | `src/components/SelectionStatusBar/index.tsx` | Selection works the same in filtered view |
| QuickCategoryPicker | `src/features/transactions/components/QuickCategoryPicker/` | Category picker unaffected by filters |
| MerchantAssignmentModal | `src/features/merchants/components/MerchantAssignmentModal/` | Modal unaffected by filters |
| InboxZeroEmpty | `src/components/InboxZeroEmpty/index.tsx` | Only shows in unmatched mode, not month mode |

### Previous Story Intelligence

**From Story 4.2 (Unmatched Transactions View - U Key):**
- Established `FocusModeContext` with `FocusMode` type: `'all' | 'unmatched' | 'month' | 'subscriptions'`
- `toggleFocusMode` function toggles between a mode and 'all'
- Sidebar shows unmatched count and highlighted state
- Breadcrumb shows "Transactions > Unmatched" when active
- **Key learning:** Story 5.4 may need to refactor `toggleFocusMode` from single-mode to multi-mode (Set-based) to support combined filters. This is a backward-compatible change if done carefully.

**From Story 3.2 (Keyboard Navigation with J/K):**
- `useKeyboardNavigation` hook handles all keyboard shortcuts
- Input field guard: events are ignored when target is `<input>`, `<textarea>`, or `contentEditable`
- J/K navigation works on whatever filtered list is displayed

**From Story 3.5 (Breadcrumb Navigation):**
- Breadcrumb component shows hierarchical location
- Segments are clickable for navigation
- Truncation for long paths

**From Story 5.1 (Multi-Select Transactions):**
- Selection state should be cleared when focus mode changes (user expectation)
- `multiSelect.clearSelection()` available
- Selection is independent of filtering

**From Story 4.8 (Cascade Animation Feedback):**
- Animations work on the visible (filtered) transaction list
- No special changes needed for month filter view

### Git Intelligence

Recent commits are all story creation commits (no implementation code yet). The pattern is `feat(story): create story X-Y description`. No implementation patterns to extract from git.

### Interaction with Other Focus Modes

The M key focus mode interacts with:

1. **U (Unmatched) from Story 4.2:** Can be combined (month + unmatched)
2. **S (Subscriptions) from Story 5.5:** Will be a placeholder in 5.5; future Epic 9 activates it. Should also support combination.
3. **A (All):** New in this story - clears all active filters

The `Set<FocusMode>` approach future-proofs for Story 5.5 and Epic 9 without requiring more refactoring later.

### Selection Behavior on Filter Change

**IMPORTANT:** When focus mode changes:
1. Clear current selection (`multiSelect.clearSelection()`)
2. Reset keyboard focus to first transaction in filtered list
3. This prevents stale selections referencing transactions not in the current view

### Empty State for Month Filter

When no transactions exist for the current month:
```
┌─────────────────────────────────┐
│                                 │
│     No transactions this month  │
│                                 │
│     Import a statement to see   │
│     your spending for           │
│     February 2026               │
│                                 │
│     [Import Statement]          │
│     [View All Transactions]     │
│                                 │
└─────────────────────────────────┘
```

The "View All Transactions" button presses A (clears all filters).

### Data Flow

```
User presses M key
  |
Keyboard handler calls toggleFocusMode('month')
  |
FocusModeContext adds 'month' to activeFilters Set
  |
TransactionList reads activeFilters from context
  |
useFilteredTransactions receives monthRange parameter
  |
Dexie query: db.transactions.where('date').between(start, end)
  |
useLiveQuery returns filtered transactions
  |
TransactionList renders only current month transactions
  |
Sidebar highlights "M This Month" with count badge
  |
Breadcrumb shows "Transactions > February 2026"
  |
multiSelect.clearSelection() clears any stale selection
  |
Focus resets to first transaction in filtered list
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| M key filter toggle | <100ms (instant UI response) |
| Month range query | <10ms (Dexie indexed query on `date`) |
| Count query | <10ms (Dexie indexed count) |
| Combined filter (month + unmatched) | <50ms |
| Sidebar count update | Automatic via `useLiveQuery` reactivity |

### Project Structure for This Story

```
src/
├── context/
│   └── FocusModeContext.tsx (modify - add combined filter support, currentMonthRange)
├── hooks/
│   ├── useKeyboardNavigation.ts (modify - add M and A key handlers)
│   ├── useCurrentMonthCount.ts (new)
│   └── useCurrentMonthCount.test.ts (new)
├── features/
│   └── transactions/
│       ├── hooks/
│       │   └── useFilteredTransactions.ts (modify - add monthRange filter)
│       └── components/
│           └── TransactionList/
│               └── index.tsx (modify - wire up month filter from context)
└── components/
    └── Layout/
        ├── Sidebar.tsx (modify - add M This Month with count)
        └── Header.tsx or Breadcrumb component (modify - show month name)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT create a separate component for month-filtered transactions - reuse TransactionList with filter params
- DO NOT duplicate Dexie data in React state for the filtered list
- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT store the month range in Dexie - it's UI-only state in context
- DO NOT make focus modes mutually exclusive - they must combine (month + unmatched)
- DO NOT forget to clear selection when focus mode changes
- DO NOT hardcode month names - use `Intl.DateTimeFormat` for proper localization
- DO NOT break existing U key behavior (must still work independently)
- DO NOT forget to reset keyboard focus to first item when filter changes

### Validation Checklist

Before marking complete:
- [ ] M key filters transactions to current month only
- [ ] M key again removes month filter (toggle)
- [ ] A key clears all active filters
- [ ] M + U combines: shows unmatched from current month only
- [ ] Sidebar shows "M This Month" with transaction count
- [ ] Sidebar highlights "M This Month" when active
- [ ] Sidebar supports multiple highlights (month + unmatched both active)
- [ ] Breadcrumb shows "Transactions > February 2026" when month active
- [ ] Combined breadcrumb: "Transactions > February 2026 > Unmatched"
- [ ] Click sidebar "M This Month" toggles filter (same as pressing M)
- [ ] J/K navigation works correctly on month-filtered list
- [ ] Quick actions (R/C/F) work on filtered transactions
- [ ] Selection cleared when focus mode changes
- [ ] Focus resets to first transaction when filter toggles
- [ ] Empty state when no transactions in current month
- [ ] M key ignored when typing in input fields
- [ ] Month range computation correct (first day to last day)
- [ ] Dexie indexed query used for date range (performance)
- [ ] U key still works independently (no regression)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-5-Story-5.4-Focus-Mode-Current-Month-M-Key]
- [Source: prd.md#FR27 - User can toggle focus modes (U=unmatched, M=current month, S=subscriptions)]
- [Source: architecture.md#Frontend-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#View-Modes]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: ux-design-specification.md#Sidebar-Navigation]
- [Story 4.2: Unmatched Transactions View - FocusModeContext, useFocusMode, toggleFocusMode, useFilteredTransactions]
- [Story 3.2: Keyboard Navigation with J/K - useKeyboardNavigation, keyboard event guards]
- [Story 3.5: Breadcrumb Navigation - breadcrumb component patterns]
- [Story 5.1: Multi-Select Transactions - useMultiSelect, clearSelection on filter change]
- [Story 5.3: Batch Category Assignment - batch operations in filtered view]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
