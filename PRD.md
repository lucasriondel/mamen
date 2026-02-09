# Transaction List Rework: TanStack Table DataTable

## Context

The current transaction list uses a custom virtual list (`@tanstack/react-virtual`) with hand-rolled keyboard navigation and multi-select hooks. The UI and navigation are broken and need a full rework. The goal is to replace this with a proper TanStack Table DataTable that provides built-in row selection, column sorting, and a cleaner interaction model with three distinct concepts: **cursor** (keyboard highlight), **selection** (checkbox-based multi-select), and **hover** (mouse-based action targeting).

## Interaction Model

Three separate concepts, clearly delineated:

| Concept | Trigger | Visual | Purpose |
|---------|---------|--------|---------|
| **Cursor** | Arrow keys / J/K / click on row | `bg-muted/30` full-row background | Keyboard navigation target |
| **Selection** | Checkbox / Space/X / Shift+Arrow | Checkbox checked + `bg-ring/8` + left border | Batch action target |
| **Hover** | Mouse hover | `hover:bg-muted/50` (CSS only) | Action target when nothing else active |

**Action key dispatch** (R, C, F, D):
1. If rows are selected → act on all selected rows (batch)
2. Else if cursor is active → act on cursor row
3. Else if a row is hovered → act on hovered row
4. Otherwise → no-op

## New Files

### `src/features/transactions/components/TransactionDataTable/columns.tsx`
Column definitions for TanStack Table:
- **Select checkbox** — header has "select all", cells have per-row checkbox
- **Date** — `formatDate(row.original.date)`, sortable
- **Description** — `rawMerchantString` + `NewMerchantBadge`, sortable
- **Category** — `CategoryBadge` / Unmatched / Matched badges + Manual badge + AnomalyBadge + excluded duplicate badge
- **Amount** — `formatCurrency`, refund badge, link icon, sortable

Callbacks and animation state passed via `table.options.meta` typed as `TransactionTableMeta`.

### `src/features/transactions/components/TransactionDataTable/useTransactionTableKeyboard.ts`
Replaces `useKeyboardNavigation` + inline `onAction` for this feature. Manages:
- `cursorRowId` movement via Arrow/J/K
- Shift+Arrow range selection using TanStack Table's `row.toggleSelected()`
- Space/X toggles selection on cursor row
- Escape: clear selection first, then clear cursor
- R/C/F/D action keys: resolves target via the 3-tier priority (selection > cursor > hover)
- Same guards as current: skip when modal open, skip inputs/textareas
- Scroll-to-cursor via virtualizer ref

### `src/features/transactions/components/TransactionDataTable/index.tsx`
Main component (~350 lines). Combines:
- Existing data hooks: `useFocusMode`, `useFilteredTransactions`, `useDrillDownFilter`, `useLiveQuery` for merchants
- `useReactTable` with `getCoreRowModel`, `getSortedRowModel`, row selection, `getRowId: (row) => String(row.id)`
- `useVirtualizer` on body container (same config: estimateSize 48, overscan 5)
- Cursor state (`cursorRowId`) + hover state (`hoveredRowId`)
- All existing modal state/handlers (MerchantAssignment, QuickCategoryPicker, RefundLink) — copied from current component
- New delete flow via `useDeleteTransactions`
- Cascade animation integration via `useCascadeAnimation`
- Empty states and drill-down filter bar — copied from current component
- Renders: sticky header (div-based, matching current column header style) + virtualized body rows + `SelectionStatusBar` + modals

**Rendering approach**: div-based rows with flex layout (not `<table>` elements) since virtualization requires absolute positioning. Styled with same Tailwind classes. TanStack Table is used purely for state management (selection, sorting, column model), not DOM structure.

### `src/features/transactions/components/TransactionDataTable/DeleteConfirmDialog.tsx`
Wraps shadcn `AlertDialog` (`src/components/ui/alert-dialog.tsx`). Props: `open`, `onOpenChange`, `count`, `onConfirm`, `isDeleting`.

