import type { StatementFormatCreate } from "@mamen/shared/contract";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { AlreadyImportedMark } from "./already-imported-mark";
import { CandidateFilters } from "./candidate-filters";
import {
  CandidateTable,
  type PreviewColumn,
  skipColumn,
  SkippedNote,
  strikeWhileSkipped,
  useCandidateTable,
} from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import { distinctMonths } from "./commit";
import { CommitBar } from "./commit-bar";
import { keptPositions } from "./kept-rows";
import type { ParsedTransaction } from "./parsers/types";
import { useDuplicateFlags } from "./use-duplicate-flags";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * Step 2 (CSV path) — the mandatory, never-skippable preview. Shows the detected
 * format, target account, the month(s) found, and the row count, then a table of
 * the parsed rows, and the shared {@link CommitBar}. The PDF path keeps its own
 * side-by-side validation view — editable, with an add-row control and a
 * reconciliation banner — but the *table* is the same one on the same
 * **candidate-table primitives** since PRD #190's closing slice, so skipping and
 * filtering read identically whichever file the user dropped. Both converge on
 * the same commit rail.
 *
 * Rows that look **already imported** are marked (issue #89) and counted in the
 * bar, and each row carries a **skip** control (epic #85) — the recourse for a
 * marked row, on this path as on the PDF one. Nothing is ever held out on the
 * app's judgement: a marked row commits unless the user skips it.
 *
 * Every parsed row is listed, not a first-page sample: a mark the user cannot
 * reach is a mark they cannot act on. The table scrolls instead.
 *
 * The facts above the table count the rows that will actually be written, so
 * skipping the only row of a month drops that month from the summary — what the
 * commit does is what the preview says.
 */
export function PreviewStep({
  records,
  rowIds,
  skippedRows,
  accountName,
  parserLabel,
  formatToCreate,
  onBack,
  dispatch,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the **stable row id** a skip names each row by. */
  rowIds: readonly RowId[];
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
  accountName: string;
  parserLabel: string;
  /**
   * The **Statement Format** built from this file, saved by the commit itself
   * (issue #186); `null` for an import reading a stored one.
   */
  formatToCreate?: StatementFormatCreate | null;
  onBack: () => void;
  dispatch: (action: WizardAction) => void;
}) {
  const skipped = useMemo(() => new Set(skippedRows), [skippedRows]);
  // Where the kept rows sit, asked once and read twice — the same call the
  // **side-by-side validation** view makes, since a skip means the same thing on
  // both paths (issue #192).
  const keep = useMemo(() => keptPositions(rowIds, skipped), [rowIds, skipped]);
  const kept = useMemo(() => keep.map((index) => records[index]), [keep, records]);
  const months = distinctMonths(kept);

  // Flagged over ALL rows — the flags are positional with `records`, which is
  // what the table renders — but counted over the kept ones only: the bar's line
  // is about what this commit is going to write.
  const duplicates = useDuplicateFlags(records);
  const duplicateCount = keep.filter((index) => duplicates.flags[index]).length;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-gousse-line bg-gousse-panel p-4 text-sm sm:grid-cols-4">
        <Fact label="Format" value={parserLabel} />
        <Fact label="Account" value={accountName} />
        <Fact label="Months" value={months.map(formatMonth).join(", ")} />
        {/* Kept of parsed — what the commit will write. The line the filters
            carry ("Showing 2 of 4 rows") answers the other question, what is on
            screen: a filtered-out row is hidden, not held out, and commits. */}
        <Fact
          label="Rows"
          value={
            skipped.size === 0 ? String(records.length) : `${kept.length} of ${records.length}`
          }
        />
      </dl>

      <PreviewTable
        records={records}
        rowIds={rowIds}
        duplicateFlags={duplicates.flags}
        skippedRows={skippedRows}
        dispatch={dispatch}
      />

      <CommitBar
        records={kept}
        duplicateCount={duplicateCount}
        formatToCreate={formatToCreate}
        onBack={onBack}
      />
    </div>
  );
}

/** One labelled fact in the preview summary grid. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-gousse-muted">{label}</dt>
      <dd className="font-medium text-gousse-ink">{value}</dd>
    </div>
  );
}

const columnHelper = createColumnHelper<CandidateRow<ParsedTransaction>>();

/**
 * The parsed rows, as they will be written. Read-only except for the skip: this
 * path has no editable values (the CSV said what it said), so the one decision
 * left is whether a row belongs in the import at all.
 *
 * The same table as **side-by-side validation** since PRD #190's last slice —
 * TanStack Table over the shared **candidate-table primitives**
 * ({@link useCandidateTable}), so both paths key on the row's **stable row id**,
 * read their skips off row selection, and offer the statement's own columns as
 * **row facets** and hidden columns. Two previews sharing primitives rather than
 * one component behind capability flags: this one has no editable cell, no
 * add-row control and no reconciliation banner, and none of that reaches it.
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
function PreviewTable({
  records,
  rowIds,
  duplicateFlags,
  skippedRows,
  dispatch,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the row id a skip names each row by. */
  rowIds: readonly RowId[];
  /** Positional with `records`: does this row look already imported? */
  duplicateFlags: readonly boolean[];
  /** The row ids held out of the commit. */
  skippedRows: readonly RowId[];
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
      skipColumn<ParsedTransaction>(),
      columnHelper.accessor((candidate) => candidate.row.date, {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className={`tabular-nums ${strikeWhileSkipped(row.getIsSelected())}`}>
            {formatShortDate(row.original.row.date)}
          </span>
        ),
      }),
      columnHelper.accessor((candidate) => candidate.row.rawIssuerString, {
        id: "rawIssuer",
        header: "Raw issuer",
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className={strikeWhileSkipped(row.getIsSelected())}>
              {row.original.row.rawIssuerString}
            </span>
            {row.original.duplicate ? <AlreadyImportedMark /> : null}
            {row.getIsSelected() ? <SkippedNote /> : null}
          </span>
        ),
      }),
      columnHelper.accessor((candidate) => candidate.row.amount, {
        id: "amount",
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) => (
          <span
            className={`block text-right tabular-nums ${strikeWhileSkipped(row.getIsSelected())} ${
              row.original.row.amount < 0 ? "text-gousse-high" : "text-gousse-low"
            }`}
          >
            {formatCurrency(row.original.row.amount)}
          </span>
        ),
      }),
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
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroll container: the filters say what the table below is
          showing, so they must not scroll away from it (issue #195). */}
      <CandidateFilters table={table} facets={facets} />

      <div className="max-h-[60vh] overflow-y-auto">
        <CandidateTable table={table} />
      </div>
    </div>
  );
}
