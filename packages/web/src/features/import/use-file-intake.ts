import {
  MAX_PDF_BYTES,
  type PdfStatementFormat,
  type StatementFormatId,
} from "@mamen/shared/contract";
import { useState } from "react";
import { importMutations } from "@/lib/sdk";
import { aiProviderNotConfigured, pdfExtractionErrorMessage } from "@/lib/sdk-error";
import { parseCsvFile } from "./parse-file";
import type { FormatSelection, WizardAction } from "./wizard-reducer";

/** Whether a dropped file is a PDF (by MIME or extension) — the async fork. */
function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * What happens to a file once it is taken — the whole of the upload step's
 * asynchronous half, kept apart from the panels that show its results.
 *
 * The fork on file shape is the point. A **CSV** parses in-browser (papaparse) and
 * continues synchronously; which **Statement Format** reads it is settled by the
 * wizard, against the account's stored formats. A **PDF** either goes to
 * `/import/extract-pdf` under a format the user has settled, or — where no stored
 * format reads it — to `discoverPdf`, which transcribes its table as printed and
 * hands the user the mapping step over it (issue #218).
 *
 * A dropped PDF is routed on how many formats could read it (issue #185). Exactly
 * one is the common case and costs the user nothing: it is the only answer there
 * is, so it is used without an ask. Several is a real question, and it is the
 * *user's* — the model is never asked to pick the format as well as apply it,
 * since it cannot then cleanly report a mismatch against a choice of its own (PRD
 * #180). **None used to be a refusal** and since issue #218 is not: the file is
 * held exactly as an ambiguity is.
 *
 * `notConfigured` is local to this hook rather than in the reducer for the same
 * reason it was local to the step: the reducer's `error` is the sentence, and this
 * is a fact about the *last* failure that nothing else in the wizard — preview,
 * commit, hand-off — has any use for. Cleared for every dropped file, so it can
 * only ever describe the attempt whose alert is on screen.
 */
export function useFileIntake({
  pdfFormats,
  dispatch,
}: {
  /** The account's PDF formats — how many there are is what routes a drop. */
  pdfFormats: readonly PdfStatementFormat[];
  dispatch: (action: WizardAction) => void;
}): {
  /** Take a dropped or chosen file, whatever kind it is. */
  takeFile: (file: File) => void;
  /** Extract under a format the user has settled. */
  extractWithFormat: (file: File, formatId: StatementFormatId) => void;
  /** Transcribe the statement's table and go to the mapping step. */
  discover: (file: File, reason: FormatSelection) => void;
  /** Whether the last failure was "no credential for this provider" (issue #122). */
  notConfigured: boolean;
  /** Which PDF format the user picked for a waiting file; `null` until they answer. */
  chosenPdfFormat: StatementFormatId | null;
  setChosenPdfFormat: (formatId: StatementFormatId | null) => void;
} {
  const [notConfigured, setNotConfigured] = useState(false);
  const [chosenPdfFormat, setChosenPdfFormat] = useState<StatementFormatId | null>(null);

  /**
   * Oversize is rejected upstream by the multipart parser as a framework error,
   * not `InvalidFileType`, so it would otherwise fall through to the generic retry
   * copy. Pre-checking the cap client-side — as the issuer image upload does —
   * gets the user the distinct, actionable message and skips a doomed upload.
   *
   * This runs *before* `extract-start`, so it must use `file-error` (which clears
   * any prior CSV/PDF loaded state); `extract-error` relies on `extract-start`
   * having reset that first, and would otherwise leave a stale, still-previewable
   * file behind the rejection alert.
   */
  const rejectOversize = (file: File): boolean => {
    if (file.size <= MAX_PDF_BYTES) return false;
    dispatch({
      type: "file-error",
      message: pdfExtractionErrorMessage({ _tag: "InvalidFileType" }),
    });
    return true;
  };

  const extractWithFormat = async (file: File, formatId: StatementFormatId) => {
    if (rejectOversize(file)) return;
    dispatch({ type: "extract-start", file });
    const startedAt = performance.now();
    try {
      const result = await importMutations.extractPdf(file, formatId);
      // The **format verdict** (issue #188). A statement that did not carry the
      // columns its format declares produced rows read against the wrong shape,
      // so they are not seated: the question goes back to the user while the
      // upload is still in hand. The answer they gave is dropped with it — the
      // control starts empty, since re-sending the format that just failed is the
      // one choice that cannot help.
      if (!result.verdict.matched) {
        setChosenPdfFormat(null);
        dispatch({ type: "extract-mismatch", missingColumns: result.verdict.missingColumns });
        return;
      }
      dispatch({
        type: "extract-success",
        transactions: result.transactions,
        // Absent whenever the statement printed no totals line (issue #196);
        // `null` is how the wizard spells "nothing to reconcile against".
        declaredTotals: result.declaredTotals ?? null,
        extractionMs: performance.now() - startedAt,
      });
    } catch (error) {
      setNotConfigured(aiProviderNotConfigured(error) !== null);
      dispatch({ type: "extract-error", message: pdfExtractionErrorMessage(error) });
    }
  };

  /**
   * The **first PDF import** (issue #218, PRD #216): transcribe the statement's
   * table as printed, then hand the user the mapping step over it.
   *
   * Run from an offer's button and from nowhere else, which is what makes the AI
   * call the user's decision — a mistaken drop costs nothing, because the drop
   * itself sends nothing. It takes the file and no format, that absence being the
   * whole of what tells it apart from {@link extractWithFormat}.
   *
   * Three screens offer it (issue #221) and each says why the user is on it, so
   * the reason travels with the run. Everything downstream of the click is
   * identical on all three.
   */
  const discover = async (file: File, reason: FormatSelection) => {
    if (rejectOversize(file)) return;
    dispatch({ type: "discover-start", file, reason });
    try {
      const result = await importMutations.discoverPdf(file);
      dispatch({
        type: "discover-success",
        columns: result.columns,
        // Every cell a string as printed: the date order, the decimal separator
        // and the sign rule are the *user's* answers, given in the mapping step
        // and applied by the same pipeline a CSV runs.
        rows: result.rows,
        declaredTotals: result.declaredTotals ?? null,
      });
    } catch (error) {
      setNotConfigured(aiProviderNotConfigured(error) !== null);
      dispatch({ type: "extract-error", message: pdfExtractionErrorMessage(error) });
    }
  };

  const takeCsv = async (file: File) => {
    try {
      const { headers, rows } = await parseCsvFile(file);
      // Parsed, not yet decided: detection is the wizard's, over the account's
      // stored formats, and it runs the moment that list is in hand (issue #184).
      dispatch({ type: "file-parsed", fileName: file.name, headers, rows });
    } catch {
      dispatch({ type: "file-error", message: "Couldn't read that file. Is it a valid CSV?" });
    }
  };

  const takePdf = (file: File) => {
    const only = pdfFormats.length === 1 ? pdfFormats[0] : undefined;
    if (only) {
      void extractWithFormat(file, only.id);
      return;
    }
    setChosenPdfFormat(null);
    dispatch({ type: "pdf-awaits-format", file });
  };

  return {
    // Cleared here rather than per branch: every dropped file is a fresh attempt,
    // and a CSV that then fails to parse must not inherit the previous PDF's link
    // to Settings.
    takeFile: (file) => {
      setNotConfigured(false);
      if (isPdf(file)) takePdf(file);
      else void takeCsv(file);
    },
    extractWithFormat: (file, formatId) => void extractWithFormat(file, formatId),
    discover: (file, reason) => void discover(file, reason),
    notConfigured,
    chosenPdfFormat,
    setChosenPdfFormat,
  };
}
