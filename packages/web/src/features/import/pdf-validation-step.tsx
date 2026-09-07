import type { DeclaredTotals, ExtractedTransaction } from "@mamen/shared/contract";
import { ExtractedRows } from "./extracted-rows";
import { ExtractionSummary } from "./extraction-summary";
import type { ParsedTransaction } from "./parsers/types";
import { PdfPane } from "./pdf-pane";
import { reconcile } from "./reconcile";
import { ReviewStepLayout } from "./review-step-layout";
import { useKeptRecords } from "./use-kept-records";
import { useSplitRatio } from "./use-split-ratio";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * What this step's split shows until the user has dragged anything — the
 * three-to-two grid it replaced, as a ratio. A statement page is the thing being
 * read *from*, so it takes the greater share; the rows are being read *against*
 * it. A step whose right panel needs more room (the mapping form) names its own
 * default, and the first drag replaces both.
 */
const PDF_SPLIT_DEFAULT = 0.6;

/**
 * Step 2 (PDF path) — the **side-by-side validation** view, the heart of #34.
 * The source PDF renders in the browser's native viewer (a blob-URL iframe, no
 * pdfjs) on one side; the **extracted transactions** sit in an editable table on
 * the other. The user corrects wrong values, skips the phantom ones, and adds
 * missed ones in place — whatever the table keeps at commit is what commits. A
 * soft **reconciliation check** flags (never blocks) a sum mismatch against the
 * statement's **declared totals**.
 *
 * The frame is {@link ReviewStepLayout}, shared with the CSV preview: the banner
 * above, the two panes in the shared `SplitView` (issue #210) where this step used
 * to own a fixed `lg:grid-cols-[3fr_2fr]`, and the same commit rail below. The
 * table beside the statement is {@link ExtractedRows}, on the same candidate-table
 * primitives and the same three columns the CSV preview declares — what differs is
 * that every cell here is an input.
 *
 * What the extraction returned — its row count and its wall-clock duration — is
 * surfaced here rather than on the upload step: the account is settled before the
 * drop (issue #181), so a successful extraction always lands straight on this view
 * and the upload step's copy is only ever seen on the way back. Both halves are
 * read off the wizard's snapshot of the extraction rather than off the rows below,
 * which the user is editing (issue #202).
 *
 * A row that looks **already imported** is marked here too (issue #89) — this is
 * the preview where acting on the mark is one click, since every row carries a
 * **skip** that holds it out of the commit. The rows are index-aligned with
 * `records` (each extracted row is enriched into exactly one) and with `rowIds`,
 * so one index reads a row, its mark and the id a skip names it by.
 *
 * The two counts on this view deliberately disagree (issue #190). The bar counts
 * the rows that will be *written*, so a skip takes a row out of it. The
 * reconciliation check sums every *extracted* row, skipped ones included: it
 * judges whether the model read the statement correctly, not whether the user
 * chose to import all of it, and summing kept rows would fire the banner on every
 * deliberate skip until the user learned to ignore it. That difference is the
 * whole of what `reconciledRows` carries into the shared banner (issue #220).
 */
export function PdfValidationStep({
  records,
  rowIds,
  skippedRows,
  extracted,
  declaredTotals,
  file,
  extraction,
  onBack,
  dispatch,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records` / `extracted`: the row id a skip names each by. */
  rowIds: readonly RowId[];
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
  extracted: readonly ExtractedTransaction[];
  /** `null` when the statement printed no totals line — no check runs (#196). */
  declaredTotals: DeclaredTotals | null;
  file: File;
  /** What the extraction returned; `null` when none was recorded (issue #202). */
  extraction: { readonly rowCount: number; readonly ms: number } | null;
  onBack: () => void;
  dispatch: (action: WizardAction) => void;
}) {
  // Where the user left the divider, which is chrome rather than import state:
  // it is not in the reducer, so abandoning this import does not reset it.
  const { ratio, setRatio } = useSplitRatio(PDF_SPLIT_DEFAULT);

  // The same question the CSV preview asks of the same three inputs: a skip names
  // a row the same way on both paths, so where the kept rows sit is one question
  // with one answer (issue #192).
  const { kept, duplicateFlags, duplicateCount } = useKeptRecords({
    records,
    rowIds,
    skippedRows,
  });

  // Over every extracted row, skips included — see the note above. `null` back
  // means no check ran at all (the statement printed no totals), which is not a
  // mismatch and shows nothing.
  const recon = reconcile(records, declaredTotals);

  return (
    <ReviewStepLayout
      recon={recon}
      reconciledRows="extracted"
      summary={extraction === null ? null : <ExtractionSummary extraction={extraction} />}
      ratio={ratio}
      onRatioChange={setRatio}
      left={<PdfPane file={file} />}
      right={
        <ExtractedRows
          extracted={extracted}
          rowIds={rowIds}
          skippedRows={skippedRows}
          duplicateFlags={duplicateFlags}
          dispatch={dispatch}
        />
      }
      kept={kept}
      duplicateCount={duplicateCount}
      onBack={onBack}
    />
  );
}
