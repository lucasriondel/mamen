# Story 4.7: Quick Category Assignment (C Key)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to assign a category directly to a transaction without creating a merchant**,
So that **I can handle one-off transactions quickly (FR16)**.

## Acceptance Criteria

1. **Given** I have focused a transaction
   **When** I press `C`
   **Then** a quick category picker appears
   **And** it's a searchable dropdown of all categories

2. **Given** the category picker is open
   **When** I type to search
   **Then** categories are filtered by name
   **And** I can use ↑↓ to navigate and Enter to select

3. **Given** I select a category
   **When** I confirm the selection
   **Then** the transaction is assigned that category
   **And** the transaction is NOT assigned to any merchant
   **And** a toast confirms: "Categorized as [Category]" with Undo

4. **Given** a transaction has a category but no merchant
   **When** I view the transaction
   **Then** it shows the category badge
   **And** it's considered "matched" (not in Unmatched view)
   **And** it shows "Manual" or similar to indicate no rule

## Tasks / Subtasks

- [x] Task 1: Create QuickCategoryPicker component (AC: #1, #2)
  - [x] Create `src/features/transactions/components/QuickCategoryPicker/index.tsx`
  - [x] Create `src/features/transactions/components/QuickCategoryPicker/QuickCategoryPicker.test.tsx`
  - [x] Use shadcn `Command` (cmdk) component as base for searchable dropdown
  - [x] Props type:
    ```typescript
    type QuickCategoryPickerProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      onCategorySelect: (categoryId: string, subcategoryId?: string) => void
      anchorElement?: HTMLElement | null // For positioning near focused transaction
    }
    ```
  - [x] Load categories and subcategories via `useLiveQuery` from Dexie
  - [x] Display categories grouped with subcategories nested
  - [x] Category format: "Category > Subcategory" for display
  - [x] Searchable: filter by category name or subcategory name
  - [x] Keyboard navigation: ↑↓ to navigate, Enter to select, Esc to close
  - [x] Named exports only, use `type` not `interface`

- [x] Task 2: Implement category search and filtering (AC: #2)
  - [x] Fuzzy search implementation for category names
  - [x] Search should match:
    - Category name: "Shop" matches "Shopping"
    - Subcategory name: "Online" matches "Shopping > Online"
    - Combined: "shop online" matches "Shopping > Online"
  - [x] Case-insensitive matching
  - [x] Highlight matching text in results (optional enhancement)
  - [x] Show "No categories match" empty state when search has no results
  - [x] Search input auto-focused when picker opens

- [x] Task 3: Implement keyboard navigation in picker (AC: #2)
  - [x] ↑/↓ arrow keys navigate between category options
  - [x] Enter selects the highlighted category
  - [x] Esc closes picker without selection
  - [x] Tab moves between search input and category list
  - [x] Focus ring visible on highlighted option
  - [x] Scroll list to keep highlighted item visible
  - [x] First item highlighted by default when opening

- [x] Task 4: Add C key handler to TransactionRow (AC: #1)
  - [x] Modify `src/components/TransactionRow/index.tsx` or equivalent
  - [x] Add keyboard event handler for 'c' key when row is focused
  - [x] Prevent C key action when:
    - User is typing in an input field
    - Modal is already open
    - Multiple transactions are selected (handled by batch story 5.3)
  - [x] Open QuickCategoryPicker positioned near the focused transaction
  - [x] Pass transaction data to picker for context

- [x] Task 5: Wire C key into keyboard navigation context (AC: #1)
  - [x] Update `src/hooks/useKeyboardNavigation.ts` or keyboard context
  - [x] Add 'c' to the list of handled keys
  - [x] Ensure C key only fires when:
    - A transaction is focused (not just the list)
    - Not in edit mode or other modal
  - [x] Coordinate with existing R key (merchant) and F key (refund) handlers
  - [x] Integration with existing keyboard state machine

- [x] Task 6: Create useQuickCategoryAssign hook (AC: #3)
  - [x] Create `src/features/transactions/hooks/useQuickCategoryAssign.ts`
  - [x] Create `src/features/transactions/hooks/useQuickCategoryAssign.test.ts`
  - [x] Hook interface:
    ```typescript
    export const useQuickCategoryAssign = () => {
      return {
        assignCategory: (
          transactionId: string,
          categoryId: string,
          subcategoryId?: string
        ) => Promise<void>,
        isAssigning: boolean,
        error: Error | null,
      }
    }
    ```
  - [x] Implementation:
    - Update transaction in Dexie with categoryId and subcategoryId
    - Do NOT set merchantId (key difference from R key flow)
    - Set `manualCategory: true` flag on transaction
    - Return success/failure for toast handling
  - [x] Named exports only

- [x] Task 7: Implement manual category assignment in Dexie (AC: #3)
  - [x] Update transaction type if needed:
    ```typescript
    type Transaction = {
      // ... existing fields
      categoryId: string | null
      subcategoryId: string | null
      merchantId: string | null
      manualCategory: boolean // true = C key, false = rule-assigned
    }
    ```
  - [x] Create `assignManualCategory` function:
    ```typescript
    // src/features/transactions/services/transactionOperations.ts
    export const assignManualCategory = async (
      transactionId: string,
      categoryId: string,
      subcategoryId?: string
    ): Promise<{
      previousCategoryId: string | null
      previousSubcategoryId: string | null
    }>
    ```
  - [x] Store previous values for undo capability
  - [x] Clear merchantId if transaction previously had one (manual overrides rule)

- [x] Task 8: Implement undo for quick category assignment (AC: #3)
  - [x] Use existing undo context/pattern from project
  - [x] Store previous state:
    ```typescript
    type CategoryUndoState = {
      transactionId: string
      previousCategoryId: string | null
      previousSubcategoryId: string | null
      previousMerchantId: string | null
      previousManualCategory: boolean
    }
    ```
  - [x] On undo: restore all previous values
  - [x] Toast with "Undo" action button, 10-second window
  - [x] Toast format: "Categorized as Shopping > Online" [Undo]

- [x] Task 9: Update transaction display for manual categories (AC: #4)
  - [x] Modify TransactionRow to show "Manual" indicator when `manualCategory: true`
  - [x] Display options:
    - Small "Manual" badge next to category
    - Or: Tooltip on category badge: "Manually assigned (no rule)"
    - Or: Different badge styling (e.g., dashed border)
  - [x] Consistent with design system (shadcn Badge component)
  - [x] UX spec preference: subtle indicator, not distracting

- [x] Task 10: Update Unmatched view filter logic (AC: #4)
  - [x] Modify unmatched transactions query
  - [x] Transaction is "matched" (not unmatched) if:
    - `merchantId` is set (rule-assigned), OR
    - `manualCategory: true` (C key assigned)
  - [x] Update sidebar unmatched count accordingly
  - [x] Update Dexie query in unmatched transactions hook:
    ```typescript
    // Transaction is unmatched if:
    // - No merchantId AND
    // - manualCategory is false (or not set)
    const unmatched = await db.transactions
      .filter(tx => !tx.merchantId && !tx.manualCategory)
      .toArray()
    ```

- [x] Task 11: Handle edge cases (AC: all)
  - [x] Transaction already has a category (update vs. confirm)
    - If transaction already categorized: show current category highlighted
    - Allow user to change category (update operation)
  - [x] Transaction has a merchant-assigned category:
    - Show warning: "This will override the rule-based category"
    - Or: Require explicit confirmation
    - On confirm: set manualCategory=true, clear merchantId
  - [x] Category picker with empty categories database:
    - Show message: "No categories available. Set up categories first."
    - Link to settings or category management

- [x] Task 12: Integrate with TransactionList keyboard flow (AC: #1)
  - [x] Ensure C key works in conjunction with J/K navigation
  - [x] Flow: Navigate with J/K → Press C → Picker opens → Select → Continue
  - [x] After category selection:
    - Close picker
    - Return focus to transaction row
    - Show success toast
    - Transaction row updates with new category badge

- [x] Task 13: Add QuickCategoryPicker positioning (AC: #1)
  - [x] Position picker near the focused transaction row
  - [x] Use Radix UI Popover positioning or shadcn Popover
  - [x] Fallback positioning if near viewport edge
  - [x] Consider using Command palette style (centered) vs. inline popover
  - [x] UX decision: Recommend centered command-style for consistency with Cmd+K

- [x] Task 14: Style QuickCategoryPicker (AC: #1, #2)
  - [x] Follow shadcn/ui Command component styling
  - [x] Dark theme compatible (hsl colors from design system)
  - [x] Search input at top with magnifier icon
  - [x] Category list with proper spacing (40px item height per UX spec)
  - [x] Subtle scroll when list is long
  - [x] Selected/highlighted state with ring color
  - [x] Category badges with proper colors

- [x] Task 15: Export new components from feature module
  - [x] Update `src/features/transactions/index.ts`:
    ```typescript
    // Components
    export { QuickCategoryPicker } from './components/QuickCategoryPicker'

    // Hooks
    export { useQuickCategoryAssign } from './hooks/useQuickCategoryAssign'

    // Services
    export { assignManualCategory } from './services/transactionOperations'
    ```
  - [x] Named exports only

- [x] Task 16: Write integration tests (AC: all)
  - [x] Test: C key opens QuickCategoryPicker when transaction focused
  - [x] Test: Search filters categories correctly
  - [x] Test: Arrow key navigation works in category list
  - [x] Test: Enter selects highlighted category
  - [x] Test: Esc closes picker without changes
  - [x] Test: Selecting category updates transaction in Dexie
  - [x] Test: Transaction marked as manualCategory: true
  - [x] Test: Transaction no longer appears in unmatched view
  - [x] Test: Toast shows "Categorized as [Category]" with Undo
  - [x] Test: Undo restores previous category state
  - [x] Test: Manual badge appears on manually categorized transactions
  - [x] Test: C key on transaction with merchant category shows override warning

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Validation | Zod schemas | Runtime validation for user input |
| Undo/Redo | Command pattern | Fits 10-second toast undo UX |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |
| Hooks | camelCase with `use` prefix |

### Previous Story Intelligence (Story 4.6)

**From Story 4.6 - Rules View Implementation:**

The Story 4.6 established patterns for:
- Rule management with undo capability
- Transaction re-evaluation flows
- Using `useLiveQuery` for reactive data
- Toast notifications with Undo action

**Key patterns to reuse:**
- Undo state management pattern
- Toast notification integration
- Keyboard navigation patterns from rules list

### Related Component Patterns

**From Story 4.3 (Merchant Assignment Modal):**

The R key flow established the merchant assignment modal. The C key flow should feel similar but simpler:

| R Key (Merchant) | C Key (Category) |
|------------------|------------------|
| Creates/assigns merchant + rule | Just assigns category |
| Complex modal with pattern input | Simple searchable picker |
| Sets merchantId + categoryId | Sets categoryId + manualCategory flag |
| Triggers rule engine | No rule engine |

**From Story 4.1 (Category System):**

Categories seeded from Story 4.1:
```typescript
// Default categories from Story 4.1
const categories = [
  { id: 'shopping', name: 'Shopping', subcategories: ['Online', 'Groceries', 'Clothing', 'Electronics', 'Other'] },
  { id: 'dining', name: 'Dining', subcategories: ['Restaurants', 'Coffee', 'Fast Food', 'Delivery'] },
  { id: 'transportation', name: 'Transportation', subcategories: ['Rideshare', 'Public Transit', 'Gas', 'Parking'] },
  { id: 'subscriptions', name: 'Subscriptions', subcategories: ['Streaming', 'Software', 'Memberships'] },
  { id: 'housing', name: 'Housing', subcategories: ['Rent', 'Utilities', 'Insurance', 'Maintenance'] },
  { id: 'health', name: 'Health', subcategories: ['Medical', 'Pharmacy', 'Fitness'] },
  { id: 'entertainment', name: 'Entertainment', subcategories: ['Events', 'Games', 'Hobbies'] },
  { id: 'travel', name: 'Travel', subcategories: ['Flights', 'Hotels', 'Activities'] },
  { id: 'income', name: 'Income', subcategories: ['Salary', 'Freelance', 'Refunds', 'Other'] },
  { id: 'other', name: 'Other', subcategories: ['Uncategorized'] },
]
```

### UX Flow Specification

**Source: [ux-design-specification.md#Quick-Actions]**

```
User Journey:
1. User navigates to transaction with J/K
2. Transaction is focused (visible focus ring)
3. User presses C
4. QuickCategoryPicker appears (centered, command-palette style)
5. User types to filter categories (fuzzy search)
6. User navigates with ↑↓ or continues typing
7. User presses Enter to select
8. Picker closes
9. Transaction shows category badge
10. Toast: "Categorized as Shopping > Online" [Undo]
11. Focus returns to transaction row
```

**Keyboard Flow:**
```
J/K → Navigate to transaction
C   → Open QuickCategoryPicker
     → Type to search: "shop"
     → ↓ key: navigate to "Shopping > Online"
     → Enter: select category
     → (Transaction categorized)
J/K → Continue to next transaction
```

### Project Structure for This Story

```
src/
├── features/
│   └── transactions/
│       ├── components/
│       │   ├── TransactionRow/
│       │   │   └── index.tsx (modify - add C key handler)
│       │   ├── TransactionList/
│       │   │   └── index.tsx (modify - wire keyboard context)
│       │   └── QuickCategoryPicker/
│       │       ├── index.tsx (new)
│       │       └── QuickCategoryPicker.test.tsx (new)
│       ├── hooks/
│       │   ├── useQuickCategoryAssign.ts (new)
│       │   ├── useQuickCategoryAssign.test.ts (new)
│       │   └── useUnmatchedTransactions.ts (modify - update filter)
│       ├── services/
│       │   └── transactionOperations.ts (modify - add assignManualCategory)
│       └── index.ts (update exports)
├── hooks/
│   └── useKeyboardNavigation.ts (modify - add C key)
├── lib/
│   └── db/
│       └── schema.ts (verify manualCategory field exists)
└── types/
    └── transaction.types.ts (verify manualCategory field)
```

### Data Model Updates

**Transaction type should include:**

```typescript
type Transaction = {
  id: string
  accountId: string
  date: Date
  amount: number
  rawMerchantString: string // Original from bank statement

  // Categorization (one of these scenarios)
  merchantId: string | null      // Set by R key / rule engine
  categoryId: string | null      // Set by merchant default, rule override, or C key
  subcategoryId: string | null   // Set by merchant default, rule override, or C key
  manualCategory: boolean        // true = C key assigned, false = rule-based

  // Metadata
  createdAt: Date
  updatedAt: Date
}
```

**Categorization Scenarios:**

| Scenario | merchantId | categoryId | manualCategory |
|----------|------------|------------|----------------|
| Unmatched | null | null | false |
| Rule-matched | "merch_123" | "cat_shopping" | false |
| C key assigned | null | "cat_dining" | true |
| C key override | null | "cat_dining" | true |

### Query Updates for Unmatched View

**Current unmatched query (needs update):**
```typescript
// Before: Only checks merchantId
const unmatched = await db.transactions
  .filter(tx => !tx.merchantId)
  .toArray()

// After: Check both merchantId AND manualCategory
const unmatched = await db.transactions
  .filter(tx => !tx.merchantId && !tx.manualCategory)
  .toArray()
```

### Component Composition

**QuickCategoryPicker uses:**
- shadcn `Command` component (cmdk-based)
- shadcn `CommandInput` for search
- shadcn `CommandList`, `CommandGroup`, `CommandItem`
- Radix `Popover` or centered modal positioning

**Example structure:**
```tsx
<Command>
  <CommandInput placeholder="Search categories..." />
  <CommandList>
    <CommandEmpty>No categories match</CommandEmpty>
    <CommandGroup heading="Shopping">
      <CommandItem value="shopping-online">
        <span>Shopping</span>
        <ChevronRight />
        <span>Online</span>
      </CommandItem>
      <CommandItem value="shopping-groceries">
        <span>Shopping</span>
        <ChevronRight />
        <span>Groceries</span>
      </CommandItem>
    </CommandGroup>
    <CommandGroup heading="Dining">
      {/* ... */}
    </CommandGroup>
  </CommandList>
</Command>
```

### Styling Guidelines

**Source: [ux-design-specification.md#Visual-Design]**

| Element | Style |
|---------|-------|
| Category picker | Command palette style, centered |
| Search input | shadcn CommandInput styling |
| Category items | 40px height, hover highlight |
| Category text | Regular weight, subcategory after ">" |
| Selected state | ring color background |
| Manual badge | Small, muted, "Manual" text or icon |

### Dependencies on Previous Stories

This story depends on:

- **Story 1.3:** App Shell with Linear Layout (layout context)
- **Story 3.2:** Keyboard Navigation with J/K (keyboard navigation patterns)
- **Story 4.1:** Category System Setup (categories table, category picker patterns)
- **Story 4.2:** Unmatched Transactions View (unmatched filter logic)
- **Story 4.3:** Create Merchant with Rule (transaction row focus, quick actions pattern)

### Preparation for Future Stories

This story provides foundation for:

- **Story 5.3:** Batch Category Assignment - uses same QuickCategoryPicker for multiple transactions
- **Story 5.4:** Focus Mode - Current Month (M Key) - similar toggle pattern

### Integration Points

**From Story 4.1 (Category System):**

Reuse category loading and display patterns:
```typescript
// Load categories for picker
const categories = useLiveQuery(() => db.categories.toArray())

// Category with subcategories structure
type CategoryWithSubs = {
  category: Category
  subcategories: Subcategory[]
}
```

**From Story 4.2 (Unmatched View):**

Update the unmatched filter logic:
```typescript
// In useUnmatchedTransactions or equivalent
const isUnmatched = (tx: Transaction): boolean => {
  return !tx.merchantId && !tx.manualCategory
}
```

**From Story 3.2 (Keyboard Navigation):**

Integrate with existing keyboard context:
```typescript
// Add C key to handled keys
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'c' && !isInputActive && focusedTransactionId) {
    e.preventDefault()
    openQuickCategoryPicker(focusedTransactionId)
  }
}
```

### Error Handling

| Scenario | Response |
|----------|----------|
| Database error on assign | Toast: "Failed to assign category" with retry |
| No categories available | Show empty state in picker with guidance |
| Undo timeout (>10s) | Undo no longer available |
| Invalid category selection | Should not happen (picker shows valid options) |

### Testing Scenarios

**Unit Tests for QuickCategoryPicker:**

```typescript
describe('QuickCategoryPicker', () => {
  it('should show all categories when opened', async () => {
    // Setup: Categories in Dexie
    // Render: Open picker
    // Assert: All categories visible
  })

  it('should filter categories by search text', async () => {
    // Setup: Categories with "Shopping", "Dining"
    // Act: Type "shop" in search
    // Assert: Only Shopping categories visible
  })

  it('should navigate with arrow keys', async () => {
    // Render: Open picker with categories
    // Act: Press ↓ key
    // Assert: Second item highlighted
  })

  it('should select category on Enter', async () => {
    // Setup: Mock onCategorySelect
    // Act: Navigate to item, press Enter
    // Assert: onCategorySelect called with correct categoryId
  })

  it('should close on Escape', async () => {
    // Setup: Mock onOpenChange
    // Act: Press Escape
    // Assert: onOpenChange called with false
  })
})
```

**Integration Tests:**

```typescript
describe('Quick Category Assignment', () => {
  it('should assign category when C key pressed on focused transaction', async () => {
    // Setup: Transaction in Dexie, keyboard context
    // Act: Focus transaction, press C, select category
    // Assert: Transaction updated with categoryId, manualCategory=true
  })

  it('should remove transaction from unmatched view after C key assignment', async () => {
    // Setup: Unmatched transaction
    // Act: Assign category with C key
    // Assert: Transaction no longer in unmatched query results
  })

  it('should show Manual badge on manually categorized transactions', async () => {
    // Setup: Transaction with manualCategory=true
    // Render: TransactionRow
    // Assert: "Manual" badge or indicator visible
  })

  it('should undo category assignment within 10 seconds', async () => {
    // Setup: Transaction
    // Act: Assign category, click Undo in toast
    // Assert: Transaction restored to previous state
  })
})
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate Dexie data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT create merchant when using C key (that's R key's job)
- DO NOT trigger rule engine for manual category assignments

### Validation Checklist

Before marking complete:
- [ ] C key opens QuickCategoryPicker when transaction focused
- [ ] Picker shows all categories with subcategories
- [ ] Search filters categories by name
- [ ] Arrow keys navigate between categories
- [ ] Enter selects highlighted category
- [ ] Escape closes picker without changes
- [ ] Transaction updated with categoryId and subcategoryId
- [ ] Transaction marked as manualCategory: true
- [ ] merchantId NOT set (or cleared if overriding)
- [ ] Transaction removed from unmatched view
- [ ] Category badge displayed on transaction row
- [ ] "Manual" indicator shown on row
- [ ] Toast: "Categorized as [Category]" with Undo
- [ ] Undo restores previous state within 10 seconds
- [ ] Focus returns to transaction after picker closes
- [ ] Works in conjunction with J/K navigation
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-4-Story-4.7-Quick-Category-Assignment]
- [Source: prd.md#FR16 - User can manually assign a category to a transaction]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Quick-Actions]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Story 1.3: Create App Shell with Linear Layout]
- [Story 3.2: Keyboard Navigation with J/K]
- [Story 4.1: Category System Setup]
- [Story 4.2: Unmatched Transactions View]
- [Story 4.3: Create Merchant with Rule (R key)]
- [Story 4.6: View and Manage Rules]

## Change Log

- 2026-02-08: Implemented all 16 tasks for Quick Category Assignment (C key) story. Added QuickCategoryPicker component, useQuickCategoryAssign hook, assignManualCategory service, updated TransactionRow with Manual badge, updated unmatched filter logic, wired C key into TransactionList keyboard flow, added DB schema v5 with manualCategory index. All 52 story-related tests pass across 6 test files. 612 total tests pass with no regressions.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No errors or halts during implementation.

### Completion Notes List

- QuickCategoryPicker implemented using shadcn CommandDialog (cmdk) with centered command-palette style, matching Cmd+K pattern
- Categories loaded via useCategories hook (useLiveQuery from Dexie), grouped by parent with subcategories nested
- Search/filtering handled natively by cmdk with case-insensitive matching on "ParentName SubcategoryName" values
- C key handler wired in TransactionList via onAction callback from useKeyboardNavigation (not in TransactionRow directly — matches existing R key pattern)
- C key blocked when any modal is open (merchantModal or categoryPicker) and when user is in input/textarea fields
- assignManualCategory service stores previous state (categoryId, subcategoryId, merchantId, manualCategory) for undo, clears merchantId on assign
- Undo via toast action button with 10-second duration, restores all previous values via undoManualCategoryAssignment
- TransactionRow shows "Manual" badge (dashed border, muted text) next to CategoryBadge when manualCategory=true
- Unmatched filter updated: transaction is unmatched only if !merchantId AND !manualCategory
- DB schema upgraded to v5 adding subcategoryId, manualCategory indexes to transactions table
- Transaction type updated with manualCategory?: boolean field
- All exports use named exports, types use `type` not `interface`, tests co-located with source

### File List

New files:
- src/features/transactions/components/QuickCategoryPicker/index.tsx
- src/features/transactions/components/QuickCategoryPicker/QuickCategoryPicker.test.tsx
- src/features/transactions/hooks/useQuickCategoryAssign.ts
- src/features/transactions/hooks/useQuickCategoryAssign.test.ts
- src/features/transactions/services/assignManualCategory.ts
- src/features/transactions/services/assignManualCategory.test.ts

Modified files:
- src/types/transaction.types.ts (added manualCategory field)
- src/lib/db/schema.ts (added v5 with subcategoryId, manualCategory indexes)
- src/components/TransactionRow/index.tsx (added Manual badge, updated unmatched logic)
- src/components/TransactionRow/TransactionRow.test.tsx (added Manual badge tests)
- src/features/transactions/components/TransactionList/index.tsx (wired C key handler, QuickCategoryPicker integration)
- src/features/transactions/hooks/useFilteredTransactions.ts (updated unmatched filter with manualCategory)
- src/features/transactions/hooks/useFilteredTransactions.test.ts (added manualCategory exclusion test)
- src/features/transactions/index.ts (added QuickCategoryPicker, useQuickCategoryAssign, assignManualCategory exports)
