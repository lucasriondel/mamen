import type { DeclaredTotals, ExtractedTransaction } from "@mamen/shared/contract";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { AlreadyImportedMark } from "./already-imported-mark";
import { CandidateFilters } from "./candidate-filters";
import {
  CandidateTable,
  type PreviewColumn,
  skipColumn,
  SkippedNote,
  useCandidateTable,
} from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import { CommitBar } from "./commit-bar";
import { formatExtractionTime } from "./format-extraction-time";
import { keptPositions } from "./kept-rows";
import type { ParsedTransaction } from "./parsers/types";
import { type Reconciliation, reconcile } from "./reconcile";
import { useDuplicateFlags } from "./use-duplicate-flags";
import type { RowId, WizardAction } from "./wizard-reducer";

/** A `Date` as the `YYYY-MM-DD` value an `<input type="date">` expects (UTC). */
function toDateInputValue(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Parse a date-input `YYYY-MM-DD` back into a UTC `Date` (matches extraction). */
function fromDateInputValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Step 2 (PDF path) — the **side-by-side validation** view, the heart of #34.
 * The source PDF renders in the browser's native viewer (a blob-URL iframe, no
 * pdfjs) on one side; the **extracted transactions** sit in an editable table on
 * the other. The user corrects wrong values, skips the phantom ones, and adds
 * missed ones in place — whatever the table keeps at commit is what commits. A
 * soft **reconciliation check** flags (never blocks) a sum mismatch against the
 * statement's **declared totals**. Commit runs the shared rail via {@link CommitBar}.
 *
 * What the extraction returned — its row count and its wall-clock duration — is
 * surfaced here rather than on the upload step: the account is settled before the
 * drop (issue #181), so a successful extraction always lands straight on this
 * view and the upload step's copy is only ever seen on the way back. Both halves
 * are read off the wizard's snapshot of the extraction rather than off the rows
 * below, which the user is editing (issue #202).
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
 * deliberate skip until the user learned to ignore it.
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
  const skipped = useMemo(() => new Set(skippedRows), [skippedRows]);
  // Over every extracted row, skips included — see the note above. `null` back
  // means no check ran at all (the statement printed no totals), which is not a
  // mismatch and shows nothing.
  const recon = reconcile(records, declaredTotals);
  // Flagged over all rows (the flags are positional with the table) but counted
  // over the kept ones: the bar's line is about what this commit will write.
  const duplicates = useDuplicateFlags(records);
  // The same call the CSV preview makes: a skip names a row the same way on both
  // paths, so where the kept rows sit is one question with one answer.
  const keep = keptPositions(rowIds, skipped);
  const kept = keep.map((index) => records[index]);
  const duplicateCount = keep.filter((index) => duplicates.flags[index]).length;

  return (
    <div className="flex flex-col gap-6">
      {recon === null || recon.ok ? null : <ReconciliationBanner recon={recon} />}

      {extraction === null ? null : <ExtractionSummary extraction={extraction} />}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <PdfPane file={file} />
        <ExtractedRows
          extracted={extracted}
          rowIds={rowIds}
          skippedRows={skippedRows}
          duplicateFlags={duplicates.flags}
          dispatch={dispatch}
        />
      </div>

      <CommitBar records={kept} duplicateCount={duplicateCount} onBack={onBack} />
    </div>
  );
}

/**
 * How many rows the model read, and how long it took. The count is of what was
 * *extracted*, not what is on screen now — the user's edits below change the
 * table, not what the extraction returned.
 *
 * Which is why it is handed the wizard's snapshot rather than the rows (issue
 * #202): `extracted.length` grows every time the user adds an operation the model
 * missed, so rendering it here had this line claim the extraction returned rows
 * that were typed in after it had finished.
 */
function ExtractionSummary({
  extraction,
}: {
  extraction: { readonly rowCount: number; readonly ms: number };
}) {
  const { rowCount } = extraction;
  return (
    <p className="text-sm text-gousse-muted">
      <span className="font-medium text-gousse-ink">{rowCount}</span>{" "}
      {rowCount === 1 ? "transaction" : "transactions"} extracted in{" "}
      {formatExtractionTime(extraction.ms)}
    </p>
  );
}

/** The source PDF in the browser's native viewer, via a revocable blob URL. */
function PdfPane({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    // The src is a blob of the file the user just picked, rendered by the
    // browser's own PDF viewer — and every sandbox value strict enough to
    // satisfy the rule stops that viewer running.
    // oxlint-disable-next-line react/iframe-missing-sandbox
    <iframe
      title="PDF statement"
      src={url ?? undefined}
      className="h-[85vh] w-full rounded-2xl border border-gousse-line bg-gousse-panel"
    />
  );
}

const columnHelper = createColumnHelper<CandidateRow<ExtractedTransaction>>();

/** The pill an editable cell wears, struck through while the row is skipped. */
function fieldClass(isSkipped: boolean): string {
  return `w-full rounded-full border border-gousse-line bg-gousse-bg px-3 py-1 text-gousse-ink ${
    isSkipped ? "line-through opacity-60" : ""
  }`;
}

/**
 * The editable extracted-rows table: edit in place, skip a row, add a row.
 *
 * A real table since issue #193 — TanStack Table over the shared candidate-table
 * primitives ({@link useCandidateTable}), so the panel keys on the row's **stable
 * row id** and reads its skips off row selection. The transactions grid is not
 * reused: it renders persisted rows and a candidate row is not one. The columns
 * declared here are the ones the view always showed — date, raw issuer, amount —
 * behind the shared skip checkbox; the statement's own columns and the **row
 * facets** over them are the shared hook's (issue #195), read off the rows rather
 * than named here, so both previews offer one statement the same filters.
 *
 * Skipping replaced deleting (issue #192). A skipped row stays on screen struck
 * through with every one of its inputs disabled, and one click puts it back —
 * deleting bought nothing that skipping does not, and cost reversibility. The
 * disabling is the part that earned the change: an edit to a row that will not
 * commit is an edit thrown away.
 *
 * An edit still addresses a row by its `index`, which the candidate row carries:
 * `edit-extracted` patches the wizard's array in place. The ids name the rows,
 * the index reaches them.
 */
function ExtractedRows({
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
      skipColumn<ExtractedTransaction>(),
      columnHelper.accessor((candidate) => candidate.row.date, {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <input
            type="date"
            aria-label={`Date, row ${row.original.index + 1}`}
            value={toDateInputValue(row.original.row.date)}
            disabled={row.getIsSelected()}
            onChange={(event) =>
              dispatch({
                type: "edit-extracted",
                index: row.original.index,
                patch: { date: fromDateInputValue(event.target.value) },
              })
            }
            className={fieldClass(row.getIsSelected())}
          />
        ),
      }),
      columnHelper.accessor((candidate) => candidate.row.rawIssuerString, {
        id: "rawIssuer",
        header: "Raw issuer",
        cell: ({ row }) => {
          const isSkipped = row.getIsSelected();
          return (
            <div className="flex flex-col items-start gap-1">
              <input
                type="text"
                aria-label={`Raw issuer, row ${row.original.index + 1}`}
                value={row.original.row.rawIssuerString}
                disabled={isSkipped}
                onChange={(event) =>
                  dispatch({
                    type: "edit-extracted",
                    index: row.original.index,
                    patch: { rawIssuerString: event.target.value },
                  })
                }
                className={fieldClass(isSkipped)}
              />
              {row.original.duplicate ? <AlreadyImportedMark /> : null}
              {isSkipped ? <SkippedNote /> : null}
            </div>
          );
        },
      }),
      columnHelper.accessor((candidate) => candidate.row.amount, {
        id: "amount",
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) => (
          <AmountInput
            label={`Amount, row ${row.original.index + 1}`}
            value={row.original.row.amount}
            disabled={row.getIsSelected()}
            onChange={(amount) =>
              dispatch({
                type: "edit-extracted",
                index: row.original.index,
                patch: { amount },
              })
            }
          />
        ),
      }),
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
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroll container: the filters say what the table below is
          showing, so they must not scroll away from it (issue #195). */}
      <CandidateFilters table={table} facets={facets} />

      <div className="max-h-[85vh] overflow-y-auto">
        <CandidateTable table={table} />
      </div>

      <div className="px-2 pb-2">
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "add-extracted" })}>
          Add row
        </Button>
      </div>
    </div>
  );
}

