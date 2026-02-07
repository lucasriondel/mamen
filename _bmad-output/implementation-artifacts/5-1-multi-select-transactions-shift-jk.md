# Story 5.1: Multi-Select Transactions (Shift+J/K)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to select multiple transactions using Shift+J/K**,
So that **I can perform batch operations efficiently (FR17)**.

## Acceptance Criteria

1. **Given** I have focused a transaction with J/K
   **When** I press `Shift+J`
   **Then** the selection extends to include the next transaction
   **And** both the original and new transaction show selected state
   **And** a selection count appears: "2 selected"

2. **Given** I have focused a transaction
   **When** I press `Shift+K`
   **Then** the selection extends to include the previous transaction

3. **Given** I have multiple transactions selected
   **When** I continue pressing `Shift+J` or `Shift+K`
   **Then** the selection continues to extend
   **And** the selection count updates in real-time

4. **Given** I have transactions selected
   **When** I view the transaction list
   **Then** selected transactions have a distinct visual state (checkbox visible, background highlight)
   **And** the selection count shows in a status bar or floating indicator

5. **Given** I have transactions selected
   **When** I press `Esc`
   **Then** all selections are cleared
   **And** focus returns to single-transaction mode

6. **Given** I have transactions selected
   **When** I press `J` or `K` without Shift
   **Then** selection is cleared
   **And** focus moves to a single transaction (standard navigation)

7. **Given** I want to select non-contiguous transactions
   **When** I navigate to another transaction and press `Space` or `X`
   **Then** that transaction toggles its selection state
   **And** I can build a non-contiguous selection

## Tasks / Subtasks

