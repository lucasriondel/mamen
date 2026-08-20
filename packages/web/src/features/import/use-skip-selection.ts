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
 * **a selected row is a skipped row**.
 *
 * The table holds no selection of its own. `skippedRows` on the wizard state is
 * projected into TanStack's `rowSelection`, and every change TanStack proposes is
 * turned back into `skip-row` / `restore-row` actions — so the checkbox reads the
 * reducer and writes to it, and there is no second copy of the decision to fall
 * out of step with the strike-through, the disabled inputs or the commit bar.
 *
 * Keyed by **stable row id** (see `candidateRowKey`), never by position: TanStack's
 * default row key is the row's index, and the whole point of the ids is that a
 * skip names a row rather than wherever it currently sits (issue #190).
 *
 * One action per changed row, because that is what the reducer takes. It is also
 * what makes a future select-all over the *filtered* rows (issue #195) work here
 * unchanged: whatever set TanStack proposes, this diffs it and dispatches the
 * difference.
 */
export function useSkipSelection(
  skippedRows: readonly RowId[],
  dispatch: (action: WizardAction) => void,
): UseSkipSelectionResult {
  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(skippedRows.map((rowId) => [String(rowId), true])),
    [skippedRows],
  );

  const onRowSelectionChange = useCallback(
    (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      for (const [key, selected] of Object.entries(next)) {
        if (selected && rowSelection[key] !== true) {
          dispatch({ type: "skip-row", rowId: Number(key) as RowId });
        }
      }
      for (const key of Object.keys(rowSelection)) {
        if (next[key] !== true) {
          dispatch({ type: "restore-row", rowId: Number(key) as RowId });
        }
      }
    },
    [rowSelection, dispatch],
  );

  return { rowSelection, onRowSelectionChange };
}
