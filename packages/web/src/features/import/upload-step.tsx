import {
  type AccountId,
  type CsvStatementFormat,
  MAX_PDF_BYTES,
  type PdfStatementFormat,
  type StatementFormat,
  type StatementFormatId,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { importMutations, statementFormatQueries } from "@/lib/sdk";
import { aiProviderNotConfigured, pdfExtractionErrorMessage } from "@/lib/sdk-error";
import { formatExtractionTime } from "./format-extraction-time";
import { FormatPicker } from "./format-picker";
import { InlineAccountSelect } from "./inline-account-select";
import { parseCsvFile } from "./parse-file";
import { canAcceptFile, canPreview, type WizardAction, type WizardState } from "./wizard-reducer";

/**
 * What the user is told when the account they picked has no PDF **Statement
 * Format** at all. Extraction cannot run against no format — its whole job since
 * issue #185 is telling the model which columns the statement carries — and the
 * old behaviour, a prompt describing French statements in general, is exactly the
 * guessing this work removes. So the drop is refused rather than served by a
 * fallback that produces plausible-but-wrong rows.
 *
 * The mapping step (issue #186) does not rescue this path either: it builds a
 * format from a file's **real headers** and previews its **real rows**, and a
 * PDF has neither until an extraction has run — the very extraction there is no
 * format for. Authoring one for a PDF belongs to the mismatch flow (issue #188),
 * so this stays a refusal, and saying so plainly beats a spinner that resolves
 * into nonsense.
 */
const NO_PDF_FORMAT =
  "This account has no PDF statement format yet. Import a CSV export from your bank instead.";

/**
 * The way out of a CSV import no stored **Statement Format** applies to (issue
 * #186), and the state of the one being built.
 *
 * Offered rather than forced: all three routes here — nothing matched, several
 * matched, an account with no CSV format at all — leave the picker on screen, so
 * a user whose file *is* readable by something they already have can still say
 * so. The offer disappears the moment a format is chosen, which is why a routine
 * import never sees it (PRD #180: the feature costs nothing when it is not
 * needed).
 *
 * Once a draft exists it says so here, because the upload step is where the user
 * comes back to: the picker below shows nothing selected, and a wizard that let
 * them continue without explaining what it was about to import under would be
 * keeping the format it is going to save a secret.
 */
function BuildFormat({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  if (state.draftFormat !== null) {
    const named = state.draftFormat.name.trim();
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-gousse-muted">
        <span>A new format{named === "" ? "" : ` — ${named}`} will be saved with this import.</span>
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "build-format" })}>
          Edit this format
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "discard-format-draft" })}
        >
          Discard this format
        </Button>
      </div>
    );
  }

  if (state.formatId !== null) return null;

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "build-format" })}>
        Build a format from this file
      </Button>
    </div>
  );
}

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
 * in-browser (papaparse) and continues synchronously; which **Statement Format**
 * reads it is settled by the wizard, against the account's stored formats. A
 * **PDF** uploads to `/import/extract-pdf` and shows a loading state while the
 * async extraction runs; on success the wizard lands straight on the
 * **side-by-side validation** view, since the account it was waiting for was
 * settled before the drop.
 */
