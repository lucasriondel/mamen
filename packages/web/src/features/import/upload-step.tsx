import { type AccountId, MAX_PDF_BYTES } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { importMutations } from "@/lib/sdk";
import { aiProviderNotConfigured, pdfExtractionErrorMessage } from "@/lib/sdk-error";
import { formatExtractionTime } from "./format-extraction-time";
import { FormatPicker } from "./format-picker";
import { InlineAccountSelect } from "./inline-account-select";
import { parseCsvFile } from "./parse-file";
import { detectFormat } from "./parsers/registry";
import { canAcceptFile, canPreview, type WizardAction, type WizardState } from "./wizard-reducer";

/** Whether a dropped file is a PDF (by MIME or extension) — the async fork. */
function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Step 1 — the target account (with inline creation) **first**, then the file.
 *
 * The order is the point (issue #181): a **Statement Format** is account-scoped,
 * so until the account is settled there is nothing to read the file against, and
 * the PDF path cannot even build its extraction prompt. The drop zone stays on
 * screen so the user can see what is coming, but it is inert — its input
 * disabled, its drop handler a no-op — while {@link canAcceptFile} is false.
 *
 * Once a file is taken, the fork on file shape is unchanged. A **CSV** parses
 * in-browser (papaparse), auto-detects its **Parser** by header fingerprint, and
 * continues synchronously. A **PDF** uploads to `/import/extract-pdf` and shows a
 * loading state while the async extraction runs; on success the wizard lands
 * straight on the **side-by-side validation** view, since the account it was
 * waiting for was settled before the drop.
 */
export function UploadStep({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  const [dragging, setDragging] = useState(false);

  /** Whether the account is settled — the one thing the drop zone waits for. */
  const accepting = canAcceptFile(state);

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
        detectedParserId: detectFormat(headers)?.id ?? null,
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
    // A drag can reach an inert zone — a disabled input rejects a click, not a
    // drop — so the gate is restated here rather than left to the input.
    if (!accepting) return;
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-4">
        <InlineAccountSelect
          value={state.accountId}
          onChange={(accountId: AccountId) => dispatch({ type: "select-account", accountId })}
        />
      </div>

      {/* oxlint-disable-next-line no-noninteractive-element-interactions -- the
          drop zone *is* the file input's label; drag events have no keyboard
          equivalent to mirror, and clicking or tabbing still reaches the input. */}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (accepting) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-disabled={!accepting}
        className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          accepting ? "cursor-pointer" : "cursor-not-allowed opacity-60"
        } ${dragging ? "border-gousse-accent bg-gousse-panel" : "border-gousse-line"}`}
      >
        {accepting ? (
          <>
            <span className="font-medium text-gousse-ink">Drop a CSV or PDF statement here</span>
            <span className="text-sm text-gousse-muted">or click to choose a file</span>
          </>
        ) : (
          <>
            <span className="font-medium text-gousse-ink">Pick an account first</span>
            <span className="text-sm text-gousse-muted">
              A statement is read against the account it belongs to.
            </span>
          </>
        )}
        <input
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf"
          className="sr-only"
          aria-label="CSV or PDF statement"
          disabled={!accepting}
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
