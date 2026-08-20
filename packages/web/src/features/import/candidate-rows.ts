import type { RowId } from "./wizard-reducer";

/**
 * One previewed candidate row as the table sees it: the **stable row id** that
 * names it, where it sits in the wizard's arrays, its values, and whether it
 * looks **already imported** — the identity primitive both import previews build
 * their table on (issue #193).
 *
 * The wizard holds rows and ids as two positional arrays, which is the right
 * shape for the reducer and the wrong one for a table: TanStack asks each row
 * for its own key, and a row about to be filtered or reordered (issue #190)
 * cannot answer with the position it happens to sit at. Zipping them here is
 * what lets `getRowId` be a property of the row rather than a closure over an
 * index.
 *
 * `index` is the row's place in the arrays it came from, kept because what the
 * previews still address positionally is addressed by it: the `edit-extracted`
 * action's `index`, and the 1-based position the per-row controls are named by.
 *
 * The **already imported** flag is folded in here for the same reason the id is:
 * it arrives as a third positional array, and a cell that had to close over it
 * would give the column list a new identity on every render — which remounts the
 * editable inputs and loses the keystroke being typed into one.
 */
export type CandidateRow<T> = {
  /** The id a **skipped row** decision names this row by. */
  readonly rowId: RowId;
  /** Where the row sits in the wizard's arrays — what an edit patches. */
  readonly index: number;
  /** The row itself: an **extracted transaction** (PDF) or a parsed record (CSV). */
  readonly row: T;
  /** Does this row look **already imported** (issue #89)? Advisory only. */
  readonly duplicate: boolean;
};

/**
 * Ids that never came off the wizard's counter, for the row that somehow has
 * none. The counter starts at 1 and only ever climbs, so a negative id cannot
 * collide with a real one — the row gets a key of its own and a skip on it can
 * never name a different row.
 *
 * This should not happen: the reducer mints an id per row wherever rows are
 * minted. It is guarded rather than asserted because the alternative failure is
 * two rows sharing the key `undefined`, which is exactly the silent
 * skip-the-wrong-row bug the ids exist to prevent (epic #85).
 */
function fallbackRowId(index: number): RowId {
  return -(index + 1) as RowId;
}

/** Zip the wizard's positional rows, ids and marks into table rows. */
export function toCandidateRows<T>(
  rows: readonly T[],
  rowIds: readonly RowId[],
  duplicateFlags: readonly boolean[],
): ReadonlyArray<CandidateRow<T>> {
  return rows.map((row, index) => ({
    rowId: rowIds[index] ?? fallbackRowId(index),
    index,
    row,
    duplicate: duplicateFlags[index] === true,
  }));
}

/**
 * TanStack's `getRowId` for a candidate row — its **stable row id** as a string,
 * which is what makes the table's row selection *be* the set of skipped ids.
 */
export function candidateRowKey<T>(candidate: CandidateRow<T>): string {
  return String(candidate.rowId);
}
