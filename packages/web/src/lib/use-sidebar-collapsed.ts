import { useCallback, useEffect, useState } from "react";

/** Where the sidebar's collapsed flag is persisted. */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "mamen:sidebar:collapsed";

/**
 * Read the stored flag. Only a literal `true` collapses the panel.
 *
 * Every other outcome — no entry, unparseable text, a value of the wrong type,
 * storage that refuses to be read at all — resolves to *open*. That asymmetry
 * is deliberate: the sidebar is the app's whole navigation surface, so the
 * failure mode of guessing wrong in one direction is a panel the user has to
 * close again, and in the other a session with no way to get anywhere. The
 * cheap mistake is the only one this may make.
 */
function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (raw == null) return false;
    return (JSON.parse(raw) as unknown) === true;
  } catch {
    return false;
  }
}

function writeStored(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // Storage full or blocked — the preference just doesn't survive a reload.
  }
}

export interface UseSidebarCollapsedResult {
  /** Whether the panel is collapsed. Drives both axes of gousse's shell. */
  collapsed: boolean;
  /** Flip it — what the header's close button, the trigger and the scrim call. */
  toggle: () => void;
}

/**
 * The sidebar's collapsed flag, persisted to `localStorage` (issue #106).
 *
 * A user who closed the sidebar to get room did not ask for it back on the next
 * navigation, so this is a preference rather than view state — and, like the
 * transactions table's column visibility, deliberately not in the URL: a shared
 * link shouldn't impose the sender's chrome on the recipient.
 *
 * Storage is read once, to seed the state. Re-reading per render would race the
 * hook's own writes and let a value written elsewhere flip the panel mid-click.
 */
export function useSidebarCollapsed(): UseSidebarCollapsedResult {
  const [collapsed, setCollapsed] = useState<boolean>(readStored);

  // Persist as an effect rather than from inside the updater. React treats
  // updaters as pure and may run one twice (StrictMode) or on a render it then
  // discards — writing storage there can persist a state the committed UI never
  // adopted, leaving the panel and the next page load disagreeing.
  useEffect(() => {
    writeStored(collapsed);
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  return { collapsed, toggle };
}
