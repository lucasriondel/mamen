import type { DeclaredTotals, StatementFormatCreate } from "@mamen/shared/contract";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { SplitView } from "@/components/split-view";
import { formatMonth } from "@/lib/format";
import { AlreadyImportedMark } from "./already-imported-mark";
import { CandidateFilters } from "./candidate-filters";
import {
  CandidateTable,
  type PreviewColumn,
  importColumn,
  isRowSkipped,
  SkippedNote,
  strikeWhileSkipped,
  useCandidateTable,
} from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import { distinctMonths } from "./commit";
import { CommitBar } from "./commit-bar";
import { FileTable } from "./file-table";
import { keptPositions } from "./kept-rows";
import type { ParsedTransaction } from "./parsers/types";
import { readableAmount, readableDate } from "./readable-cell";
import { reconcile } from "./reconcile";
import { ReconciliationBanner } from "./reconciliation-banner";
import { type RowHighlight, useRowHighlight } from "./row-highlight";
import { useDuplicateFlags } from "./use-duplicate-flags";
import { useSplitRatio } from "./use-split-ratio";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * What this step's split shows until the user has dragged anything.
 *
 * Even, where the PDF path's is 60/40: a rendered statement page is a document
 * being read *from* and wants the greater share, but here both panes are tables
 * of the same rows, and the right one carries the filters, the skips and the
 * decision. The mapping step's form asks for less room than this table does,
 * which is why each step names its own default — and why the first drag
 * replaces every one of them (issue #210).
 */
const CSV_SPLIT_DEFAULT = 0.5;

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
 *
 * Since issue #211 the dropped file itself is on screen beside all this, in the
 * shared {@link SplitView} the PDF path already uses: the statement's own rows
 * on the left, this table on the right, a draggable divider between them. The
 * table, its filters, its skips and the commit rail are exactly what they were —
 * only the space they occupy changed. Reading a row against the line that
 * produced it is what the PDF path has always offered and this one never did.
 *
 * The summary and the commit rail stay *outside* the split, where the PDF path
 * puts its banner and its own rail: they are about the import rather than about
 * either pane, and the moment that matters is not one to make the user find a
 * scroll position for.
 *
 * **A transcription is corrected here** (issue #220, PRD #216). Since #218 a
 * discovered PDF statement reaches this very step — the transcribed table in the
 * left pane, the format's reading of it in the right — and there, unlike a CSV,
 * the left pane can be *wrong*. So `onEditCell` and `onAddRow` turn the file
 * pane into the place a wrong cell is fixed and a missed operation is typed in,
 * and the statement's own **declared totals** raise the soft reconciliation
 * banner above the split. All three are absent on the CSV path, which is the one
 * deliberate asymmetry between them: a file said what it said.
 *
 * Corrections land on the *transcribed cells*, never on the parsed values, which
 * is what keeps this step one reading of one table. The right pane, the commit
 * and each row's **raw source** are all `applyFormat` over the rows in the left
 * pane, so a corrected cell moves all three together and none of them can end up
 * claiming something the others deny.
 */
export function PreviewStep({
  records,
  rowIds,
  skippedRows,
  accountName,
  parserLabel,
  fileName,
  headers,
  rows,
  sourceRowIds,
  formatToCreate,
  declaredTotals = null,
  onBack,
  dispatch,
  onEditCell,
  onAddRow,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the **stable row id** a skip names each row by. */
  rowIds: readonly RowId[];
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
  accountName: string;
  parserLabel: string;
  /** The dropped file's name — what the pane beside the table is called. */
  fileName: string;
  /** The file's real header row, for the pane beside the table. */
  headers: readonly string[];
  /** Every row of the file, as delivered — the pane shows all of them. */
  rows: ReadonlyArray<Record<string, string>>;
  /**
   * Positional with `rows`: the id of each *line of the file* (issue #215).
   *
   * Not `rowIds`, which names the parsed records — the format's row filter drops
   * lines, so the two lists differ in length and in order, and it is exactly
   * that difference the pairing has to survive. A record's id is the id of the
   * line it was read from, which is what makes the join sound.
   */
  sourceRowIds: readonly RowId[];
  /**
   * The **Statement Format** built from this file, saved by the commit itself
   * (issue #186); `null` for an import reading a stored one.
   */
  formatToCreate?: StatementFormatCreate | null;
  /**
   * The totals the statement itself printed, echoed by **discovery** (issue
   * #217). `null` on the CSV path — a file declares nothing — and for a
   * statement that printed no totals line, which are one state on purpose:
   * either way no check runs and no banner shows.
   */
  declaredTotals?: DeclaredTotals | null;
  onBack: () => void;
  dispatch: (action: WizardAction) => void;
  /** Correct one transcribed cell; absent wherever the left pane is a file. */
  onEditCell?: (rowIndex: number, column: string, value: string) => void;
  /** Add an operation the transcription missed; absent for the same reason. */
  onAddRow?: () => void;
}) {
  // Where the user left the divider — chrome rather than import state, so it is
  // one position shared with the PDF path's split and it outlives this import.
  const { ratio, setRatio } = useSplitRatio(CSV_SPLIT_DEFAULT);
  // Which line of the file the cursor is on, or which parsed row — one fact,
  // because they are the same row seen twice (issue #215). Held here, above both
  // panes, since neither of them can know about the other.
  const highlight = useRowHighlight();
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

  // Over the **kept** rows, where **side-by-side validation** sums every
  // extracted one (issue #196) — the two paths ask different questions and the
  // banner says which it ran. Here the user is assembling the import out of a
  // transcription they may correct, complete and hold rows out of, so what PRD
  // #216 asks to be cross-checked against the statement is what they end up
  // with: skipping a row *should* move these sums. `null` totals — every CSV,
  // and a statement that printed none — mean no check ran and nothing shows.
  const recon = reconcile(kept, declaredTotals);

  return (
    <div className="flex flex-col gap-6">
      {recon === null || recon.ok ? null : <ReconciliationBanner recon={recon} rows="kept" />}

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

      <SplitView
        // Tall enough to read a statement in, and the reason each pane has
        // something to scroll *inside*: a single scrolling column would carry
        // the file off the top of the screen on the way down the rows (#210).
        className="h-[85vh]"
        ratio={ratio}
        onRatioChange={setRatio}
        left={
          <FileTable
            fileName={fileName}
            headers={headers}
            rows={rows}
            rowIds={sourceRowIds}
            highlight={highlight}
            onEditCell={onEditCell}
            onAddRow={onAddRow}
          />
        }
        right={
          <PreviewTable
            records={records}
            rowIds={rowIds}
            duplicateFlags={duplicates.flags}
            skippedRows={skippedRows}
            highlight={highlight}
            dispatch={dispatch}
          />
        }
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
      columnHelper.accessor((candidate) => candidate.row.date, {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className={`tabular-nums ${strikeWhileSkipped(isRowSkipped(row))}`}>
            {readableDate(row.original.row.date)}
          </span>
        ),
      }),
      columnHelper.accessor((candidate) => candidate.row.rawIssuerString, {
        id: "rawIssuer",
        header: "Raw issuer",
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className={strikeWhileSkipped(isRowSkipped(row))}>
              {row.original.row.rawIssuerString}
            </span>
            {row.original.duplicate ? <AlreadyImportedMark /> : null}
            {isRowSkipped(row) ? <SkippedNote /> : null}
          </span>
        ),
      }),
      columnHelper.accessor((candidate) => candidate.row.amount, {
        id: "amount",
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) => (
          <span
            className={`block text-right tabular-nums ${strikeWhileSkipped(isRowSkipped(row))} ${
              row.original.row.amount < 0 ? "text-gousse-high" : "text-gousse-low"
            }`}
          >
            {readableAmount(row.original.row.amount)}
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
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroll container: the filters say what the table below is
          showing, so they must not scroll away from it (issue #195). */}
      <CandidateFilters table={table} facets={facets} />

      {/* The rows are what scrolls, inside whatever height the divider leaves
          this pane — so the filters above stay put and the file in the other
          pane stays exactly where it was (issues #210, #211). `min-h-0` is what
          lets a flex child be shorter than its content. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CandidateTable table={table} label="Rows to import" highlight={highlight} />
      </div>
    </div>
  );
}
