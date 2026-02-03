# Story 3.2: Keyboard Navigation with J/K

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to navigate the transaction list using J/K keys like in Linear**,
So that **I can quickly move through transactions without using the mouse (FR24)**.

## Acceptance Criteria

1. **Given** I am on the Transactions page
   **When** I press `J`
   **Then** focus moves to the next transaction in the list
   **And** the focused row has a visible focus ring (per UX spec)
   **And** the response is instant (<16ms for 60fps)

2. **Given** I am on the Transactions page
   **When** I press `K`
   **Then** focus moves to the previous transaction in the list

3. **Given** I have focused a transaction
   **When** the focused row is near the edge of the viewport
   **Then** the list scrolls to keep the focused row visible

4. **Given** I am at the first transaction
   **When** I press `K`
   **Then** focus stays on the first transaction (doesn't wrap)

5. **Given** I am at the last transaction
   **When** I press `J`
   **Then** focus stays on the last transaction (doesn't wrap)

6. **Given** I have focused a transaction
   **When** I press `Enter`
   **Then** the transaction is selected
   **And** the row shows selected state

7. **Given** I have a selection or focus
   **When** I press `Esc`
   **Then** selection/focus is cleared
   **And** keyboard focus returns to the list container

8. **Given** I am typing in an input field
   **When** I press `J` or `K`
   **Then** the keys type normally (navigation disabled in inputs)

## Tasks / Subtasks

- [ ] Task 1: Create useKeyboardNavigation hook (AC: #1, #2, #4, #5, #8)
  - [ ] Create `src/hooks/useKeyboardNavigation.ts`
  - [ ] Define hook that accepts `itemCount`, `onNavigate` callback
  - [ ] Implement J/K key handling with event listeners
  - [ ] Track `focusedIndex` state
  - [ ] Return `focusedIndex`, `handleKeyDown`, `setFocusedIndex`, `clearFocus`
  - [ ] Add guard to ignore keys when in input/textarea fields
  - [ ] Prevent default behavior for J/K when navigation active
  - [ ] Handle boundary conditions (first/last item)

- [ ] Task 2: Integrate keyboard navigation into TransactionList (AC: #1, #2, #3)
  - [ ] Import and use `useKeyboardNavigation` hook in TransactionList
  - [ ] Pass `transactions.length` as itemCount
  - [ ] Attach `handleKeyDown` to list container
  - [ ] Pass `focusedIndex` to TransactionRow components
  - [ ] Ensure list container is focusable (`tabIndex={0}`)

- [ ] Task 3: Update TransactionRow for focused state styling (AC: #1, #2)
  - [ ] Add `isFocused` prop to TransactionRowProps
  - [ ] Style focused row with visible focus ring (`ring` color from design system)
  - [ ] Focus ring offset: 2px (per UX spec)
  - [ ] Distinguish focused state from selected state visually
  - [ ] Use `cn()` utility for conditional classes

- [ ] Task 4: Implement scroll-into-view for focused rows (AC: #3)
  - [ ] When `focusedIndex` changes, scroll that row into view
  - [ ] Use TanStack Virtual's `scrollToIndex` method
  - [ ] Configure smooth scrolling behavior
  - [ ] Ensure row is fully visible (not just partially)

- [ ] Task 5: Implement Enter key for selection (AC: #6)
  - [ ] Add Enter key handler in useKeyboardNavigation
  - [ ] When Enter pressed, call `onSelect(focusedIndex)`
  - [ ] Update TransactionList to track `selectedId` state
  - [ ] Pass `isSelected` to TransactionRow based on selection

- [ ] Task 6: Implement Esc key for clearing focus/selection (AC: #7)
  - [ ] Add Esc key handler in useKeyboardNavigation
  - [ ] Clear both `focusedIndex` and `selectedId`
  - [ ] Return focus to list container element
  - [ ] Use ref for list container focus management

- [ ] Task 7: Handle input field context (AC: #8)
  - [ ] Check `document.activeElement` tag name
  - [ ] If activeElement is INPUT, TEXTAREA, or contentEditable, don't handle J/K
  - [ ] Allow normal typing in search fields, forms, etc.
  - [ ] Use early return in event handler

- [ ] Task 8: Create KeyboardContext for global keyboard state (optional but recommended)
  - [ ] Create `src/context/KeyboardContext.tsx`
  - [ ] Provide `isNavigating`, `activeList` state
  - [ ] Allow multiple keyboard-navigable components to coordinate
  - [ ] This prepares for command palette (Story 3.3)

- [ ] Task 9: Performance optimization for instant response (AC: #1)
  - [ ] Ensure keyboard handlers are memoized with useCallback
  - [ ] Use stable references to prevent re-renders
  - [ ] Measure response time in dev tools (target: <16ms)
  - [ ] Consider using `requestAnimationFrame` if needed

- [ ] Task 10: Add keyboard shortcut hints to UI (discoverability)
  - [ ] Add subtle footer hint on Transactions page: `[J/K] Navigate  [Enter] Select  [Esc] Clear`
  - [ ] Style hints with muted-foreground color
  - [ ] Hints should be unobtrusive

- [ ] Task 11: Write unit and integration tests (AC: all)
  - [ ] Create `src/hooks/useKeyboardNavigation.test.ts`
    - Test J key moves focus down
    - Test K key moves focus up
    - Test boundary at first item
    - Test boundary at last item
    - Test Enter selects focused item
    - Test Esc clears focus and selection
    - Test keys ignored in input fields
  - [ ] Update `src/features/transactions/components/TransactionList/TransactionList.test.tsx`
    - Test keyboard navigation integration
    - Test scroll-into-view behavior
  - [ ] Update `src/components/TransactionRow/TransactionRow.test.tsx`
    - Test focused state styling
    - Test focused vs selected visual distinction

- [ ] Task 12: Accessibility compliance for keyboard navigation
  - [ ] Ensure focus state is visible (not just `:focus-visible`)
  - [ ] Add appropriate ARIA attributes
  - [ ] `role="listbox"` on list container (or `role="grid"`)
  - [ ] `role="option"` (or `role="row"`) on TransactionRow
  - [ ] `aria-selected` for selected state
  - [ ] `aria-activedescendant` for current focus
  - [ ] Test with keyboard-only navigation

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Frontend-Architecture]**

- Keyboard navigation hook should be in shared hooks (`src/hooks/`)
- Can optionally use Zustand for UI state (navigation focus) - but React context or local state is fine
- Keep logic simple - no need for XState for this scope

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming (`handleKeyDown`)
- Hook naming: `use{Name}` prefix

### UX Design Requirements

**Source: [ux-design-specification.md#Keyboard-Patterns]**

| Shortcut | Action |
|----------|--------|
| `J` | Move focus down |
| `K` | Move focus up |
| `Enter` | Open focused item / confirm |
| `Esc` | Close modal/palette, clear selection |

**Source: [ux-design-specification.md#Core-Experience]**

- Speed is Respect: Every interaction responds in <100ms
- Keyboard-First, Mouse-Optional: 100% of actions accessible via keyboard
- Target: <16ms for keyboard response (60fps)

**Source: [ux-design-specification.md#Visual-Design-Foundation]**

Focus States:
- Focus ring color: `ring` from design tokens (blue)
- Focus ring offset: 2px
- Focus visible only on keyboard navigation (`:focus-visible`)

**Source: [ux-design-specification.md#Accessibility-Implementation]**

```html
<div
  role="listbox"
  aria-activedescendant={focusedId}
  tabindex="0"
>
```

### Keyboard Hook Implementation

```typescript
// src/hooks/useKeyboardNavigation.ts

import { useState, useCallback, useEffect, RefObject } from 'react'

type UseKeyboardNavigationOptions = {
  itemCount: number
  onSelect?: (index: number) => void
  onEscape?: () => void
  containerRef: RefObject<HTMLElement>
  enabled?: boolean
}

type UseKeyboardNavigationReturn = {
  focusedIndex: number | null
  setFocusedIndex: (index: number | null) => void
  clearFocus: () => void
}

export const useKeyboardNavigation = ({
  itemCount,
  onSelect,
  onEscape,
  containerRef,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Ignore if typing in an input field
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => {
            if (prev === null) return 0
            return Math.min(prev + 1, itemCount - 1)
          })
          break

        case 'k':
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => {
            if (prev === null) return 0
            return Math.max(prev - 1, 0)
          })
          break

        case 'Enter':
          event.preventDefault()
          if (focusedIndex !== null && onSelect) {
            onSelect(focusedIndex)
          }
          break

        case 'Escape':
          event.preventDefault()
          setFocusedIndex(null)
          onEscape?.()
          containerRef.current?.focus()
          break
      }
    },
    [enabled, itemCount, focusedIndex, onSelect, onEscape, containerRef]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, containerRef])

  const clearFocus = useCallback(() => {
    setFocusedIndex(null)
  }, [])

  return {
    focusedIndex,
    setFocusedIndex,
    clearFocus,
  }
}
```

### Integration with TransactionList and TanStack Virtual

```typescript
// In TransactionList component:

import { useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from 'dexie-react-hooks'
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation'
import { db } from '@/lib/db'
import { TransactionRow } from '@/components/TransactionRow'

export const TransactionList = (): JSX.Element => {
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray()
  )

  const parentRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { focusedIndex, clearFocus } = useKeyboardNavigation({
    itemCount: transactions?.length ?? 0,
    onSelect: (index) => {
      const transaction = transactions?.[index]
      if (transaction?.id) {
        setSelectedId(transaction.id)
      }
    },
    onEscape: () => {
      setSelectedId(null)
    },
    containerRef: parentRef,
    enabled: true,
  })

  const virtualizer = useVirtualizer({
    count: transactions?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex !== null) {
      virtualizer.scrollToIndex(focusedIndex, {
        align: 'auto', // Only scroll if needed
        behavior: 'smooth',
      })
    }
  }, [focusedIndex, virtualizer])

  return (
    <div
      ref={parentRef}
      tabIndex={0}
      role="listbox"
      aria-activedescendant={focusedIndex !== null ? `tx-${transactions?.[focusedIndex]?.id}` : undefined}
      className="h-full overflow-auto outline-none focus:outline-none"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const transaction = transactions?.[virtualRow.index]
          if (!transaction) return null

          return (
            <div
              key={transaction.id}
              id={`tx-${transaction.id}`}
              role="option"
              aria-selected={selectedId === transaction.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TransactionRow
                transaction={transaction}
                isFocused={focusedIndex === virtualRow.index}
                isSelected={selectedId === transaction.id}
                onClick={() => setSelectedId(transaction.id ?? null)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### TransactionRow Focus Styling

```typescript
// Update TransactionRow in src/components/TransactionRow/index.tsx

type TransactionRowProps = {
  transaction: Transaction
  isFocused?: boolean
  isSelected?: boolean
  onClick?: () => void
}

export const TransactionRow = ({
  transaction,
  isFocused = false,
  isSelected = false,
  onClick,
}: TransactionRowProps): JSX.Element => {
  const isUnmatched = !transaction.merchantId

  return (
    <div
      className={cn(
        'flex items-center h-12 px-4 gap-4 cursor-pointer',
        'hover:bg-muted/50 transition-colors',
        // Focus state - visible ring
        isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background z-10',
        // Selected state - background highlight + border
        isSelected && 'bg-muted border-l-2 border-primary',
        // Unmatched indicator (lower priority)
        !isFocused && !isSelected && isUnmatched && 'border-l-2 border-amber-500/50'
      )}
      onClick={onClick}
    >
      {/* ... row content ... */}
    </div>
  )
}
```

### Visual Distinction: Focused vs Selected

**Source: [ux-design-specification.md#Transaction-Row]**

| State | Appearance |
|-------|------------|
| Default | Standard row styling |
| Focused | Ring outline (`ring-2 ring-ring`), elevated z-index |
| Selected | Background highlight (`bg-muted`), left border |
| Both | Ring + background (focused takes visual priority) |

### Keyboard Shortcut Footer Hints

```typescript
// Add to Transactions page layout

<div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-6 text-xs text-muted-foreground bg-background/80 backdrop-blur px-4 py-2 rounded-full border">
  <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">J</kbd>/<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">K</kbd> Navigate</span>
  <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> Select</span>
  <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> Clear</span>
</div>
```

### Performance Considerations

**Source: [architecture.md#Performance] & [project-context.md#Performance]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Keyboard response | <16ms | Memoized handlers, no re-renders |
| Scroll to focused | Smooth | TanStack Virtual `scrollToIndex` |
| Focus ring render | Instant | CSS-only (no JS animation) |

**Key optimizations:**
- Use `useCallback` for all event handlers
- Avoid re-rendering all rows when focus changes (only focused row needs update)
- Use CSS transitions for visual feedback (no React re-renders)
- TanStack Virtual handles efficient scroll management

### Project Structure for This Story

```
src/
├── hooks/
│   ├── useKeyboardNavigation.ts
│   └── useKeyboardNavigation.test.ts
├── context/
│   └── KeyboardContext.tsx (optional)
├── components/
│   └── TransactionRow/
│       ├── index.tsx (update for isFocused prop)
│       └── TransactionRow.test.tsx (update tests)
├── features/
│   └── transactions/
│       └── components/
│           └── TransactionList/
│               ├── index.tsx (integrate keyboard nav)
│               └── TransactionList.test.tsx (update tests)
└── routes/
    └── transactions.tsx (add keyboard hint footer)
```

### Dependencies on Story 3-1

This story **requires** Story 3-1 (Transaction List View) to be implemented first:
- TransactionList component with TanStack Virtual
- TransactionRow component with styling
- Transactions route
- Virtual scrolling infrastructure

### Preparation for Future Stories

This story prepares for:
- **Story 3.3 (Command Palette):** Keyboard context can coordinate with palette
- **Story 3.4 (Search):** Keyboard focus persists across search results
- **Story 4.3 (R Key - Create Rule):** Quick action triggers from focused row
- **Story 5.1 (Multi-Select):** Shift+J/K extends from current focus model

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store keyboard state in component that re-renders entire list
- DO NOT use setTimeout for keyboard response (must be synchronous)
- DO NOT add focus state to Dexie (focus is UI-only state)
- DO NOT create `__tests__/` directories - co-locate tests

### Validation Checklist

Before marking complete:
- [ ] J key moves focus down through transactions
- [ ] K key moves focus up through transactions
- [ ] Focus ring is visible on focused row
- [ ] Focus ring uses design system colors (`ring`)
- [ ] Focused row scrolls into view when at edge
- [ ] At first item, K doesn't wrap to last
- [ ] At last item, J doesn't wrap to first
- [ ] Enter key selects focused transaction
- [ ] Selected state visually distinct from focused state
- [ ] Esc clears both focus and selection
- [ ] J/K keys work normally in input fields (not captured)
- [ ] Keyboard response is instant (<16ms)
- [ ] 60fps maintained during rapid J/K presses
- [ ] Keyboard hints shown at bottom of page
- [ ] ARIA attributes for accessibility
- [ ] Works with dark theme
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files

### References

- [Source: epics.md#Story-3.2-Keyboard-Navigation-with-J/K]
- [Source: prd.md#FR24 - Keyboard navigation (J/K)]
- [Source: architecture.md#Frontend-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: ux-design-specification.md#Effortless-Interactions]
- [Source: ux-design-specification.md#Visual-Design-Foundation (focus states)]
- [Source: ux-design-specification.md#Accessibility-Implementation]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Previous Story: 3-1-transaction-list-view.md (foundation for this story)]
- [TanStack Virtual scrollToIndex](https://tanstack.com/virtual/latest/docs/api/virtualizer#scrolltoindex)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
