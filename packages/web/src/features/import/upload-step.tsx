import { type AccountId, MAX_PDF_BYTES } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { importMutations } from "@/lib/sdk";
import { aiProviderNotConfigured, pdfExtractionErrorMessage } from "@/lib/sdk-error";
import { FormatPicker } from "./format-picker";
import { InlineAccountSelect } from "./inline-account-select";
import { parseCsvFile } from "./parse-file";
import { detectParser } from "./parsers/registry";
import { canPreview, type WizardAction, type WizardState } from "./wizard-reducer";

/** Whether a dropped file is a PDF (by MIME or extension) — the async fork. */
function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Human-readable extraction duration — sub-second in `ms`, otherwise `s`. */
function formatExtractionTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Step 1 — file drop, then a fork on file shape. A **CSV** parses in-browser
 * (papaparse), auto-detects its **Parser** by header fingerprint, and continues
 * synchronously. A **PDF** uploads to `/import/extract-pdf` and shows a loading
 * state while the async extraction runs; on success it holds the extracted rows.
 * Either way the user picks a target account (with inline creation) and continues
 * to the mandatory preview once the path is complete.
 */
export function UploadStep({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  const [dragging, setDragging] = useState(false);

  /**
   * Whether the last extraction failed for the one reason the user fixes
   * *elsewhere* — no credential stored for the provider the task runs on (issue
   * #122). The alert then carries a link to the AI settings page, because
   * telling someone where to go and taking them there are not the same thing,
   * and this is the only extraction failure where the drop zone in front of them
   * is the wrong answer.
   *
   * Local rather than in the reducer: the reducer's `error` is the sentence, and
   * this is a fact about the *last* failure that nothing else in the wizard —
   * preview, commit, hand-off — has any use for. Cleared for every dropped file,
   * so it can only ever describe the attempt whose alert is on screen.
   */
  const [notConfigured, setNotConfigured] = useState(false);

  const handlePdf = async (file: File) => {
    // Oversize is rejected upstream by the multipart parser as a framework
    // error, not `InvalidFileType`, so it would otherwise fall through to the
    // generic retry copy. Pre-check the cap client-side — as the issuer image
    // upload does — so the user gets the distinct, actionable message and we
    // skip a doomed upload. This runs *before* `extract-start`, so it must use
    // `file-error` (which clears any prior CSV/PDF loaded state); `extract-error`
    // relies on `extract-start` having reset that first, and would otherwise
    // leave a stale, still-previewable file behind the rejection alert.
    if (file.size > MAX_PDF_BYTES) {
      dispatch({
        type: "file-error",
        message: pdfExtractionErrorMessage({ _tag: "InvalidFileType" }),
      });
      return;
    }
    dispatch({ type: "extract-start", file });
    const startedAt = performance.now();
    try {
      const result = await importMutations.extractPdf(file);
      dispatch({
        type: "extract-success",
        transactions: result.transactions,
        declaredTotals: result.declaredTotals,
        extractionMs: performance.now() - startedAt,
      });
    } catch (error) {
      setNotConfigured(aiProviderNotConfigured(error) !== null);
      dispatch({
        type: "extract-error",
        message: pdfExtractionErrorMessage(error),
      });
    }
  };

  const handleCsv = async (file: File) => {
    try {
      const { headers, rows } = await parseCsvFile(file);
      dispatch({
        type: "file-parsed",
        fileName: file.name,
        headers,
        rows,
        detectedParserId: detectParser(headers)?.id ?? null,
      });
    } catch {
      dispatch({
        type: "file-error",
        message: "Couldn't read that file. Is it a valid CSV?",
      });
    }
  };

  // Cleared here rather than per branch: every dropped file is a fresh attempt,
  // and a CSV that then fails to parse must not inherit the previous PDF's link
  // to Settings.
  const handleFile = (file: File) => {
    setNotConfigured(false);
    return isPdf(file) ? handlePdf(file) : handleCsv(file);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* oxlint-disable-next-line no-noninteractive-element-interactions -- the
          drop zone *is* the file input's label; drag events have no keyboard
          equivalent to mirror, and clicking or tabbing still reaches the input. */}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-gousse-accent bg-gousse-panel" : "border-gousse-line"
        }`}
      >
        <span className="font-medium text-gousse-ink">Drop a CSV or PDF statement here</span>
        <span className="text-sm text-gousse-muted">or click to choose a file</span>
        <input
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf"
          className="sr-only"
          aria-label="CSV or PDF statement"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      {state.extracting ? (
        <output className="flex items-center gap-2 rounded-2xl border border-gousse-line bg-gousse-panel p-4 text-sm text-gousse-muted">
          <span className="font-medium text-gousse-ink">{state.fileName}</span> — extracting
          transactions from the PDF…
        </output>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-gousse-high">
          {state.error}
          {notConfigured ? (
            <>
              {" "}
              <Link to="/settings" className="underline">
                Open AI settings
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {!state.extracting && (state.rows.length > 0 || state.extracted) ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-4">
          <p className="text-sm text-gousse-muted">
            <span className="font-medium text-gousse-ink">{state.fileName}</span> —{" "}
            {state.source === "pdf"
              ? `${state.extracted?.length ?? 0} transactions extracted`
              : `${state.rows.length} rows`}
            {state.source === "pdf" && state.extractionMs !== null ? (
              <span className="text-gousse-muted">
                {" "}
                in {formatExtractionTime(state.extractionMs)}
              </span>
            ) : null}
          </p>

          {state.source === "csv" ? <FormatPicker state={state} dispatch={dispatch} /> : null}

          <InlineAccountSelect
            value={state.accountId}
            onChange={(accountId: AccountId) => dispatch({ type: "select-account", accountId })}
          />
        </div>
      ) : null}

      <div>
        <Button
          variant="primary"
          size="md"
          disabled={!canPreview(state)}
          onClick={() => dispatch({ type: "go-to-preview" })}
        >
          Continue to preview
        </Button>
      </div>
    </div>
  );
}