### `src/features/transactions/services/deleteTransactions.ts`
```
deleteTransactions(ids: number[]) → { deletedCount, previousStates: Transaction[] }
undoDeleteTransactions(previousStates: Transaction[]) → void
```
Pattern follows `src/features/transactions/services/batchCategoryAssign.ts` — Dexie `rw` transaction, `bulkGet` for snapshots, `bulkDelete`, `bulkPut` for undo.

### `src/features/transactions/services/deleteTransactions.test.ts`
Unit tests: delete, undo, empty array edge case.

### `src/features/transactions/hooks/useDeleteTransactions.ts`
React hook wrapping the service. Manages confirmation dialog state (`isDeleteDialogOpen`, `pendingDeleteIds`). On confirm: calls service, shows toast with Undo action (10s window). Pattern follows `src/features/transactions/hooks/useBatchCategoryAssign.ts`.

## Modified Files

### `package.json`
Add `@tanstack/react-table` dependency.

### `src/features/transactions/components/TransactionList/index.tsx`
Replace entire contents with re-export:
```typescript
export { TransactionDataTable as TransactionList } from '../TransactionDataTable'
```
This preserves backward compatibility — `src/features/transactions/index.ts` and `src/routes/transactions.tsx` both import `TransactionList`.

### `src/features/transactions/index.ts`
No change needed (imports `TransactionList` from `./components/TransactionList` which re-exports).

### `src/components/SelectionStatusBar/index.tsx`
Add `D` key hint for delete alongside existing R and C hints.

### `src/routes/transactions.tsx`
Add `D` key shortcut hint in the keyboard footer.

## Files That Become Unused (cleanup)

- `src/components/TransactionRow/index.tsx` — rendering logic moves into column cell definitions. Delete after migration.
- `src/hooks/useKeyboardNavigation.ts` — replaced by `useTransactionTableKeyboard`. Keep if used elsewhere; check imports.
- `src/hooks/useMultiSelect.ts` — replaced by TanStack Table `rowSelection`. Keep if used elsewhere; check imports.

## Implementation Order

### Phase 1: Foundation
1. Install `@tanstack/react-table`
2. Create `deleteTransactions.ts` service + tests
3. Create `useDeleteTransactions.ts` hook

### Phase 2: DataTable Core
4. Create `columns.tsx` with all 5 column definitions + `TransactionTableMeta` type
5. Create `useTransactionTableKeyboard.ts` hook
6. Create `DeleteConfirmDialog.tsx`
7. Create `TransactionDataTable/index.tsx` — the main component with all integrations

### Phase 3: Integration
8. Replace `TransactionList/index.tsx` with re-export
9. Update `SelectionStatusBar` with D key hint
10. Update `routes/transactions.tsx` footer with D key hint

### Phase 4: Cleanup
11. Delete `src/components/TransactionRow/index.tsx`
12. Check if `useKeyboardNavigation` and `useMultiSelect` are imported elsewhere; if not, delete

### Phase 5: Testing & Verification
13. Run existing tests — ensure re-export alias doesn't break anything
14. Manual verification: keyboard nav (J/K/arrows), cursor highlighting, checkbox selection, Shift+Arrow range, hover targeting, R/C/F/D actions, delete with undo, column sorting, empty states, drill-down filter, cascade animations

## Verification

1. **Run tests**: `npm test` — all existing tests should pass through the re-export
2. **Manual test keyboard nav**: Open `/transactions`, press J/K — cursor moves with `bg-muted/30` highlight, no ring outline
3. **Manual test selection**: Click checkboxes, press Space/X on cursor row — rows get selected with checkbox + accent styling
4. **Manual test Shift+Arrow**: Hold Shift + press J/K — range selection extends
5. **Manual test hover actions**: Hover a row with nothing selected, press R — merchant modal opens for that row
6. **Manual test delete**: Select rows, press D — confirmation dialog appears, confirm deletes, toast shows with Undo
7. **Manual test sorting**: Click Date/Amount column headers — rows reorder
8. **Manual test existing flows**: R (merchant), C (category), F (refund) all still work in single and batch mode
