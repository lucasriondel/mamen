import { useCallback, useEffect, useState } from "react";

/** Where the import wizard's divider position is persisted. */
export const IMPORT_SPLIT_RATIO_STORAGE_KEY = "mamen:import:split-ratio";

/**
 * Where the *reference statement*'s divider is persisted — the leftmost pane of
 * the three-pane mapping step (issue #219, PRD #216).
 *
 * A second key rather than a second reader of the first, because a screen with
 * two dividers on it asks two questions: how much room the statement takes, and
 * how the discovered table divides with the form. One stored answer would lock
 * the pair together — dragging either would jump the other on the next render —
 * and the second of the two is the divider every step already shares, which must
 * go on meaning what it means on the steps that have only it.
 */
export const STATEMENT_SPLIT_RATIO_STORAGE_KEY = "mamen:import:statement-ratio";

/**
 * How far the divider may be dragged, as the left pane's share of the width.
 *
 * The ends are not 0 and 1: a pane dragged to nothing is a pane whose content
 * the user can no longer see and — the divider being the only way back — no
 * longer reach either. Twenty percent is narrow enough to be "out of the way"
 * and wide enough to still read as a pane.
 */
export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

/** Hold a ratio inside the range the divider is allowed to reach. */
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return MIN_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

/**
 * Read the stored ratio, or `null` for "the step's own default".
 *
 * Only a number the divider could actually have produced is restored. Every
 * other outcome — no entry, unparseable text, a value of the wrong type, a
 * ratio outside the range, storage that refuses to be read at all — resolves to
 * `null` rather than to a clamped guess: a value this hook did not write is not
 * evidence of anything the user did, and the step's default is a better answer
 * than a repaired one.
 */
function readStored(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value < MIN_SPLIT_RATIO || value > MAX_SPLIT_RATIO) return null;
    return value;
  } catch {
    return null;
  }
}

function writeStored(key: string, ratio: number): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ratio));
  } catch {
    // Storage full or blocked — the position just doesn't survive a reload.
  }
}

export interface UseSplitRatioResult {
  /** The left pane's share of the width, in `0..1`. */
  ratio: number;
  /** Move the divider — what a drag and its keyboard equivalent call. */
  setRatio: (ratio: number) => void;
}

/**
 * The import wizard's divider position, persisted to `localStorage` (issue
 * #210, PRD #208). Shaped after {@link useSidebarCollapsed}, which is the app's
 * other piece of chrome a user sets once and expects to find where they left
 * it.
 *
 * Deliberately **not** wizard state. The reducer describes the import in
 * progress and is discarded with it, so a ratio kept there would reset every
 * time an import was abandoned — and where the user wants the panes is a fact
 * about them, not about the file in hand.
 *
 * One stored ratio, whatever step asks for it, because dragging is a preference
 * rather than a per-screen setting. Until the first drag there is nothing
 * stored and each step shows its own `fallback`: the right panel wants more
 * room beside an import table than beside a form, and guessing one number for
 * both would be worse than either default. The first drag replaces both.
 *
 * `key` is the one exception, and it is a *second divider on one screen* rather
 * than a second opinion about this one (issue #219): the three-pane mapping step
 * asks how much room the reference statement takes as well as how the table
 * divides with the form, and two dividers reading one entry would jump each
 * other. Left unsaid it is the shared position, which is what every step that
 * has a single divider wants.
 *
 * Storage is read once, to seed the state. Re-reading per render would race the
 * hook's own writes and could jump the divider out from under a drag in
 * progress.
 */
export function useSplitRatio(
  /** What this step shows until the user has dragged anything, in `0..1`. */
  fallback: number,
  /** Which stored position this divider is; the shared one unless said otherwise. */
  key: string = IMPORT_SPLIT_RATIO_STORAGE_KEY,
): UseSplitRatioResult {
  const [dragged, setDragged] = useState<number | null>(() => readStored(key));

  // Persisted as an effect rather than from inside the updater, for the reason
  // the sidebar's flag is: React treats updaters as pure and may run one twice
  // or on a render it then discards, and writing storage there can persist a
  // position the committed UI never adopted.
  //
  // The `null` guard is the "until the user drags" half of the contract: a step
  // that merely *rendered* must not write its own default over the other step's.
  useEffect(() => {
    if (dragged !== null) writeStored(key, dragged);
  }, [key, dragged]);

  const setRatio = useCallback((next: number) => setDragged(clampSplitRatio(next)), []);

  return { ratio: dragged ?? fallback, setRatio };
}