- [ ] Task 1: Create useMultiSelect hook (AC: #1, #2, #3, #5, #6, #7)
  - [ ] Create `src/hooks/useMultiSelect.ts`
  - [ ] Create `src/hooks/useMultiSelect.test.ts`
  - [ ] Props/return type:
    ```typescript
    type UseMultiSelectReturn = {
      selectedIds: Set<string>
      selectionAnchorId: string | null
      isSelecting: boolean
      selectionCount: number
      toggleSelection: (id: string) => void
      extendSelection: (id: string) => void
      clearSelection: () => void
      isSelected: (id: string) => boolean
      selectRange: (fromId: string, toId: string, orderedIds: string[]) => void
    }
    ```
  - [ ] Selection anchor: Track the first selected item for range operations
  - [ ] Range selection: `extendSelection` adds all items between anchor and target
  - [ ] Toggle selection: `toggleSelection` for non-contiguous selection (Space/X key)
  - [ ] Clear on Esc or on plain J/K navigation
  - [ ] Use `Set<string>` for O(1) lookup performance
  - [ ] Named exports only, use `type` not `interface`

- [ ] Task 2: Integrate Shift+J/K into useKeyboardNavigation hook (AC: #1, #2, #3, #6)
  - [ ] Modify `src/hooks/useKeyboardNavigation.ts` (or create if not yet present)
  - [ ] Detect `Shift+J` and `Shift+K` key combinations
  - [ ] On `Shift+J`:
    1. If no selection yet, set current focused item as anchor
    2. Move focus to next item
    3. Call `extendSelection` with new focused item
  - [ ] On `Shift+K`:
    1. If no selection yet, set current focused item as anchor
    2. Move focus to previous item
    3. Call `extendSelection` with new focused item
  - [ ] On plain `J`/`K` (no Shift):
    1. Call `clearSelection()`
    2. Standard single-item navigation
  - [ ] Ensure keyboard events don't fire when input/textarea is focused
  - [ ] Performance: <16ms response (60fps) for all keyboard interactions

- [ ] Task 3: Add non-contiguous selection via Space/X key (AC: #7)
  - [ ] In keyboard handler, detect `Space` or `X` key press on focused transaction
  - [ ] Call `toggleSelection(focusedId)` to toggle selection state
  - [ ] Do NOT move focus after toggle (user stays on current item)
  - [ ] If toggling off the last selected item, clear selection mode
  - [ ] Prevent `Space` from scrolling the page (call `e.preventDefault()`)

- [ ] Task 4: Update TransactionRow to show selected state (AC: #4)
  - [ ] Modify `src/components/TransactionRow/index.tsx`
  - [ ] Add `isSelected` prop to TransactionRow:
    ```typescript
    type TransactionRowProps = {
      // ... existing props
      isSelected: boolean
      onToggleSelect?: () => void
    }
    ```
  - [ ] Selected state visual:
    - Background: `hsl(var(--ring) / 0.1)` subtle highlight
    - Left border: 2px solid `hsl(var(--ring))` accent indicator
    - Checkbox: Show a small filled checkbox on the left when selected
  - [ ] Transition: Smooth 100ms transition for selection state changes
  - [ ] Ensure selected state is visually distinct from focused state
  - [ ] Selected + Focused: Both highlight + focus ring visible

- [ ] Task 5: Create SelectionStatusBar component (AC: #4)
  - [ ] Create `src/components/SelectionStatusBar/index.tsx`
  - [ ] Create `src/components/SelectionStatusBar/SelectionStatusBar.test.tsx`
  - [ ] Props type:
    ```typescript
    type SelectionStatusBarProps = {
      count: number
      onClear: () => void
    }
    ```
  - [ ] Render when `count > 0`:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │  ✓ 4 selected     [R] Assign merchant  [C] Category  [Esc] Clear │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [ ] Position: Fixed bottom bar or floating indicator above transaction list
  - [ ] Show available batch actions as hints (R, C for future stories 5.2 and 5.3)
  - [ ] Show Esc to clear
  - [ ] Animate in/out (slide up on appear, slide down on disappear)
  - [ ] Respect `prefers-reduced-motion`

- [ ] Task 6: Wire selection into TransactionList (AC: #1-7)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] Instantiate `useMultiSelect` hook
  - [ ] Pass `isSelected` prop to each `TransactionRow`
  - [ ] Render `SelectionStatusBar` when selection count > 0
  - [ ] Ensure virtualized list (TanStack Virtual) re-renders selected rows correctly
  - [ ] Pass ordered transaction IDs to multi-select for range calculation
  - [ ] Wire Esc key to clear selection

- [ ] Task 7: Handle selection with virtualized scrolling (AC: #3, #4)
  - [ ] Ensure selection state persists when rows scroll out of view
  - [ ] Selection stored in `useMultiSelect` hook (not in row component state)
  - [ ] When scrolling, re-entering rows check `isSelected(id)` from the hook
  - [ ] TanStack Virtual only renders visible rows; selection state is centralized
  - [ ] Scroll-into-view: When extending selection, ensure the newly selected row is visible

- [ ] Task 8: Accessibility for multi-select (AC: #4)
  - [ ] Transaction rows: `aria-selected="true"` when selected
  - [ ] Selection count announced via `aria-live="polite"` region
  - [ ] Screen reader: "4 transactions selected. Press Escape to clear selection."
  - [ ] Selection status bar: `role="status"` with live region
  - [ ] Ensure focus management works correctly with selection

- [ ] Task 9: Write unit and integration tests (AC: all)
  - [ ] Test: Shift+J extends selection to next item
  - [ ] Test: Shift+K extends selection to previous item
  - [ ] Test: Continued Shift+J/K keeps extending selection
  - [ ] Test: Plain J/K clears selection and moves focus
  - [ ] Test: Esc clears all selections
  - [ ] Test: Space/X toggles individual selection
  - [ ] Test: Non-contiguous selection via Space/X works
  - [ ] Test: Selection count updates in real-time
  - [ ] Test: Selected rows show visual state (checkbox, highlight)
  - [ ] Test: SelectionStatusBar appears when count > 0
  - [ ] Test: SelectionStatusBar disappears when selection cleared
  - [ ] Test: Selection persists across virtual scroll (rows leaving/entering view)
  - [ ] Test: Selection works with 1000+ transactions (performance)
  - [ ] Test: aria-selected attribute toggles correctly
  - [ ] Test: Shift+J at last item doesn't crash
  - [ ] Test: Shift+K at first item doesn't crash

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| UI State | React context or minimal Zustand | Selection is UI-only state, NOT persisted to Dexie |
| Virtual List | TanStack Virtual | Same ecosystem, maintains 60fps with 1000+ rows |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### Selection State Architecture

**CRITICAL: Selection is UI-only state, NOT Dexie data.**

- Transaction data lives in Dexie (queried via `useLiveQuery`)
- Selection state lives in the `useMultiSelect` hook (React state)
- The hook stores a `Set<string>` of selected transaction IDs
- This is ephemeral - clears on navigation away, page reload, etc.
- DO NOT store selection state in Dexie or any persistent store

### Keyboard Event Handling Pattern

**Source: [ux-design-specification.md#Keyboard-Patterns]**

The keyboard handler must:
1. Check `event.target` - skip if user is typing in an input/textarea
2. Check modifier keys: `event.shiftKey` for Shift+J/K
3. Call `event.preventDefault()` for handled keys (prevent scroll on Space)
4. Use `event.key` (not `event.keyCode` which is deprecated)

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // Skip if typing in input
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  switch (e.key) {
    case 'j':
    case 'J':
      if (e.shiftKey) {
        e.preventDefault()
        handleExtendSelectionDown()
      } else {
        handleClearAndMoveDown()
      }
      break
    case 'k':
    case 'K':
      if (e.shiftKey) {
        e.preventDefault()
        handleExtendSelectionUp()
      } else {
        handleClearAndMoveUp()
      }
      break
    case ' ':
    case 'x':
    case 'X':
      e.preventDefault()
      handleToggleCurrentSelection()
      break
    case 'Escape':
      handleClearSelection()
      break
  }
}
```

### Previous Story Intelligence

**From Epic 4 stories (4.1 through 4.8):**

Stories 4.1-4.8 established these patterns that MUST be followed:
- **TransactionRow component** exists at `src/components/TransactionRow/index.tsx`
- **Keyboard navigation hook** (`useKeyboardNavigation`) established in Story 3.2
- **Focus state** on TransactionRow uses ring color focus ring
- **Toast with Undo** pattern established for all data mutations
- **`useLiveQuery`** pattern for all Dexie data access
- **Cascade animation** from Story 4.8 - selection highlight must not conflict with cascade highlight
- **Quick actions** (R, C, F keys) from Stories 4.3, 4.7 - these actions should work on multi-selected transactions too (future Stories 5.2, 5.3)

**Key patterns from Story 4.8:**
- `useReducedMotion` hook exists at `src/hooks/useReducedMotion.ts`
- CSS animation patterns respect `prefers-reduced-motion`
- AnimatedCounter component exists at `src/components/AnimatedCounter/index.tsx`

**From Story 3.2 (Keyboard Navigation):**
- J/K moves focus up/down in transaction list
- Focus state uses visible focus ring (`:focus-visible`)
- Keyboard events attached to document/container level
- Events skip when input is focused

### UX Specification

**Source: [ux-design-specification.md#List-Navigation]**

| Shortcut | Action |
|----------|--------|
| `J` | Move focus down |
| `K` | Move focus up |
| `Shift+J` | Extend selection down |
| `Shift+K` | Extend selection up |

**Source: [ux-design-specification.md#Transaction-Row-States]**

| State | Appearance |
|-------|------------|
| Default | Standard row styling |
| Focused | Ring outline (ring color), subtle background elevation |
| **Selected** | **Checkbox visible, background highlight** |
| **Multi-selected** | **Part of batch selection, count indicator** |

**Source: [ux-design-specification.md#Batch-Operations]**

- Shift+J/K selects, action applies to all
- Selection count visible
- R key on multi-select opens batch merchant assignment (Story 5.2)
- C key on multi-select opens batch category assignment (Story 5.3)

### Visual Design for Selected State

**Source: [ux-design-specification.md#Color-System]**

Selected row styling:
```css
/* Selected state - subtle ring color tint */
.transaction-row-selected {
  background-color: hsl(var(--ring) / 0.08);
  border-left: 2px solid hsl(var(--ring));
}

/* Selected + Focused: combine both */
.transaction-row-selected:focus-visible {
  background-color: hsl(var(--ring) / 0.12);
  outline: 2px solid hsl(var(--ring));
  outline-offset: -2px;
}
```

Selection count indicator:
```css
.selection-status-bar {
  background-color: hsl(var(--card));
  border-top: 1px solid hsl(var(--border));
  padding: 8px 16px;
  font-size: 13px;
}
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| UI interaction response | <100ms |
| Keyboard response | <16ms (60fps) |
| Scroll performance | 60fps with 1000+ rows |

Selection must be O(1) for:
- `isSelected(id)` check - `Set.has()` is O(1)
- `toggleSelection(id)` - `Set.add/delete()` is O(1)
- Selection count - `Set.size` is O(1)

Range selection (`selectRange`) will be O(n) where n = range size, which is acceptable since the user manually extends one item at a time.

### TanStack Virtual Integration Notes

Selection state is centralized in the `useMultiSelect` hook, NOT in individual row components. TanStack Virtual only renders visible rows, so:

1. Selection data (`Set<string>`) lives in the hook (parent level)
2. Each rendered row receives `isSelected={multiSelect.isSelected(tx.id)}`
3. When rows scroll out of view and back, they re-check the centralized state
4. No selection data is lost during virtual scrolling

### Dependencies on Previous Stories

This story depends on:
- **Story 3.1:** Transaction List View (TransactionList component, virtualized with TanStack Virtual)
- **Story 3.2:** Keyboard Navigation with J/K (useKeyboardNavigation hook, focus management)

### Preparation for Future Stories

This story provides foundation for:
- **Story 5.2:** Batch Merchant Assignment - R key opens merchant modal for all selected
- **Story 5.3:** Batch Category Assignment - C key opens category picker for all selected
- **Story 5.4:** Focus Mode Current Month (M key) - filtering combined with selection
- **Story 5.5:** Focus Mode Subscriptions (S key) - filtering combined with selection

The `SelectionStatusBar` should show hints for R and C batch actions, even though those aren't implemented yet. The hints prepare the user for Stories 5.2 and 5.3.

### Project Structure for This Story

```
src/
├── hooks/
│   ├── useMultiSelect.ts (new)
│   ├── useMultiSelect.test.ts (new)
│   └── useKeyboardNavigation.ts (modify - add Shift+J/K)
├── components/
│   ├── TransactionRow/
│   │   └── index.tsx (modify - add isSelected prop + visual state)
│   └── SelectionStatusBar/
│       ├── index.tsx (new)
│       └── SelectionStatusBar.test.tsx (new)
└── features/
    └── transactions/
        └── components/
            └── TransactionList/
                └── index.tsx (modify - wire multi-select)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate Dexie data in React state (selection is UI state, not Dexie data)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT store selection in Dexie (it's ephemeral UI state)
- DO NOT use deprecated `event.keyCode` - use `event.key`
- DO NOT handle keyboard events in individual rows - handle at container/document level

### Validation Checklist

Before marking complete:
- [ ] Shift+J extends selection to next transaction
- [ ] Shift+K extends selection to previous transaction
- [ ] Continued Shift+J/K keeps extending selection
- [ ] Selection count indicator appears and updates
- [ ] Selected rows have visible distinct state (checkbox + highlight)
- [ ] Plain J/K (no shift) clears selection and navigates
- [ ] Esc clears all selections
- [ ] Space/X toggles individual selection (non-contiguous)
- [ ] Selection persists during virtual scroll
- [ ] SelectionStatusBar shows with count > 0
- [ ] Batch action hints shown (R, C) in status bar
- [ ] Keyboard response <16ms
- [ ] 60fps scroll with selected rows
- [ ] aria-selected toggles on rows
- [ ] aria-live announces selection count
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-5-Story-5.1-Multi-Select-Transactions]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Frontend-Architecture]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#List-Navigation]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: ux-design-specification.md#Transaction-Row-States]
- [Source: ux-design-specification.md#Batch-Operations]
- [Story 3.1: Transaction List View]
- [Story 3.2: Keyboard Navigation with J/K]
- [Story 4.8: Cascade Animation Feedback (useReducedMotion hook)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
