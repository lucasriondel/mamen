import type { VisibilityState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

/** Where the transactions table's column visibility preference is persisted. */
const STORAGE_KEY = "mamen:transactions:column-visibility";

/**
 * Columns the user may hide, in the order they appear in the toggle menu. The
 * ids match the table's column ids; `date` and `amount` are deliberately absent
 * — they are the row's identity (what/when/how much), so hiding them would leave
 * a table that can't be read.
 */
export const TOGGLEABLE_COLUMNS = [
  { id: "account", label: "Account" },
  { id: "issuer", label: "Issuer" },
  { id: "rawIssuer", label: "Raw issuer" },
  { id: "category", label: "Category" },
  { id: "excluded", label: "Excluded" },
  { id: "notes", label: "Notes" },
] as const;

/** A column id the toggle menu can hide. */
export type ToggleableColumnId = (typeof TOGGLEABLE_COLUMNS)[number]["id"];

const TOGGLEABLE_IDS = new Set<string>(TOGGLEABLE_COLUMNS.map((c) => c.id));

/**
 * Read the stored preference, keeping only known toggleable ids. A stale entry
 * (a column that has since been renamed or removed) is dropped rather than
 * failing the read, so an old localStorage value can never hide a column the
 * toggle menu no longer offers a way to bring back.
 */
function readStored(): VisibilityState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object") return {};
    const result: VisibilityState = {};
    for (const [id, visible] of Object.entries(parsed)) {
      if (TOGGLEABLE_IDS.has(id) && typeof visible === "boolean") {
        result[id] = visible;
      }
    }
    return result;
  } catch {
    // Unparseable/unavailable storage (private mode, corrupted value) is not
    // worth failing the view over — fall back to "everything visible".
    return {};
  }
}

function writeStored(state: VisibilityState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — the preference just doesn't survive a reload.
  }
}

export interface UseColumnVisibilityResult {
  /** The TanStack `columnVisibility` state to hand to `useReactTable`. */
  columnVisibility: VisibilityState;
  /** `onColumnVisibilityChange` handler; also persists the new state. */
  setColumnVisibility: (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => void;
  /** Show every toggleable column again. */
  reset: () => void;
}

/**
 * Column visibility for the transactions table, persisted to `localStorage`.
 *
 * Which columns you want to see is a display preference rather than part of the
 * query, so — unlike the filters, sort and offset — it deliberately does *not*
 * live in the URL: it should follow the user across navigations and shared links
 * shouldn't impose the sender's layout on the recipient.
 */
export function useColumnVisibility(): UseColumnVisibilityResult {
  const [columnVisibility, setState] = useState<VisibilityState>(readStored);

  // Persist as an effect rather than from inside the `setState` updater. React
  // treats updaters as pure and may run one twice (StrictMode) or on a render it
  // then discards — writing storage there can persist a preference the committed
  // UI never adopted, leaving the table and the next page load disagreeing.
  useEffect(() => {
    writeStored(columnVisibility);
  }, [columnVisibility]);

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setState((old) => (typeof updater === "function" ? updater(old) : updater));
    },
    [],
  );

  const reset = useCallback(() => setColumnVisibility({}), [setColumnVisibility]);

  return { columnVisibility, setColumnVisibility, reset };
}