/**
 * The signed-amount cell. A plain number input coerces every keystroke and drops
 * intermediate states like a lone `-` or a trailing `.`, so this keeps a local
 * string draft while focused (letting the user type `-42` or `3.` freely) and
 * commits the parsed number to the wizard whenever the draft parses. On blur the
 * draft is dropped and the field reflects the committed number.
 */
function AmountInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  /** True while the row is a **skipped row** — its fields are inert. */
  disabled: boolean;
  onChange: (amount: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const n = Number.parseFloat(next);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      className={`w-24 rounded-full border border-gousse-line bg-gousse-bg px-3 py-1 text-center text-gousse-ink tabular-nums ${
        disabled ? "line-through opacity-60" : ""
      }`}
    />
  );
}

/**
 * The soft reconciliation warning: shown only when the extracted rows don't sum
 * to the declared totals. It points at where to look (a probable dropped row or
 * a summary line read as an operation) but never blocks commit.
 *
 * A statement that declared no totals never gets here — `reconcile` answers
 * `null` and there is nothing to show (issue #196).
 */
function ReconciliationBanner({ recon }: { recon: Reconciliation }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-2xl border border-gousse-high bg-gousse-panel p-4 text-sm"
    >
      <p className="font-medium text-gousse-high">
        Reconciliation mismatch — the extracted rows don't match the statement's declared totals.
      </p>
      <p className="text-gousse-muted">
        A row may have been dropped, or a balance/summary line read as an operation. Review the rows
        against the PDF — you can still commit.
      </p>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 pt-1 text-gousse-ink">
        <dt className="text-gousse-muted" />
        <dt className="text-right text-gousse-muted">Extracted</dt>
        <dt className="text-right text-gousse-muted">Declared</dt>

        <dd className={recon.debitOk ? "" : "text-gousse-high"}>Debits</dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.extractedDebit, { signDisplay: false })}
        </dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.declaredDebit, { signDisplay: false })}
        </dd>

        <dd className={recon.creditOk ? "" : "text-gousse-high"}>Credits</dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.extractedCredit, { signDisplay: false })}
        </dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.declaredCredit, { signDisplay: false })}
        </dd>
      </dl>
    </div>
  );
}
