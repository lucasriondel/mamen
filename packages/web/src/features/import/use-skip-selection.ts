import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import type { RowId, WizardAction } from "./wizard-reducer";

export interface UseSkipSelectionResult {
  /** The TanStack `rowSelection` state to hand to `useReactTable`. */
  rowSelection: RowSelectionState;
  /** TanStack's `onRowSelectionChange` handler — dispatches skips and restores. */
  onRowSelectionChange: (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
}

/**
 * The selection primitive shared by both import previews (issue #193):
 * **a selected row is a row that will be imported**.
 *
 * The table holds no selection of its own. `skippedRows` on the wizard state is
 * projected — inverted — into TanStack's `rowSelection`, and every change TanStack
 * proposes is turned back into `skip-row` / `restore-row` actions. So the checkbox
 * reads the reducer and writes to it, and there is no second copy of the decision
 * to fall out of step with the strike-through, the disabled inputs or the commit
 * bar.
 *
 * The reducer still records the *skip*, because that is the decision the user
 * makes — the default is to import everything, and holding a row out is the
 * departure from it worth naming. The checkbox says the opposite of that, because
 * a ticked box means "yes, this one" everywhere else in the app, and a preview
 * whose ticks mean "drop this" reads backwards. The inversion is this one
 * projection and nothing else: `rowIds` is what makes it possible, since a kept
 * row has to be nameable even though nothing in the state names it.
 *
 * Keyed by **stable row id** (see `candidateRowKey`), never by position: TanStack's
 * default row key is the row's index, and the whole point of the ids is that a
 * skip names a row rather than wherever it currently sits (issue #190).
 *
 * One action per changed row, because that is what the reducer takes. It is also
 * what let the select-all over the *filtered* rows (issue #195) land without
 * touching this: whatever set TanStack proposes, this diffs it and dispatches the
 * difference — fifteen restores from one click read the same way as one.
 */
export function useSkipSelection(
  rowIds: readonly RowId[],
  skippedRows: readonly RowId[],
  dispatch: (action: WizardAction) => void,
): UseSkipSelectionResult {
  const rowSelection = useMemo<RowSelectionState>(() => {
    const skipped = new Set(skippedRows);
    return Object.fromEntries(
      rowIds.filter((rowId) => !skipped.has(rowId)).map((rowId) => [String(rowId), true]),
    );
  }, [rowIds, skippedRows]);

  const onRowSelectionChange = useCallback(
    (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      // Deselecting is skipping. TanStack drops a row's key rather than setting it
      // to `false` when it deselects, so the rows to skip are read off what *was*
      // selected and no longer is, not off `next`'s own entries.
      for (const key of Object.keys(rowSelection)) {
        if (next[key] !== true) {
          dispatch({ type: "skip-row", rowId: Number(key) as RowId });
        }
      }
      for (const [key, selected] of Object.entries(next)) {
        if (selected && rowSelection[key] !== true) {
          dispatch({ type: "restore-row", rowId: Number(key) as RowId });
        }
      }
    },
    [rowSelection, dispatch],
  );

  return { rowSelection, onRowSelectionChange };
}
