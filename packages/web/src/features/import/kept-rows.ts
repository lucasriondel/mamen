import type { RowId } from "./wizard-reducer";

/**
 * Where the rows a **skipped row** decision leaves sit in the previewed table —
 * the positions a commit will actually write.
 *
 * Both preview paths ask this same question of the same two inputs since issue
 * #192: the CSV preview and the PDF **side-by-side validation** view — one table
 * on the same primitives since PRD #190's closing slice — each hold a list of
 * rows positional with their **stable row ids**, and each needs
 * the kept records for the commit rail and the kept **already imported** marks
 * for the bar's advisory count. Positions rather than rows, because the callers
 * read more than one list off them (records, duplicate flags) and a position
 * indexes all of them.
 *
 * A row whose id is missing from `rowIds` cannot have been skipped — nothing
 * could have named it — so it is kept, which is the direction this errs in
 * everywhere: the app never drops a row on its own judgement (epic #85).
 */
export function keptPositions(
  rowIds: readonly RowId[],
  skipped: ReadonlySet<RowId>,
): readonly number[] {
  const positions: number[] = [];
  rowIds.forEach((rowId, index) => {
    if (!skipped.has(rowId)) positions.push(index);
  });
  return positions;
}
