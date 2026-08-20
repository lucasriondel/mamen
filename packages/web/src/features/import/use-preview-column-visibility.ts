import type { VisibilityState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

export interface UsePreviewColumnVisibilityResult {
  /** The TanStack `columnVisibility` state to hand to `useReactTable`. */
  columnVisibility: VisibilityState;
  /** TanStack's `onColumnVisibilityChange` handler. */
  setColumnVisibility: (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => void;
}

/**
 * Column visibility for an import preview's table — the third primitive both
 * previews compose (issue #193), and the one place their columns can be hidden
 * from.
 *
 * Deliberately **not** the transactions table's `useColumnVisibility`, which this
 * otherwise mirrors. That hook persists to `localStorage` and validates ids
 * against a fixed list of the transactions grid's columns; an import preview's
 * hideable columns are read off the statement in hand (issue #195), so there is
 * no list to validate against, and a preference is not supposed to outlive the
 * wizard: a choice made against last month's statement silently hiding a column
 * of this month's is precisely what the PRD rules out. State, not storage.
 *
 * The defaulting runs the *opposite* way to the transactions grid's, which is
 * why the hideable ids are a parameter rather than a constant. Every one of them
 * is a **raw-source** column read off the statement, and they are **hidden until
 * asked for**: a French bank's export carries thirteen columns where the common
 * import shows four, so showing them all would make the wall of columns the
 * default and the readable table the thing you configure. The user's own choices
 * are laid over that default, so a column shown stays shown while the statement
 * does.
 *
 * The preview's own columns are never in the list. Date, operation label and
 * amount are what makes a row readable at all, and a table that can hide them is
 * a table that can be made unreadable.
 */
export function usePreviewColumnVisibility(
  /** The ids hidden until asked for — the statement's own columns. */
  hideableColumnIds: readonly string[],
): UsePreviewColumnVisibilityResult {
  const [chosen, setChosen] = useState<VisibilityState>({});

  // The ids are expected to keep their identity for as long as the statement
  // does — see `useStableList` in `candidate-table.tsx`. A fresh object here on
  // every render would hand the table a new visibility state on every keystroke
  // typed into an editable cell.
  const columnVisibility = useMemo<VisibilityState>(() => {
    const hidden: VisibilityState = {};
    for (const id of hideableColumnIds) hidden[id] = false;
    return { ...hidden, ...chosen };
  }, [hideableColumnIds, chosen]);

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setChosen((old) => (typeof updater === "function" ? updater(old) : updater));
    },
    [],
  );

  return { columnVisibility, setColumnVisibility };
}
