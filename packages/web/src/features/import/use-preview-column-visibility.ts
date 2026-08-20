import type { VisibilityState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

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
 * Nothing is hidden yet — the four columns the panel shows are all it has
 * (issue #193 ships no toggleable columns) — so today this holds an empty state
 * and the table shows everything. It exists now so the table is already wired for
 * the raw-source columns rather than being rebuilt around them later.
 */
export function usePreviewColumnVisibility(): UsePreviewColumnVisibilityResult {
  const [columnVisibility, setState] = useState<VisibilityState>({});

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setState((old) => (typeof updater === "function" ? updater(old) : updater));
    },
    [],
  );

  return { columnVisibility, setColumnVisibility };
}
