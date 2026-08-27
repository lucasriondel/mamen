import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { amountColumn, amountToneClass, dateColumn, rawIssuerColumn } from "./candidate-columns";
import { CandidatePane } from "./candidate-pane";
import {
  importColumn,
  type PreviewColumn,
  strikeWhileSkipped,
  useCandidateTable,
} from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import type { ParsedTransaction } from "./parsers/types";
import { readableAmount, readableDate } from "./readable-cell";
import type { RowHighlight } from "./row-highlight";
import type { RowId, WizardAction } from "./wizard-reducer";

const columnHelper = createColumnHelper<CandidateRow<ParsedTransaction>>();

/**
 * The parsed rows, as they will be written. Read-only except for the skip: this
 * path has no editable values (the file said what it said), so the one decision
 * left is whether a row belongs in the import at all.
 *
 * The same table as **side-by-side validation** since PRD #190's last slice —
 * TanStack Table over the shared **candidate-table primitives**
 * ({@link useCandidateTable}) in the shared {@link CandidatePane}, so both paths
 * key on the row's **stable row id**, read their skips off row selection, and
 * offer the statement's own columns as **row facets** and hidden columns. The
 * three columns themselves come from {@link dateColumn} and its siblings, so the
 * two previews cannot come to disagree about what a preview row *is*; what each
 * supplies is only what a cell renders as, which is the one real difference
 * between them.
 *
 * Two previews sharing components rather than one component behind capability
 * flags: this one has no editable cell, no add-row control and no reconciliation
 * banner, and none of that reaches it.
 *
 * The statement's columns are not named here. They are read off the rows' **raw
 * source** inside the shared hook, so a CSV and a PDF of one statement cannot
 * offer two different sets of filters.
 *
 * A skipped row stays where it was, struck through and saying so — it is not
 * removed from the table. Removing it would leave the user no way back short of
 * dropping the file again, and this is a preview: the point of it is that every
 * row the statement holds is accounted for on screen.
 */
export function PreviewTable({
  records,
  rowIds,
  duplicateFlags,
  skippedRows,
  highlight,
  dispatch,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the row id a skip names each row by. */
  rowIds: readonly RowId[];
  /** Positional with `records`: does this row look already imported? */
  duplicateFlags: readonly boolean[];
  /** The row ids held out of the commit. */
  skippedRows: readonly RowId[];
  /** The pairing with the file pane opposite (issue #215). */
  highlight: RowHighlight;
  dispatch: (action: WizardAction) => void;
}) {
  /*
   * The `header` and `cell` entries below are TanStack **renderers**, not
   * components: the table calls them through `flexRender`, never as JSX — the
   * same reason the side-by-side panel and the transactions grid disable this
   * rule over their column definitions.
   */
  // oxlint-disable react/no-unstable-nested-components
  const columns = useMemo<ReadonlyArray<PreviewColumn<ParsedTransaction>>>(
    () => [
      importColumn<ParsedTransaction>(),
      dateColumn(columnHelper, (candidate, isSkipped) => (
        <span className={`tabular-nums ${strikeWhileSkipped(isSkipped)}`}>
          {readableDate(candidate.row.date)}
        </span>
      )),
      rawIssuerColumn(columnHelper, (candidate, isSkipped, marks) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className={strikeWhileSkipped(isSkipped)}>{candidate.row.rawIssuerString}</span>
          {marks}
        </span>
      )),
      amountColumn(columnHelper, (candidate, isSkipped) => (
        <span
          className={`${amountToneClass(candidate.row.amount)} ${strikeWhileSkipped(isSkipped)}`}
        >
          {readableAmount(candidate.row.amount)}
        </span>
      )),
    ],
    // A read-only cell closes over nothing, so the column list is built once and
    // the table never sees a new column identity.
    [],
  );
  // oxlint-enable react/no-unstable-nested-components

  const { table, facets } = useCandidateTable({
    rows: records,
    rowIds,
    duplicateFlags,
    columns,
    skippedRows,
    dispatch,
  });

  return (
    <CandidatePane table={table} facets={facets} label="Rows to import" highlight={highlight} />
  );
}