export function UploadStep({
  formats,
  state,
  dispatch,
}: {
  /** The account's CSV formats — what the picker offers. */
  formats: readonly CsvStatementFormat[];
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

  /**
   * The account's stored **Statement Formats**. Account-scoped by the query
   * itself, since that is the only scope at which "which columns does this
   * bank's statement carry" has an answer (PRD #180) — and not asked for at all
   * until the account is settled, which is what {@link canAcceptFile} guards.
   */
  const formatsQuery = useQuery({
    ...statementFormatQueries.list(state.accountId === null ? {} : { accountId: state.accountId }),
    enabled: state.accountId !== null,
  });

  // Only the PDF half. A CSV format's `headers` are a *fingerprint* — the columns
  // a file must carry to be recognised — which is a different thing from the
  // columns to ask a model for, so one is never a candidate here.
  const pdfFormats = ((formatsQuery.data?.items ?? []) as readonly StatementFormat[]).filter(
    (format): format is PdfStatementFormat => format.kind === "pdf",
  );

  /**
   * Which format the user picked for a PDF that is waiting on the question —
   * `null` until they answer. Local rather than in the reducer: the *file* being
   * held is a state of the import (`state.pendingPdf`) that the preview gate and
   * every clearing action have to agree about, while a half-answered question is
   * this control's own business and dies with it.
   */
  const [chosenPdfFormat, setChosenPdfFormat] = useState<StatementFormatId | null>(null);

  const handlePdf = async (file: File, formatId: StatementFormatId) => {
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
      const result = await importMutations.extractPdf(file, formatId);
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
      // Parsed, not yet decided: detection is the wizard's, over the account's
      // stored formats, and it runs the moment that list is in hand (issue #184).
      dispatch({ type: "file-parsed", fileName: file.name, headers, rows });
    } catch {
      dispatch({
        type: "file-error",
        message: "Couldn't read that file. Is it a valid CSV?",
      });
    }
  };

  /**
   * A dropped PDF, routed on how many formats could read it (issue #185).
   *
   * Exactly one is the common case and costs the user nothing: it is the only
   * answer there is, so it is used without an ask. Several is a real question,
   * and it is the *user's* — the model is never asked to pick the format as well
   * as apply it, since it cannot then cleanly report a mismatch against a choice
   * of its own (PRD #180). None is a refusal; see {@link NO_PDF_FORMAT}.
   */
  const takePdf = (file: File) => {
    const only = pdfFormats.length === 1 ? pdfFormats[0] : undefined;
    if (only) return handlePdf(file, only.id);
    if (pdfFormats.length === 0) {
      dispatch({ type: "file-error", message: NO_PDF_FORMAT });
      return;
    }
    setChosenPdfFormat(null);
    dispatch({ type: "pdf-awaits-format", file });
  };

  // Cleared here rather than per branch: every dropped file is a fresh attempt,
  // and a CSV that then fails to parse must not inherit the previous PDF's link
  // to Settings.
  const handleFile = (file: File) => {
    setNotConfigured(false);
    return isPdf(file) ? takePdf(file) : handleCsv(file);
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

      {state.pendingPdf !== null ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-4">
          <p className="text-sm text-gousse-muted">
            <span className="font-medium text-gousse-ink">{state.fileName}</span> — this account has
            several PDF statement formats. Which one reads this statement?
          </p>
          <label className="flex flex-col gap-1 text-sm text-gousse-muted">
            Format
            <Select
              value={chosenPdfFormat === null ? "" : String(chosenPdfFormat)}
              onChange={(event) =>
                setChosenPdfFormat(
                  event.target.value === ""
                    ? null
                    : (Number(event.target.value) as StatementFormatId),
                )
              }
              aria-label="PDF statement format"
            >
              <option value="" disabled>
                Pick the statement format…
              </option>
              {pdfFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name}
                </option>
              ))}
            </Select>
          </label>
          <div>
            <Button
              variant="primary"
              size="md"
              disabled={chosenPdfFormat === null}
              onClick={() => {
                // Both are non-null under the button's own guard, but they are
                // read together here so the pair that travels is the pair the
                // user answered about.
                const file = state.pendingPdf;
                if (file === null || chosenPdfFormat === null) return;
                void handlePdf(file, chosenPdfFormat);
              }}
            >
              Extract transactions
            </Button>
          </div>
        </div>
      ) : null}

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

          {state.source === "csv" ? (
            <>
              <FormatPicker formats={formats} state={state} dispatch={dispatch} />
              <BuildFormat state={state} dispatch={dispatch} />
            </>
          ) : null}
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
