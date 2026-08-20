import { Undo2, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { AlreadyImportedMark } from "./already-imported-mark";
import { distinctMonths } from "./commit";
import { CommitBar } from "./commit-bar";
import { keptPositions } from "./kept-rows";
import type { ParsedTransaction } from "./parsers/types";
import { useDuplicateFlags } from "./use-duplicate-flags";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * Step 2 (CSV path) — the mandatory, never-skippable preview. Shows the detected
 * format, target account, the month(s) found, and the row count, then a table of
 * the parsed rows, and the shared {@link CommitBar}. The PDF path uses its own
 * side-by-side validation view; both converge on the same commit rail.
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
        skipped={skipped}
        dispatch={dispatch}
      />

      <CommitBar records={kept} duplicateCount={duplicateCount} onBack={onBack} />
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

/**
 * The parsed rows, as they will be written. Read-only except for the skip: this
 * path has no editable values (the CSV said what it said), so the one decision
 * left is whether a row belongs in the import at all.
 */
function PreviewTable({
  records,
  rowIds,
  duplicateFlags,
  skipped,
  dispatch,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the row id a skip names each row by. */
  rowIds: readonly RowId[];
  /** Positional with `records`: does this row look already imported? */
  duplicateFlags: readonly boolean[];
  /** The row ids held out of the commit. */
  skipped: ReadonlySet<RowId>;
  dispatch: (action: WizardAction) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gousse-line">
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gousse-panel text-gousse-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Raw issuer</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              {/* The row-actions column: named for assistive tech rather than
                  left blank, the same way the table columns elsewhere are. */}
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const rowId = rowIds[index];
              return (
                <PreviewRow
                  key={rowId}
                  record={record}
                  position={index + 1}
                  duplicate={duplicateFlags[index] === true}
                  skipped={skipped.has(rowId)}
                  onSkip={() => dispatch({ type: "skip-row", rowId })}
                  onRestore={() => dispatch({ type: "restore-row", rowId })}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One previewed row. A skipped row stays where it was, struck through and saying
 * so — it is not removed from the table. Removing it would leave the user no way
 * back short of dropping the file again, and this is a preview: the point of it
 * is that every row the statement holds is accounted for on screen.
 */
function PreviewRow({
  record,
  position,
  duplicate,
  skipped,
  onSkip,
  onRestore,
}: {
  record: ParsedTransaction;
  /** The row's 1-based place in the table, as the controls name it. */
  position: number;
  duplicate: boolean;
  skipped: boolean;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const struck = skipped ? "line-through" : "";

  return (
    <tr className="border-gousse-line border-t">
      <td className="px-3 py-2 text-gousse-ink">
        <span className={`tabular-nums ${struck}`}>{formatShortDate(record.date)}</span>
      </td>
      <td className="px-3 py-2 text-gousse-ink">
        <span className="flex flex-wrap items-center gap-2">
          <span className={struck}>{record.rawIssuerString}</span>
          {duplicate ? <AlreadyImportedMark /> : null}
          {skipped ? (
            <span className="whitespace-nowrap text-gousse-muted text-xs">
              Skipped — won't be imported
            </span>
          ) : null}
        </span>
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${struck} ${
          record.amount < 0 ? "text-gousse-high" : "text-gousse-low"
        }`}
      >
        {formatCurrency(record.amount)}
      </td>
      <td className="px-3 py-2 text-right">
        {skipped ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Restore row ${position}`}
            onClick={onRestore}
          >
            <Undo2 size={14} aria-hidden />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Skip row ${position}`} onClick={onSkip}>
            <X size={14} aria-hidden />
          </Button>
        )}
      </td>
    </tr>
  );
}
