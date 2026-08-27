import type { DeclaredTotals, StatementFormatCreate } from "@mamen/shared/contract";
import { distinctMonths } from "./commit";
import { FileTable } from "./file-table";
import type { ParsedTransaction } from "./parsers/types";
import { PreviewFacts } from "./preview-facts";
import { PreviewTable } from "./preview-table";
import { reconcile } from "./reconcile";
import { ReviewStepLayout } from "./review-step-layout";
import { useRowHighlight } from "./row-highlight";
import { useKeptRecords } from "./use-kept-records";
import { useSplitRatio } from "./use-split-ratio";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * What this step's split shows until the user has dragged anything.
 *
 * Even, where the PDF path's is 60/40: a rendered statement page is a document
 * being read *from* and wants the greater share, but here both panes are tables
 * of the same rows, and the right one carries the filters, the skips and the
 * decision. The mapping step's form asks for less room than this table does,
 * which is why each step names its own default — and why the first drag replaces
 * every one of them (issue #210).
 */
const CSV_SPLIT_DEFAULT = 0.5;

/**
 * Step 2 (CSV path) — the mandatory, never-skippable preview: the dropped file's
 * own rows on the left, the format's reading of them on the right, the facts
 * above and the shared commit rail below.
 *
 * The frame is {@link ReviewStepLayout}, shared with the PDF path's
 * **side-by-side validation** view, and the table is {@link PreviewTable} on the
 * same **candidate-table primitives** since PRD #190's closing slice — so
 * skipping and filtering read identically whichever file the user dropped, and
 * both converge on the same commit rail. The two steps stay two components
 * because what they *are* differs: one is a file beside its parsed reading, the
 * other a rendered statement beside editable rows.
 *
 * Rows that look **already imported** are marked (issue #89) and counted in the
 * bar, and each row carries a **skip** control (epic #85). Nothing is ever held
 * out on the app's judgement: a marked row commits unless the user skips it.
 *
 * Every parsed row is listed, not a first-page sample: a mark the user cannot
 * reach is a mark they cannot act on. The table scrolls instead.
 *
 * **A transcription is corrected here** (issue #220, PRD #216). Since #218 a
 * discovered PDF statement reaches this very step — the transcribed table in the
 * left pane, the format's reading of it in the right — and there, unlike a CSV,
 * the left pane can be *wrong*. So `onEditCell` and `onAddRow` turn the file pane
 * into the place a wrong cell is fixed and a missed operation is typed in, and the
 * statement's own **declared totals** raise the soft reconciliation banner above
 * the split. All three are absent on the CSV path, which is the one deliberate
 * asymmetry between them: a file said what it said.
 *
 * Corrections land on the *transcribed cells*, never on the parsed values, which
 * is what keeps this step one reading of one table. The right pane, the commit and
 * each row's **raw source** are all `applyFormat` over the rows in the left pane,
 * so a corrected cell moves all three together and none of them can end up
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
   * lines, so the two lists differ in length and in order, and it is exactly that
   * difference the pairing has to survive. A record's id is the id of the line it
   * was read from, which is what makes the join sound.
   */
  sourceRowIds: readonly RowId[];
  /**
   * The **Statement Format** built from this file, saved by the commit itself
   * (issue #186); `null` for an import reading a stored one.
   */
  formatToCreate?: StatementFormatCreate | null;
  /**
   * The totals the statement itself printed, echoed by **discovery** (issue
   * #217). `null` on the CSV path — a file declares nothing — and for a statement
   * that printed no totals line, which are one state on purpose: either way no
   * check runs and no banner shows.
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

  // The same question the **side-by-side validation** view asks of the same three
  // inputs: a skip means the same thing on both paths (issue #192).
  const { kept, duplicateFlags, duplicateCount } = useKeptRecords({
    records,
    rowIds,
    skippedRows,
  });

  // Over the **kept** rows, where **side-by-side validation** sums every extracted
  // one (issue #196) — the two paths ask different questions and the banner says
  // which it ran. Here the user is assembling the import out of a transcription
  // they may correct, complete and hold rows out of, so what PRD #216 asks to be
  // cross-checked against the statement is what they end up with: skipping a row
  // *should* move these sums. `null` totals — every CSV, and a statement that
  // printed none — mean no check ran and nothing shows.
  const recon = reconcile(kept, declaredTotals);

  return (
    <ReviewStepLayout
      recon={recon}
      reconciledRows="kept"
      summary={
        <PreviewFacts
          parserLabel={parserLabel}
          accountName={accountName}
          months={distinctMonths(kept)}
          keptCount={kept.length}
          totalCount={records.length}
          // Whether anything was *held out*, not whether the two counts differ:
          // a skipped id that names no previewed row leaves the counts equal,
          // and "4 of 4" is a truer thing to say there than a bare "4".
          anySkipped={skippedRows.length > 0}
        />
      }
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
          duplicateFlags={duplicateFlags}
          skippedRows={skippedRows}
          highlight={highlight}
          dispatch={dispatch}
        />
      }
      kept={kept}
      duplicateCount={duplicateCount}
      formatToCreate={formatToCreate}
      onBack={onBack}
    />
  );
}
