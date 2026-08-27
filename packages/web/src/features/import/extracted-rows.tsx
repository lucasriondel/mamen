import type { ExtractedTransaction } from "@mamen/shared/contract";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { AddRowButton } from "./add-row-button";
import { AmountInput } from "./amount-input";
import { amountColumn, dateColumn, rawIssuerColumn } from "./candidate-columns";
import { CandidatePane } from "./candidate-pane";
import { importColumn, type PreviewColumn, useCandidateTable } from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import { editableCellClass } from "./editable-cell";
import type { RowId, WizardAction } from "./wizard-reducer";

/** A `Date` as the `YYYY-MM-DD` value an `<input type="date">` expects (UTC). */
function toDateInputValue(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Parse a date-input `YYYY-MM-DD` back into a UTC `Date` (matches extraction). */
function fromDateInputValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const columnHelper = createColumnHelper<CandidateRow<ExtractedTransaction>>();

/**
 * The editable extracted-rows table: edit in place, skip a row, add a row.
 *
 * A real table since issue #193 — TanStack Table over the shared candidate-table
 * primitives ({@link useCandidateTable}) in the shared {@link CandidatePane}, so
 * the panel keys on the row's **stable row id** and reads its skips off row
 * selection. The three columns are the shared {@link dateColumn} and its siblings,
 * the same ones the CSV preview declares; what this path supplies is that each
 * cell is an *input*, which is the one real difference between the two previews —
 * a model's reading of a statement can be wrong in a way the user is the authority
 * on. The statement's own columns and the **row facets** over them are the shared
 * hook's (issue #195), read off the rows rather than named here, so both previews
 * offer one statement the same filters.
 *
 * The transactions grid is not reused: it renders persisted rows and a candidate
 * row is not one.
 *
 * Skipping replaced deleting (issue #192). A skipped row stays on screen struck
 * through with every one of its inputs disabled, and one click puts it back —
 * deleting bought nothing that skipping does not, and cost reversibility. The
 * disabling is the part that earned the change: an edit to a row that will not
 * commit is an edit thrown away.
 *
 * An edit still addresses a row by its `index`, which the candidate row carries:
 * `edit-extracted` patches the wizard's array in place. The ids name the rows, the
 * index reaches them.
 */
export function ExtractedRows({
  extracted,
  rowIds,
  skippedRows,
  duplicateFlags,
  dispatch,
}: {
  extracted: readonly ExtractedTransaction[];
  /** Positional with `extracted`: the row id a skip names each row by. */
  rowIds: readonly RowId[];
  /** The row ids held out of the commit. */
  skippedRows: readonly RowId[];
  /** Positional with `extracted`: does this row look already imported? */
  duplicateFlags: readonly boolean[];
  dispatch: (action: WizardAction) => void;
}) {
  /*
   * The `header` and `cell` entries below are TanStack **renderers**, not
   * components: the table calls them through `flexRender`, never as JSX, so none
   * of them has an identity React could remount on — the same reason the
   * transactions grid disables this rule over its column definitions.
   */
  // oxlint-disable react/no-unstable-nested-components
  const columns = useMemo<ReadonlyArray<PreviewColumn<ExtractedTransaction>>>(
    () => [
      importColumn<ExtractedTransaction>(),
      dateColumn(columnHelper, (candidate, isSkipped) => (
        <input
          type="date"
          aria-label={`Date, row ${candidate.index + 1}`}
          value={toDateInputValue(candidate.row.date)}
          disabled={isSkipped}
          onChange={(event) =>
            dispatch({
              type: "edit-extracted",
              index: candidate.index,
              patch: { date: fromDateInputValue(event.target.value) },
            })
          }
          className={editableCellClass({ struck: isSkipped })}
        />
      )),
      rawIssuerColumn(columnHelper, (candidate, isSkipped, marks) => (
        <div className="flex flex-col items-start gap-1">
          <input
            type="text"
            aria-label={`Raw issuer, row ${candidate.index + 1}`}
            value={candidate.row.rawIssuerString}
            disabled={isSkipped}
            onChange={(event) =>
              dispatch({
                type: "edit-extracted",
                index: candidate.index,
                patch: { rawIssuerString: event.target.value },
              })
            }
            className={editableCellClass({ struck: isSkipped })}
          />
          {marks}
        </div>
      )),
      amountColumn(columnHelper, (candidate, isSkipped) => (
        <AmountInput
          label={`Amount, row ${candidate.index + 1}`}
          value={candidate.row.amount}
          disabled={isSkipped}
          onChange={(amount) =>
            dispatch({
              type: "edit-extracted",
              index: candidate.index,
              patch: { amount },
            })
          }
        />
      )),
    ],
    // `dispatch` is `useReducer`'s, so this list never changes and neither does
    // the column identity — which is what keeps the input a user is typing into
    // from being remounted under them mid-keystroke. Everything else a cell needs
    // reaches it on the row.
    [dispatch],
  );
  // oxlint-enable react/no-unstable-nested-components

  const { table, facets } = useCandidateTable({
    rows: extracted,
    rowIds,
    duplicateFlags,
    columns,
    skippedRows,
    dispatch,
  });

  return (
    <CandidatePane
      table={table}
      facets={facets}
      label="Extracted transactions"
      footer={<AddRowButton onClick={() => dispatch({ type: "add-extracted" })} />}
    />
  );
}
