# Story 5.3: Batch Category Assignment

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to assign a category to multiple transactions at once without creating a merchant**,
So that **I can quickly categorize one-off transactions in bulk (FR18)**.

## Acceptance Criteria

1. **Given** I have 2+ transactions selected (via Shift+J/K or Space/X from Story 5.1)
   **When** I press `C`
   **Then** the quick category picker opens
   **And** it shows: "Categorize X transactions"

2. **Given** the category picker is open for batch
   **When** I select a category
   **Then** all selected transactions receive that category
   **And** transactions are NOT assigned to any merchant
   **And** a toast confirms: "X transactions -> [Category]" with Undo

3. **Given** some selected transactions already have categories
   **When** I apply a new category
   **Then** all selected transactions are updated to the new category
   **And** the toast indicates how many were changed

4. **Given** I complete a batch category assignment
   **When** the operation finishes
   **Then** selection is cleared
   **And** focus returns to the first previously-selected transaction

## Tasks / Subtasks

- [ ] Task 1: Extend QuickCategoryPicker for batch mode (AC: #1)
  - [ ] Modify `src/features/transactions/components/QuickCategoryPicker/index.tsx`
  - [ ] Add batch mode props:
    ```typescript
    type QuickCategoryPickerProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      onCategorySelect: (categoryId: string, subcategoryId?: string) => void
      anchorElement?: HTMLElement | null
      // Batch mode (new)
      batchCount?: number  // When > 0, shows "Categorize X transactions" header
    }
    ```
  - [ ] Detect batch mode: `batchCount && batchCount > 1`
  - [ ] Batch mode header: "Categorize {count} transactions"
  - [ ] Keep existing single-transaction mode working (no regression)
  - [ ] Same category search, keyboard navigation, and selection behavior in both modes

- [ ] Task 2: Create batch category assignment service (AC: #2, #3)
  - [ ] Create `src/features/transactions/services/batchCategoryAssign.ts`
  - [ ] Create `src/features/transactions/services/batchCategoryAssign.test.ts`
  - [ ] Types:
    ```typescript
    type BatchCategoryAssignParams = {
      transactionIds: string[]
      categoryId: string
      subcategoryId?: string
    }

    type BatchCategoryAssignResult = {
      affectedCount: number
      changedCount: number  // How many actually changed (some may already have same category)
      previousStates: Array<{
        id: string
        categoryId: string | null
        subcategoryId: string | null
        merchantId: string | null
        manualCategory: boolean
      }>
    }
    ```
  - [ ] Implementation:
    1. Fetch current state of all target transactions from Dexie (for undo)
    2. Use `db.transaction('rw', db.transactions, ...)` for atomicity
    3. Bulk update all transactions:
       - Set `categoryId` to selected category
       - Set `subcategoryId` if provided
       - Set `manualCategory = true`
       - Clear `merchantId` (manual category overrides merchant assignment)
    4. Compute `changedCount` (transactions where category actually changed)
    5. Return result with previous states for undo
  - [ ] Reuse `assignManualCategory` pattern from Story 4.7 `src/features/transactions/services/transactionOperations.ts`
  - [ ] Performance: Must handle up to 100 transactions efficiently via bulk operations

- [ ] Task 3: Implement batch category undo (AC: #2)
  - [ ] Extend undo system (from `src/context/UndoContext.tsx` or `src/hooks/useUndo.ts`)
  - [ ] Batch undo action type:
    ```typescript
    type BatchCategoryUndoAction = {
      type: 'batch-assign-category'
      previousStates: Array<{
        id: string
        categoryId: string | null
        subcategoryId: string | null
        merchantId: string | null
        manualCategory: boolean
      }>
    }
    ```
  - [ ] Undo logic:
    1. Restore all affected transactions to their previous states
    2. Use `db.transaction('rw', ...)` for atomicity
    3. Bulk update each transaction to its previous `categoryId`, `subcategoryId`, `merchantId`, `manualCategory`
  - [ ] Toast: "X transactions -> [Category Name]" with Undo button, 10-second window

- [ ] Task 4: Wire C key to batch mode (AC: #1, #4)
  - [ ] Modify keyboard handler (in `src/hooks/useKeyboardNavigation.ts` or transaction list keyboard logic)
  - [ ] When `C` is pressed:
    - If `multiSelect.selectionCount > 1`: Open QuickCategoryPicker in batch mode with `batchCount={selectionCount}`
    - If `multiSelect.selectionCount <= 1`: Open QuickCategoryPicker in single mode (existing Story 4.7 behavior)
  - [ ] Batch `onCategorySelect` callback:
    1. Collect selected transaction IDs from `multiSelect.selectedIds`
    2. Call `batchCategoryAssign({ transactionIds, categoryId, subcategoryId })`
    3. Show toast with Undo
    4. Call `multiSelect.clearSelection()`
    5. Return focus to first previously-selected transaction

- [ ] Task 5: Handle focus return after batch operation (AC: #4)
  - [ ] Before clearing selection, capture the first selected transaction ID
  - [ ] After clear:
    1. Set keyboard focus to that transaction (if still visible in list)
    2. If not visible (e.g., filtered out in Unmatched view), focus first visible transaction
  - [ ] Ensure cascade animation (from Story 4.8) plays for newly categorized transactions
  - [ ] If undo is triggered: transactions revert, selection is NOT restored

- [ ] Task 6: Handle already-categorized transactions in batch (AC: #3)
  - [ ] When batch includes transactions that already have the selected category:
    - Still apply the category to all (idempotent)
    - Toast shows: "X transactions -> [Category]" (total count, not just changed)
    - Internally track `changedCount` for undo optimization
  - [ ] When batch includes merchant-assigned transactions:
    - Override: set `manualCategory = true`, clear `merchantId`
    - No additional warning needed (batch is intentional)
    - Undo restores original merchant assignments

- [ ] Task 7: Write tests (AC: all)
  - [ ] `batchCategoryAssign.test.ts`:
    - Test: Batch assign category to 5 uncategorized transactions
    - Test: Batch assign updates transactions with existing categories
    - Test: Batch assign overrides merchant-assigned categories (clears merchantId)
    - Test: `changedCount` correctly counts only transactions that actually changed
    - Test: Undo restores all transactions to previous state (including merchantId)
    - Test: Dexie transaction atomicity - partial failure rolls back
    - Test: Empty transaction list handles gracefully
    - Test: `manualCategory` set to true for all assigned transactions
  - [ ] Integration tests:
    - Test: C key with 2+ selected opens batch category picker
    - Test: C key with 1 selected opens single picker (no regression)
    - Test: Batch picker shows "Categorize X transactions" header
    - Test: Selecting category updates all selected transactions
    - Test: Toast shows correct count with Undo
    - Test: Undo restores all transactions
    - Test: Selection cleared after batch assignment
    - Test: Focus returns to first previously-selected transaction
    - Test: Cascade animation triggers for categorized transactions
    - Test: Transactions removed from Unmatched view after batch categorization

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| UI State | React context or minimal Zustand | Selection is UI-only state |
| Validation | Zod schemas for runtime validation | Validate category IDs before saving |
| Undo/Redo | Command pattern with action queue | 10-second toast undo window |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### This Story Extends QuickCategoryPicker, NOT Creates a New Component

**CRITICAL: Reuse the QuickCategoryPicker from Story 4.7.**

Story 4.7 created the single-transaction category picker at `src/features/transactions/components/QuickCategoryPicker/index.tsx`. This story adds batch mode to that same component, similar to how Story 5.2 extended MerchantAssignmentModal for batch merchant assignment.

The picker from 4.7 already supports:
- Category search and filtering via shadcn Command (cmdk)
- Keyboard navigation (arrow keys, Enter, Esc)
- Subcategory selection with "Category > Subcategory" format
- Category data from `useLiveQuery` via `useCategories` hook

Story 5.3 adds **batch awareness** only:
- Header text changes: "Categorize X transactions"
- `onCategorySelect` callback handles bulk assignment instead of single

### Reuse Pattern: Single vs Batch (Same as 5.2)

| C Key (Single - Story 4.7) | C Key (Batch - Story 5.3) |
|----------------------------|---------------------------|
| Opens for 1 focused transaction | Opens for 2+ selected transactions |
| `assignManualCategory(txId, catId)` | `batchCategoryAssign({ txIds, catId })` |
| Toast: "Categorized as [Cat]" | Toast: "X transactions -> [Cat]" |
| Focus stays on row | Selection cleared, focus to first |

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `assignManualCategory` | `src/features/transactions/services/transactionOperations.ts` | Single-transaction category assignment (reference for batch logic) |
| `QuickCategoryPicker` | `src/features/transactions/components/QuickCategoryPicker/index.tsx` | Category picker UI (extend for batch header) |
| `useQuickCategoryAssign` | `src/features/transactions/hooks/useQuickCategoryAssign.ts` | Single-transaction assignment hook (reference pattern) |
| `CategoryPicker` | `src/components/CategoryPicker/index.tsx` | Core category picker (used by QuickCategoryPicker) |
| `CategoryBadge` | `src/components/CategoryBadge/index.tsx` | Category display badge |
| `useCategories` | `src/hooks/useCategories.ts` | Category data access hook |
| `useMultiSelect` | `src/hooks/useMultiSelect.ts` | Multi-select state management |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| CategoryPicker | `src/components/CategoryPicker/index.tsx` | Core picker works for batch too |
| CategoryBadge | `src/components/CategoryBadge/index.tsx` | Already displays category on rows |
| SelectionStatusBar | `src/components/SelectionStatusBar/index.tsx` | Already shows "[C] Category" hint |
| TransactionRow | `src/components/TransactionRow/index.tsx` | Already handles `manualCategory` badge |

### Previous Story Intelligence

**From Story 5.1 (Multi-Select Transactions):**
- `useMultiSelect` hook at `src/hooks/useMultiSelect.ts` provides:
  - `selectedIds: Set<string>` - currently selected transaction IDs
  - `selectionCount: number` - count of selected
  - `clearSelection()` - clears all selections
  - `isSelected(id)` - O(1) check
- `SelectionStatusBar` at `src/components/SelectionStatusBar/index.tsx`:
  - Already shows "[C] Category" hint when selection active
  - This story makes that hint functional
- Selection cleared on Esc or plain J/K navigation

**From Story 5.2 (Batch Merchant Assignment):**
- Established the pattern for batch operations:
  - Detect selection count in keyboard handler
  - Branch between single and batch mode
  - Capture previous states for undo
  - Use Dexie transaction for atomic bulk writes
  - Toast with batch-specific messaging
  - Clear selection after operation
  - Focus return to first selected transaction
- `batchAssignMerchant` at `src/features/merchants/services/batchAssignMerchant.ts`:
  - Reference implementation for batch Dexie operations
  - Undo pattern with previous state capture
  - Atomic transaction approach

**From Story 4.7 (Quick Category Assignment - C Key):**
- QuickCategoryPicker component already working for single transactions
- `useQuickCategoryAssign` hook pattern
- `assignManualCategory` service function
- `manualCategory: true` flag on transactions
- Undo with previous state restoration
- Unmatched view filter updated: `!tx.merchantId && !tx.manualCategory`

**From Story 4.8 (Cascade Animation):**
- When batch category assigns transactions, cascade animation should trigger
- `useReducedMotion` hook respects `prefers-reduced-motion`
- Animation staggered (50ms per row, max 10 animated)
- Unmatched counter animates down
- Happens automatically via Dexie `useLiveQuery` reactivity + existing animation hooks

### Interaction with Unmatched View

When batch category assignment completes:
1. All affected transactions get `manualCategory = true`
2. Unmatched filter query `(!tx.merchantId && !tx.manualCategory)` excludes them
3. If user is in Unmatched view, transactions animate out (cascade from 4.8)
4. Unmatched counter in sidebar decrements
5. If all become matched: "Inbox Zero" celebration state appears

### Data Flow

```
User selects 5 transactions with Shift+J/K
  |
User presses C
  |
Keyboard handler detects selection count > 1
  |
Open QuickCategoryPicker with batchCount={5}
  |
Picker shows "Categorize 5 transactions" header
  |
User searches/selects category (e.g., "Dining > Restaurants")
  |
batchCategoryAssign() runs in Dexie transaction:
  1. Fetch previous states for all 5 transactions
  2. Bulk update: categoryId, subcategoryId, manualCategory=true, merchantId=null
  3. Return result with changedCount + previous states
  |
Toast: "5 transactions -> Dining > Restaurants" [Undo]
  |
clearSelection() called
  |
Focus returns to first previously-selected transaction
  |
Cascade animation plays on affected rows
  |
Unmatched counter animates down (if applicable)
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Picker open | <100ms after C key press |
| Batch assignment | <500ms for 100 transactions |
| Undo | <500ms to restore all transactions |
| UI update | Automatic via `useLiveQuery` reactivity |

Batch operations use `db.transactions.bulkPut()` or individual `update()` calls within a Dexie transaction. For 100 transactions, bulk operations in Dexie are fast (<100ms typically).

### Project Structure for This Story

```
src/
├── features/
│   └── transactions/
│       ├── components/
│       │   └── QuickCategoryPicker/
│       │       └── index.tsx (modify - add batchCount prop and header)
│       └── services/
│           ├── batchCategoryAssign.ts (new)
│           └── batchCategoryAssign.test.ts (new)
├── hooks/
│   └── useKeyboardNavigation.ts (modify - C key checks selection count)
└── components/
    └── SelectionStatusBar/
        └── index.tsx (no change - already shows C hint)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT create a separate `BatchCategoryPicker` component - extend the existing `QuickCategoryPicker`
- DO NOT duplicate Dexie data in React state
- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT store batch results in React state - commit to Dexie immediately
- DO NOT forget to handle undo for the entire batch operation atomically
- DO NOT break single-transaction C key flow (must still work when 0-1 selected)
- DO NOT create merchant when using batch C key (that's batch R key's job from Story 5.2)
- DO NOT trigger rule engine for manual category assignments

### Validation Checklist

Before marking complete:
- [ ] C key with 2+ selected opens batch category picker
- [ ] C key with 0-1 selected opens single picker (no regression from Story 4.7)
- [ ] Batch picker shows "Categorize X transactions"
- [ ] Selecting category updates all selected transactions
- [ ] All transactions get `manualCategory: true`
- [ ] All transactions get `merchantId: null` (manual overrides merchant)
- [ ] Transactions removed from Unmatched view
- [ ] Toast shows "X transactions -> [Category]" with Undo
- [ ] Undo restores ALL transactions to previous state (including merchantId)
- [ ] Selection cleared after assignment
- [ ] Focus returns to first previously-selected transaction
- [ ] Cascade animation plays on affected rows
- [ ] Unmatched counter updates
- [ ] Dexie transaction atomicity for batch writes
- [ ] Transactions already having same category handled gracefully
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-5-Story-5.3-Batch-Category-Assignment]
- [Source: prd.md#FR18 - User can apply a category to multiple selected transactions at once]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Frontend-Architecture]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Batch-Operations]
- [Source: ux-design-specification.md#Quick-Actions]
- [Story 5.1: Multi-Select Transactions (Shift+J/K) - useMultiSelect hook, SelectionStatusBar]
- [Story 5.2: Batch Merchant Assignment - batch operation pattern, Dexie transaction, undo]
- [Story 4.7: Quick Category Assignment (C Key) - QuickCategoryPicker, useQuickCategoryAssign, assignManualCategory]
- [Story 4.1: Category System Setup - CategoryPicker, CategoryBadge, useCategories, category data model]
- [Story 4.8: Cascade Animation Feedback - animation patterns, useReducedMotion]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
