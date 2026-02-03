# Story 4.2: Unmatched Transactions View

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see only my unmatched (uncategorized) transactions**,
So that **I can focus on triaging my "inbox" and reach inbox zero (FR15)**.

## Acceptance Criteria

1. **Given** I have transactions with and without merchants
   **When** I press `U` or select "Unmatched" in sidebar
   **Then** the transaction list filters to show only unmatched transactions
   **And** the view title/breadcrumb shows "Unmatched"

2. **Given** I am in Unmatched view
   **When** I view the sidebar
   **Then** "Unmatched" is highlighted as active
   **And** the unmatched count is displayed (e.g., "Unmatched (12)")

3. **Given** I am in Unmatched view
   **When** I press `U` again or click "All Transactions"
   **Then** the filter is removed
   **And** I see all transactions again

4. **Given** I have unmatched transactions
   **When** I view the Unmatched count in sidebar
   **Then** the count updates in real-time as transactions are categorized

5. **Given** all transactions are matched
   **When** I am in Unmatched view
   **Then** I see the Inbox Zero empty state: "All caught up!" with checkmark
   **And** a CTA to "View Dashboard"

## Tasks / Subtasks

- [ ] Task 1: Add `merchantId` and `categoryId` fields to transaction type (AC: #1)
  - [ ] Update `src/types/transaction.types.ts` to include:
    - `merchantId: string | null` (null = unmatched)
    - `categoryId: string | null` (null = uncategorized)
  - [ ] Update Dexie schema in `src/lib/db/schema.ts`:
    - Add index on `merchantId`
    - Add index on `categoryId`
  - [ ] Increment database version for migration
  - [ ] Use `type` not `interface` per conventions

- [ ] Task 2: Create `useUnmatchedCount` hook (AC: #2, #4)
  - [ ] Create `src/hooks/useUnmatchedCount.ts`
  - [ ] Create `src/hooks/useUnmatchedCount.test.ts`
  - [ ] Use `useLiveQuery` to count transactions where `merchantId === null`
  - [ ] Return `{ count: number, isLoading: boolean }`
  - [ ] Count should be reactive - updates automatically on DB changes
  - [ ] Named export only

- [ ] Task 3: Create `useFilteredTransactions` hook (AC: #1, #3)
  - [ ] Create `src/features/transactions/hooks/useFilteredTransactions.ts`
  - [ ] Create `src/features/transactions/hooks/useFilteredTransactions.test.ts`
  - [ ] Accept filter options: `{ unmatchedOnly?: boolean }`
  - [ ] Use `useLiveQuery` with conditional query based on filter
  - [ ] Return `{ transactions: Transaction[], isLoading: boolean }`
  - [ ] Ensure query is optimized for Dexie indexed field

- [ ] Task 4: Create Focus Mode context (AC: #1, #3)
  - [ ] Create `src/context/FocusModeContext.tsx`
  - [ ] Create `src/context/FocusModeContext.test.tsx`
  - [ ] Define focus modes: `'all' | 'unmatched' | 'month' | 'subscriptions'`
  - [ ] Provide: `focusMode`, `setFocusMode`, `toggleFocusMode`
  - [ ] `toggleFocusMode('unmatched')` - toggles between 'unmatched' and 'all'
  - [ ] Export `useFocusMode` hook and `FocusModeProvider`

- [ ] Task 5: Implement U key keyboard shortcut (AC: #1, #3)
  - [ ] Modify existing keyboard navigation hook/context
  - [ ] Add global listener for `U` key (when not in input)
  - [ ] `U` toggles unmatched focus mode:
    - If current mode is 'all' or other → switch to 'unmatched'
    - If current mode is 'unmatched' → switch to 'all'
  - [ ] Prevent activation when typing in inputs/textareas
  - [ ] Use the existing keyboard context pattern from Story 3.2

- [ ] Task 6: Update Sidebar with Unmatched nav item (AC: #2, #4)
  - [ ] Modify `src/components/Layout/Sidebar.tsx`
  - [ ] Add "Unmatched" navigation item with:
    - Icon: `InboxIcon` from Lucide
    - Label: "Unmatched"
    - Badge showing count (e.g., "(12)")
    - Active state when focusMode === 'unmatched'
  - [ ] Use `useUnmatchedCount` hook for the count
  - [ ] Count badge styling:
    - Warning/amber color when count > 0
    - Success/green color (or hidden) when count === 0
  - [ ] Animate count changes (optional, respect `prefers-reduced-motion`)

- [ ] Task 7: Update TransactionList to respect focus mode (AC: #1, #3)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] Get `focusMode` from `useFocusMode()` context
  - [ ] Pass `unmatchedOnly: focusMode === 'unmatched'` to data hook
  - [ ] Ensure virtualization still works with filtered data
  - [ ] Maintain J/K keyboard navigation on filtered list

- [ ] Task 8: Update breadcrumb for Unmatched view (AC: #1)
  - [ ] Modify breadcrumb component from Story 3.5
  - [ ] When `focusMode === 'unmatched'`:
    - Show "Transactions > Unmatched" breadcrumb
    - Make "Transactions" clickable to clear filter
  - [ ] When `focusMode === 'all'`:
    - Show "Transactions" breadcrumb

- [ ] Task 9: Create InboxZeroEmpty component (AC: #5)
  - [ ] Create `src/components/InboxZeroEmpty/index.tsx`
  - [ ] Create `src/components/InboxZeroEmpty/InboxZeroEmpty.test.tsx`
  - [ ] Display:
    - Large checkmark icon (CheckCircle from Lucide)
    - "All caught up!" heading
    - Subtle celebratory message (optional confetti effect)
    - "View Dashboard" CTA button linking to /dashboard
  - [ ] Style per UX spec:
    - Centered content
    - Success/green accent color
    - Subtle animation (respect `prefers-reduced-motion`)

- [ ] Task 10: Show InboxZeroEmpty when appropriate (AC: #5)
  - [ ] In TransactionList component:
    - Check if `focusMode === 'unmatched'` AND `transactions.length === 0`
    - If true, render InboxZeroEmpty instead of empty state
  - [ ] Ensure this only shows in Unmatched view, not general empty state
  - [ ] Regular empty state ("No transactions yet") for non-filtered view

- [ ] Task 11: Add "All Transactions" option to sidebar (AC: #3)
  - [ ] Ensure "Transactions" nav item exists that shows all transactions
  - [ ] Clicking "Transactions" should:
    - Navigate to /transactions route
    - Set focusMode to 'all' (clear any filters)
  - [ ] Visual distinction between "All" and filtered states

- [ ] Task 12: Real-time count updates testing (AC: #4)
  - [ ] Write integration test:
    - Add unmatched transaction → count increases
    - Assign merchant to transaction → count decreases
    - Verify Dexie live query triggers re-render
  - [ ] Test count updates without full page refresh
  - [ ] Verify sidebar count matches actual unmatched count

- [ ] Task 13: Write comprehensive tests (AC: all)
  - [ ] useUnmatchedCount tests:
    - Returns correct count for unmatched transactions
    - Returns 0 when all matched
    - Updates reactively when transactions change
  - [ ] useFilteredTransactions tests:
    - Returns all transactions when no filter
    - Returns only unmatched when unmatchedOnly=true
    - Returns empty array when all matched and filtering
  - [ ] FocusModeContext tests:
    - Default mode is 'all'
    - Toggle works correctly
    - Persists mode correctly
  - [ ] TransactionList filtering tests:
    - Shows all transactions in 'all' mode
    - Shows only unmatched in 'unmatched' mode
    - Shows InboxZeroEmpty when filtered and empty
  - [ ] Keyboard shortcut tests:
    - U key toggles unmatched mode
    - Doesn't trigger when in input field

- [ ] Task 14: Accessibility compliance (AC: all)
  - [ ] Sidebar count:
    - `aria-label="Unmatched transactions: 12"`
    - Badge is decorative (aria-hidden) if text includes count
  - [ ] Focus mode:
    - Announce mode change to screen readers
    - `aria-live="polite"` for count changes
  - [ ] Keyboard navigation:
    - Focus remains in list after mode toggle
    - U key shortcut documented in app help
  - [ ] InboxZeroEmpty:
    - `role="status"` for announcement
    - CTA button is focusable

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Filter State | React Context | UI-only state, doesn't persist to DB |
| Real-time Updates | Dexie live queries | Automatic re-render on DB changes |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |
| State | Derive from Dexie where possible |

### UX Design Requirements

**Source: [epics.md#Story-4.2 and ux-design-specification.md]**

| Element | Specification |
|---------|--------------|
| U Key | Global shortcut to toggle unmatched view |
| Sidebar Badge | Shows live count, warning color when > 0 |
| Empty State | "All caught up!" celebration for inbox zero |
| View Title | "Unmatched" shown in breadcrumb |
| Toggle Behavior | U toggles on/off, not cycle through modes |

### Transaction Type Updates

**Source: [project-context.md and architecture.md]**

The transaction type needs `merchantId` and `categoryId` for this story:

```typescript
// src/types/transaction.types.ts (additions)

export type Transaction = {
  id: string
  accountId: string
  date: Date
  amount: number
  rawMerchantString: string
  merchantId: string | null  // null = unmatched
  categoryId: string | null  // null = uncategorized
  createdAt: Date
  updatedAt: Date
}
```

### Dexie Query Pattern

**Source: [project-context.md#Data-Access]**

```typescript
// CORRECT: Query Dexie directly, filtered on indexed field
const unmatchedTransactions = useLiveQuery(
  () => db.transactions.where('merchantId').equals(null).toArray(),
  []
)

// WRONG: Don't filter in-memory after fetching all
const allTxns = useLiveQuery(() => db.transactions.toArray(), [])
const unmatched = allTxns?.filter(t => !t.merchantId) // BAD!
```

### Focus Mode Context Pattern

```typescript
// src/context/FocusModeContext.tsx

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type FocusMode = 'all' | 'unmatched' | 'month' | 'subscriptions'

type FocusModeContextValue = {
  focusMode: FocusMode
  setFocusMode: (mode: FocusMode) => void
  toggleFocusMode: (mode: FocusMode) => void
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null)

type FocusModeProviderProps = {
  children: ReactNode
}

export const FocusModeProvider = ({ children }: FocusModeProviderProps): JSX.Element => {
  const [focusMode, setFocusMode] = useState<FocusMode>('all')

  const toggleFocusMode = useCallback((mode: FocusMode) => {
    setFocusMode((current) => (current === mode ? 'all' : mode))
  }, [])

  return (
    <FocusModeContext.Provider value={{ focusMode, setFocusMode, toggleFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  )
}

export const useFocusMode = (): FocusModeContextValue => {
  const context = useContext(FocusModeContext)
  if (!context) {
    throw new Error('useFocusMode must be used within FocusModeProvider')
  }
  return context
}
```

### Unmatched Count Hook

```typescript
// src/hooks/useUnmatchedCount.ts

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

type UseUnmatchedCountReturn = {
  count: number
  isLoading: boolean
}

export const useUnmatchedCount = (): UseUnmatchedCountReturn => {
  const count = useLiveQuery(
    () => db.transactions.where('merchantId').equals(null).count(),
    [],
    0
  )

  return {
    count: count ?? 0,
    isLoading: count === undefined,
  }
}
```

### Sidebar Count Badge Styling

```typescript
// Sidebar component snippet

import { Inbox } from 'lucide-react'
import { useUnmatchedCount } from '@/hooks/useUnmatchedCount'
import { useFocusMode } from '@/context/FocusModeContext'
import { cn } from '@/lib/utils'

const { count } = useUnmatchedCount()
const { focusMode, toggleFocusMode } = useFocusMode()

<button
  onClick={() => toggleFocusMode('unmatched')}
  className={cn(
    'flex items-center gap-2 w-full px-3 py-2 rounded-md',
    focusMode === 'unmatched' && 'bg-accent text-accent-foreground'
  )}
>
  <Inbox className="h-4 w-4" />
  <span>Unmatched</span>
  {count > 0 && (
    <span
      className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500"
      aria-label={`${count} unmatched transactions`}
    >
      {count}
    </span>
  )}
</button>
```

### InboxZeroEmpty Component

```typescript
// src/components/InboxZeroEmpty/index.tsx

import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

export const InboxZeroEmpty = (): JSX.Element => {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
      <h2 className="text-2xl font-semibold mb-2">All caught up!</h2>
      <p className="text-muted-foreground mb-6">
        No unmatched transactions. Great job!
      </p>
      <Button asChild>
        <Link to="/">View Dashboard</Link>
      </Button>
    </div>
  )
}
```

### Keyboard Integration

**Source: [Story 3.2 keyboard navigation pattern]**

```typescript
// Add to keyboard event handler (from Story 3.2)

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't trigger when in input fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return
    }

    switch (e.key.toLowerCase()) {
      case 'u':
        e.preventDefault()
        toggleFocusMode('unmatched')
        break
      // ... existing J/K navigation
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [toggleFocusMode])
```

### Project Structure for This Story

```
src/
├── context/
│   ├── FocusModeContext.tsx (new)
│   └── FocusModeContext.test.tsx (new)
├── hooks/
│   ├── useUnmatchedCount.ts (new)
│   └── useUnmatchedCount.test.ts (new)
├── features/
│   └── transactions/
│       └── hooks/
│           ├── useFilteredTransactions.ts (new)
│           └── useFilteredTransactions.test.ts (new)
├── components/
│   ├── InboxZeroEmpty/
│   │   ├── index.tsx (new)
│   │   └── InboxZeroEmpty.test.tsx (new)
│   └── Layout/
│       └── Sidebar.tsx (modify - add Unmatched nav)
├── types/
│   └── transaction.types.ts (modify - add merchantId, categoryId)
└── lib/
    └── db/
        └── schema.ts (modify - add indexes)
```

### Dependencies on Previous Stories

This story depends on:
- **Story 3.1:** Transaction list view (modify to support filtering)
- **Story 3.2:** Keyboard navigation with J/K (extend with U key)
- **Story 3.5:** Breadcrumb navigation (update for Unmatched view)
- **Story 4.1:** Category system setup (CategoryBadge for unmatched indicator)

### Preparation for Future Stories

This story is a **foundation** for:
- **Story 4.3:** Create Merchant with Rule (R key) - operates on unmatched transactions
- **Story 4.7:** Quick Category Assignment (C key) - operates on unmatched transactions
- **Story 5.4:** Focus Mode Current Month (M key) - same FocusModeContext

### Real-Time Updates Verification

**CRITICAL:** The unmatched count MUST update in real-time. Test scenarios:

1. Import new statement → count increases immediately
2. Assign merchant to transaction (future story) → count decreases immediately
3. Delete transaction → count updates accordingly
4. No page refresh needed for any of these

This is achieved through Dexie's `useLiveQuery` which automatically re-renders when the underlying data changes.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate transaction data in React state (use `useLiveQuery`)
- DO NOT filter all transactions in-memory (use Dexie indexed query)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Filter toggle | <16ms | React context state change |
| Count update | <50ms | Dexie indexed count query |
| List re-render | <100ms | Dexie query with index, virtualized list |
| Keyboard response | <16ms | Direct state update, no debounce |

The `merchantId` field MUST be indexed in Dexie for efficient filtering:

```typescript
// In Dexie schema
transactions: '++id, accountId, merchantId, categoryId, date'
```

### Validation Checklist

Before marking complete:
- [ ] U key toggles unmatched view
- [ ] Sidebar shows "Unmatched" with count badge
- [ ] Count updates in real-time when transactions change
- [ ] Filtered list shows only unmatched transactions
- [ ] Breadcrumb shows "Transactions > Unmatched"
- [ ] InboxZeroEmpty shows when all matched and in unmatched view
- [ ] Regular empty state shows in all transactions view
- [ ] J/K navigation works on filtered list
- [ ] U key doesn't trigger in input fields
- [ ] Screen reader announces count changes
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Dexie queries use indexed fields
- [ ] Works with dark theme

### References

- [Source: epics.md#Epic-4-Story-4.2-Unmatched-Transactions-View]
- [Source: prd.md#FR15 - User can view only unmatched transactions]
- [Source: prd.md#FR27 - Focus modes (U=unmatched)]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Dexie-Table-Naming]
- [Source: ux-design-specification.md#Keyboard-Shortcuts]
- [Story 3.1: Transaction list view]
- [Story 3.2: Keyboard navigation with J/K]
- [Story 3.5: Breadcrumb navigation]
- [Story 4.1: Category system setup]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
