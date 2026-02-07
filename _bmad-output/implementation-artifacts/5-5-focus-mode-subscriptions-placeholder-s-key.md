# Story 5.5: Focus Mode - Subscriptions Placeholder (S Key)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **the S key to filter to subscription transactions**,
So that **I can review my recurring charges (FR27)**.

## Acceptance Criteria

1. **Given** I am on the Transactions page
   **When** I press `S`
   **Then** the view attempts to filter to subscriptions
   **And** since subscription detection is not yet implemented (Epic 9), a placeholder state appears

2. **Given** subscription detection is not yet available
   **When** I press `S`
   **Then** I see a message: "Subscription detection coming soon"
   **And** the filter activates but shows a placeholder empty state with explanation

3. **Given** I am in Subscriptions focus mode (placeholder)
   **When** I press `S` again or `A`
   **Then** the filter is cleared
   **And** I see all transactions (or previous filter state)

4. **Given** I am in Subscriptions focus mode
   **When** I view the sidebar
   **Then** "S Subscriptions" is highlighted as active

5. **Given** I am in another focus mode (e.g., Month)
   **When** I press `S`
   **Then** subscriptions mode is added to active filters (combined with existing)
   **And** the placeholder state appears (since no subscription data exists)

## Tasks / Subtasks

- [ ] Task 1: Add S key handler to keyboard navigation (AC: #1, #3)
  - [ ] Modify `src/hooks/useKeyboardNavigation.ts`
  - [ ] Add S key case:
    ```typescript
    case 's':
      e.preventDefault()
      toggleFocusMode('subscriptions')
      break
    ```
  - [ ] Ensure S key is ignored when typing in input fields (existing guard from Story 3.2)
  - [ ] S key should use the same `toggleFocusMode` mechanism as M and U keys
  - [ ] Verify S works alongside existing U key (Story 4.2) and M key (Story 5.4)

- [ ] Task 2: Create SubscriptionsPlaceholder component (AC: #2)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsPlaceholder/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionsPlaceholder/SubscriptionsPlaceholder.test.tsx`
  - [ ] Display placeholder content:
    ```
    ┌─────────────────────────────────┐
    │                                 │
    │     Subscription detection      │
    │     coming soon                 │
    │                                 │
    │     Import more statements to   │
    │     enable recurring charge     │
    │     detection.                  │
    │                                 │
    │     [View All Transactions]     │
    │                                 │
    └─────────────────────────────────┘
    ```
  - [ ] "View All Transactions" button calls `toggleFocusMode('all')` to clear filters
  - [ ] Use muted styling consistent with other empty states (InboxZeroEmpty pattern)
  - [ ] Include a Lucide icon (e.g., `CalendarClock` or `Repeat`) for visual interest

- [ ] Task 3: Wire subscriptions filter to TransactionList (AC: #1, #2, #5)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] When `activeFilters.has('subscriptions')`:
    - Check if subscription data exists (it won't yet)
    - If no subscription data: render `SubscriptionsPlaceholder` instead of empty transaction list
  - [ ] Logic:
    ```typescript
    const { activeFilters } = useFocusMode()

    if (activeFilters.has('subscriptions')) {
      // No subscription detection yet - show placeholder
      return <SubscriptionsPlaceholder />
    }
    ```
  - [ ] Combined filters: If subscriptions + month or subscriptions + unmatched are both active, subscriptions placeholder takes precedence (since there's no data to intersect with)

- [ ] Task 4: Update Sidebar to show subscriptions focus mode (AC: #4)
  - [ ] Modify `src/components/Layout/Sidebar.tsx`
  - [ ] The "S Subscriptions" item should already exist in the Focus Modes section (added in prior stories as a placeholder nav item)
  - [ ] Ensure highlight state: Active when `activeFilters.has('subscriptions')`
  - [ ] Click behavior: Same as pressing S key (toggle subscriptions filter)
  - [ ] No count badge needed (no subscription data yet)
  - [ ] Support multiple highlights when combined with other focus modes

- [ ] Task 5: Update Breadcrumb for subscriptions mode (AC: #1)
  - [ ] Modify breadcrumb component (from Story 3.5)
  - [ ] When subscriptions focus active:
    - Show "Transactions > Subscriptions"
    - If combined with month: "Transactions > February 2026 > Subscriptions"
    - If combined with unmatched: "Transactions > Subscriptions > Unmatched"
  - [ ] Breadcrumb segments are clickable:
    - Click "Transactions" clears all filters
    - Click "Subscriptions" keeps only subscriptions filter

- [ ] Task 6: Write tests (AC: all)
  - [ ] `SubscriptionsPlaceholder.test.tsx`:
    - Test: Renders placeholder message "Subscription detection coming soon"
    - Test: "View All Transactions" button clears all filters
    - Test: Renders with appropriate icon
  - [ ] Integration tests in TransactionList or keyboard navigation:
    - Test: S key activates subscriptions focus mode
    - Test: S key again deactivates subscriptions focus mode
    - Test: A key clears subscriptions filter
    - Test: Sidebar "S Subscriptions" highlighted when active
    - Test: Click sidebar "S Subscriptions" toggles filter
    - Test: Placeholder component shown when subscriptions filter active
    - Test: S key ignored when typing in input field
    - Test: S + M combined: placeholder still shown (subscriptions takes precedence)
    - Test: Breadcrumb shows "Transactions > Subscriptions" when active
    - Test: Selection cleared when focus mode changes to subscriptions

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| UI State | React context | Focus mode is UI-only state, not persisted to Dexie |
| Filter Composition | `Set<FocusMode>` in context | Supports combined filters (subscriptions + month + unmatched) |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### This Is a PLACEHOLDER Story

**CRITICAL: This story establishes the S key binding and UI structure only. Full subscription detection comes in Epic 9 (Story 9.1 + 9.2).**

The subscriptions focus mode has no data to filter against yet. When S is pressed:
1. The filter activates in the context (subscriptions is added to `activeFilters`)
2. Since there are no subscription-tagged transactions, the UI shows a placeholder component
3. The placeholder explains that subscription detection is coming soon
4. The user can dismiss by pressing S again or A

### FocusMode Type Already Includes 'subscriptions'

The `FocusMode` type was defined in Story 4.2 as `'all' | 'unmatched' | 'month' | 'subscriptions'`. Story 5.4 evolved this to use `Set<FocusMode>` for combined filter support. The 'subscriptions' value is already part of the type — this story simply wires it up with a placeholder UI.

### How Subscriptions Will Work in Epic 9

When Epic 9 is implemented:
1. Story 9.1 adds subscription detection algorithm
2. Story 9.2 replaces `SubscriptionsPlaceholder` with a real `SubscriptionsList` view
3. The S key binding and sidebar item from this story remain unchanged
4. The only change needed: TransactionList checks for subscription data and shows the real view instead of placeholder

This means the S key infrastructure built now is permanent — only the placeholder gets swapped out later.

### Combined Filter Behavior with Subscriptions

Since subscriptions has no data yet, combined filter behavior is simple:

| Active Filters | Result |
|---------------|--------|
| subscriptions only | Show SubscriptionsPlaceholder |
| subscriptions + month | Show SubscriptionsPlaceholder (no subscription data to intersect) |
| subscriptions + unmatched | Show SubscriptionsPlaceholder (same reason) |
| subscriptions + month + unmatched | Show SubscriptionsPlaceholder |

When Epic 9 adds real subscription data, the combined filter will properly intersect (e.g., subscriptions from this month).

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `FocusModeContext` | `src/context/FocusModeContext.tsx` | Focus mode state management with `Set<FocusMode>` |
| `useFocusMode` | `src/context/FocusModeContext.tsx` | Hook to access focus mode state |
| `toggleFocusMode` | `src/context/FocusModeContext.tsx` | Toggle a focus mode in the active set |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | Keyboard handler (add S key) |
| `Sidebar` | `src/components/Layout/Sidebar.tsx` | Sidebar nav (wire up S Subscriptions highlight) |
| `TransactionList` | `src/features/transactions/components/TransactionList/index.tsx` | Transaction list (add subscriptions placeholder) |
| `InboxZeroEmpty` | `src/components/InboxZeroEmpty/index.tsx` | Pattern reference for empty state styling |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| TransactionRow | `src/components/TransactionRow/index.tsx` | Rows not affected by subscriptions placeholder |
| SelectionStatusBar | `src/components/SelectionStatusBar/index.tsx` | Selection unaffected |
| QuickCategoryPicker | `src/features/transactions/components/QuickCategoryPicker/` | Unaffected |
| MerchantAssignmentModal | `src/features/merchants/components/MerchantAssignmentModal/` | Unaffected |
| useFilteredTransactions | `src/features/transactions/hooks/useFilteredTransactions.ts` | No changes needed — subscriptions placeholder bypasses filtering |

### Previous Story Intelligence

**From Story 5.4 (Focus Mode - Current Month M Key):**
- FocusModeContext now uses `Set<FocusMode>` for combined filter support
- `activeFilters` is a Set, `toggleFocusMode` adds/removes from the set
- M key handler pattern: `case 'm': toggleFocusMode('month')`
- A key clears all filters: `case 'a': toggleFocusMode('all')`
- Sidebar supports multiple highlighted focus mode items simultaneously
- Combined breadcrumbs: "Transactions > February 2026 > Unmatched"
- Selection is cleared when focus mode changes

**From Story 4.2 (Unmatched Transactions View - U Key):**
- Established FocusModeContext with `FocusMode` type including `'subscriptions'`
- U key handler pattern identical to what S key needs
- InboxZeroEmpty component pattern is reference for SubscriptionsPlaceholder styling

**From Story 3.2 (Keyboard Navigation with J/K):**
- Input field guard: events ignored when target is `<input>`, `<textarea>`, or `contentEditable`
- This guard applies to S key automatically

### Git Intelligence

Recent commits are all story creation commits (no implementation code yet). The pattern is `feat(story): create story X-Y description`. No implementation patterns to extract from git.

### Data Flow

```
User presses S key
  |
Keyboard handler calls toggleFocusMode('subscriptions')
  |
FocusModeContext adds 'subscriptions' to activeFilters Set
  |
TransactionList reads activeFilters from context
  |
activeFilters.has('subscriptions') → true
  |
Check for subscription data → none exists
  |
Render SubscriptionsPlaceholder component
  |
Sidebar highlights "S Subscriptions"
  |
Breadcrumb shows "Transactions > Subscriptions"
  |
multiSelect.clearSelection() clears any stale selection
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| S key filter toggle | <100ms (instant UI response) |
| Placeholder render | <16ms (simple component, no data queries) |
| Sidebar highlight update | Automatic via context reactivity |

### Project Structure for This Story

```
src/
├── hooks/
│   └── useKeyboardNavigation.ts (modify - add S key handler)
├── features/
│   ├── subscriptions/
│   │   └── components/
│   │       └── SubscriptionsPlaceholder/
│   │           ├── index.tsx (new)
│   │           └── SubscriptionsPlaceholder.test.tsx (new)
│   └── transactions/
│       └── components/
│           └── TransactionList/
│               └── index.tsx (modify - add subscriptions placeholder check)
└── components/
    └── Layout/
        ├── Sidebar.tsx (modify - wire up S Subscriptions highlight + click)
        └── Header.tsx or Breadcrumb component (modify - show "Subscriptions" segment)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT implement subscription detection logic — that is Epic 9
- DO NOT create a new FocusMode value — 'subscriptions' already exists in the type
- DO NOT duplicate existing toggle logic — reuse `toggleFocusMode` directly
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT forget to clear selection when focus mode changes to subscriptions
- DO NOT make the placeholder overly complex — keep it simple and focused
- DO NOT add subscription count to sidebar — there's no data yet
- DO NOT break existing M or U key behavior (must still work independently)

### Validation Checklist

Before marking complete:
- [ ] S key activates subscriptions focus mode
- [ ] S key again removes subscriptions filter (toggle)
- [ ] A key clears subscriptions filter
- [ ] Placeholder component shown with "Subscription detection coming soon" message
- [ ] "View All Transactions" button in placeholder clears all filters
- [ ] Sidebar shows "S Subscriptions" highlighted when active
- [ ] Sidebar supports multiple highlights (subscriptions + month both active)
- [ ] Click sidebar "S Subscriptions" toggles filter (same as pressing S)
- [ ] Breadcrumb shows "Transactions > Subscriptions" when active
- [ ] Combined breadcrumb works (e.g., "Transactions > February 2026 > Subscriptions")
- [ ] S key ignored when typing in input fields
- [ ] Selection cleared when focus mode changes
- [ ] M key still works independently (no regression)
- [ ] U key still works independently (no regression)
- [ ] A key clears all filters including subscriptions
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-5-Story-5.5-Focus-Mode-Subscriptions-Placeholder-S-Key]
- [Source: prd.md#FR27 - User can toggle focus modes (U=unmatched, M=current month, S=subscriptions)]
- [Source: architecture.md#Frontend-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#View-Modes]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: ux-design-specification.md#Sidebar-Navigation]
- [Story 5.4: Focus Mode - Current Month (M Key) - Combined filter support, Set<FocusMode>, activeFilters]
- [Story 4.2: Unmatched Transactions View - FocusModeContext, useFocusMode, toggleFocusMode]
- [Story 3.2: Keyboard Navigation with J/K - useKeyboardNavigation, keyboard event guards]
- [Story 3.5: Breadcrumb Navigation - breadcrumb component patterns]
- [Story 5.1: Multi-Select Transactions - clearSelection on filter change]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
