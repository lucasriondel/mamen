# Story 4.7: Quick Category Assignment (C Key)

Status: ready-for-dev

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

- [ ] Task 1: Create QuickCategoryPicker component (AC: #1, #2)
  - [ ] Create `src/features/transactions/components/QuickCategoryPicker/index.tsx`
  - [ ] Create `src/features/transactions/components/QuickCategoryPicker/QuickCategoryPicker.test.tsx`
  - [ ] Use shadcn `Command` (cmdk) component as base for searchable dropdown
  - [ ] Props type:
    ```typescript
    type QuickCategoryPickerProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      onCategorySelect: (categoryId: string, subcategoryId?: string) => void
      anchorElement?: HTMLElement | null // For positioning near focused transaction
    }
    ```
  - [ ] Load categories and subcategories via `useLiveQuery` from Dexie
  - [ ] Display categories grouped with subcategories nested
  - [ ] Category format: "Category > Subcategory" for display
  - [ ] Searchable: filter by category name or subcategory name
  - [ ] Keyboard navigation: ↑↓ to navigate, Enter to select, Esc to close
  - [ ] Named exports only, use `type` not `interface`

- [ ] Task 2: Implement category search and filtering (AC: #2)
  - [ ] Fuzzy search implementation for category names
  - [ ] Search should match:
    - Category name: "Shop" matches "Shopping"
    - Subcategory name: "Online" matches "Shopping > Online"
    - Combined: "shop online" matches "Shopping > Online"
  - [ ] Case-insensitive matching
  - [ ] Highlight matching text in results (optional enhancement)
  - [ ] Show "No categories match" empty state when search has no results
  - [ ] Search input auto-focused when picker opens

- [ ] Task 3: Implement keyboard navigation in picker (AC: #2)
  - [ ] ↑/↓ arrow keys navigate between category options
  - [ ] Enter selects the highlighted category
  - [ ] Esc closes picker without selection
  - [ ] Tab moves between search input and category list
  - [ ] Focus ring visible on highlighted option
  - [ ] Scroll list to keep highlighted item visible
  - [ ] First item highlighted by default when opening

- [ ] Task 4: Add C key handler to TransactionRow (AC: #1)
  - [ ] Modify `src/components/TransactionRow/index.tsx` or equivalent
  - [ ] Add keyboard event handler for 'c' key when row is focused
  - [ ] Prevent C key action when:
    - User is typing in an input field
    - Modal is already open
    - Multiple transactions are selected (handled by batch story 5.3)
  - [ ] Open QuickCategoryPicker positioned near the focused transaction
  - [ ] Pass transaction data to picker for context

- [ ] Task 5: Wire C key into keyboard navigation context (AC: #1)
  - [ ] Update `src/hooks/useKeyboardNavigation.ts` or keyboard context
  - [ ] Add 'c' to the list of handled keys
  - [ ] Ensure C key only fires when:
    - A transaction is focused (not just the list)
    - Not in edit mode or other modal
  - [ ] Coordinate with existing R key (merchant) and F key (refund) handlers
  - [ ] Integration with existing keyboard state machine

- [ ] Task 6: Create useQuickCategoryAssign hook (AC: #3)
  - [ ] Create `src/features/transactions/hooks/useQuickCategoryAssign.ts`
  - [ ] Create `src/features/transactions/hooks/useQuickCategoryAssign.test.ts`
  - [ ] Hook interface:
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
  - [ ] Implementation:
    - Update transaction in Dexie with categoryId and subcategoryId
    - Do NOT set merchantId (key difference from R key flow)
    - Set `manualCategory: true` flag on transaction
    - Return success/failure for toast handling
  - [ ] Named exports only

- [ ] Task 7: Implement manual category assignment in Dexie (AC: #3)
  - [ ] Update transaction type if needed:
    ```typescript
    type Transaction = {
      // ... existing fields
      categoryId: string | null
      subcategoryId: string | null
      merchantId: string | null
      manualCategory: boolean // true = C key, false = rule-assigned
    }
    ```
  - [ ] Create `assignManualCategory` function:
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
  - [ ] Store previous values for undo capability
  - [ ] Clear merchantId if transaction previously had one (manual overrides rule)

- [ ] Task 8: Implement undo for quick category assignment (AC: #3)
  - [ ] Use existing undo context/pattern from project
  - [ ] Store previous state:
    ```typescript
    type CategoryUndoState = {
      transactionId: string
      previousCategoryId: string | null
      previousSubcategoryId: string | null
      previousMerchantId: string | null
      previousManualCategory: boolean
    }
    ```
  - [ ] On undo: restore all previous values
  - [ ] Toast with "Undo" action button, 10-second window
  - [ ] Toast format: "Categorized as Shopping > Online" [Undo]

- [ ] Task 9: Update transaction display for manual categories (AC: #4)
  - [ ] Modify TransactionRow to show "Manual" indicator when `manualCategory: true`
  - [ ] Display options:
    - Small "Manual" badge next to category
    - Or: Tooltip on category badge: "Manually assigned (no rule)"
    - Or: Different badge styling (e.g., dashed border)
  - [ ] Consistent with design system (shadcn Badge component)
  - [ ] UX spec preference: subtle indicator, not distracting

- [ ] Task 10: Update Unmatched view filter logic (AC: #4)
  - [ ] Modify unmatched transactions query
  - [ ] Transaction is "matched" (not unmatched) if:
    - `merchantId` is set (rule-assigned), OR
    - `manualCategory: true` (C key assigned)
  - [ ] Update sidebar unmatched count accordingly
  - [ ] Update Dexie query in unmatched transactions hook:
    ```typescript
    // Transaction is unmatched if:
    // - No merchantId AND
    // - manualCategory is false (or not set)
    const unmatched = await db.transactions
      .filter(tx => !tx.merchantId && !tx.manualCategory)
      .toArray()
    ```

- [ ] Task 11: Handle edge cases (AC: all)
  - [ ] Transaction already has a category (update vs. confirm)
    - If transaction already categorized: show current category highlighted
    - Allow user to change category (update operation)
  - [ ] Transaction has a merchant-assigned category:
    - Show warning: "This will override the rule-based category"
    - Or: Require explicit confirmation
    - On confirm: set manualCategory=true, clear merchantId
  - [ ] Category picker with empty categories database:
    - Show message: "No categories available. Set up categories first."
    - Link to settings or category management

- [ ] Task 12: Integrate with TransactionList keyboard flow (AC: #1)
  - [ ] Ensure C key works in conjunction with J/K navigation
  - [ ] Flow: Navigate with J/K → Press C → Picker opens → Select → Continue
  - [ ] After category selection:
    - Close picker
    - Return focus to transaction row
    - Show success toast
    - Transaction row updates with new category badge

- [ ] Task 13: Add QuickCategoryPicker positioning (AC: #1)
  - [ ] Position picker near the focused transaction row
  - [ ] Use Radix UI Popover positioning or shadcn Popover
  - [ ] Fallback positioning if near viewport edge
  - [ ] Consider using Command palette style (centered) vs. inline popover
  - [ ] UX decision: Recommend centered command-style for consistency with Cmd+K

- [ ] Task 14: Style QuickCategoryPicker (AC: #1, #2)
  - [ ] Follow shadcn/ui Command component styling
  - [ ] Dark theme compatible (hsl colors from design system)
  - [ ] Search input at top with magnifier icon
  - [ ] Category list with proper spacing (40px item height per UX spec)
  - [ ] Subtle scroll when list is long
  - [ ] Selected/highlighted state with ring color
  - [ ] Category badges with proper colors

- [ ] Task 15: Export new components from feature module
  - [ ] Update `src/features/transactions/index.ts`:
    ```typescript
    // Components
    export { QuickCategoryPicker } from './components/QuickCategoryPicker'

    // Hooks
    export { useQuickCategoryAssign } from './hooks/useQuickCategoryAssign'

    // Services
    export { assignManualCategory } from './services/transactionOperations'
    ```
  - [ ] Named exports only

- [ ] Task 16: Write integration tests (AC: all)
  - [ ] Test: C key opens QuickCategoryPicker when transaction focused
  - [ ] Test: Search filters categories correctly
  - [ ] Test: Arrow key navigation works in category list
  - [ ] Test: Enter selects highlighted category
  - [ ] Test: Esc closes picker without changes
  - [ ] Test: Selecting category updates transaction in Dexie
  - [ ] Test: Transaction marked as manualCategory: true
  - [ ] Test: Transaction no longer appears in unmatched view
  - [ ] Test: Toast shows "Categorized as [Category]" with Undo
  - [ ] Test: Undo restores previous category state
  - [ ] Test: Manual badge appears on manually categorized transactions
  - [ ] Test: C key on transaction with merchant category shows override warning

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

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
