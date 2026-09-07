import type {
  AccountId,
  CsvStatementFormat,
  PdfStatementFormat,
  StatementFormat,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { statementFormatQueries } from "@/lib/sdk";
import { buildFormatLabel } from "./build-format-offer";
import { ExtractionProgress } from "./extraction-progress";
import { FileDropZone } from "./file-drop-zone";
import { InlineAccountSelect } from "./inline-account-select";
import { LoadedFilePanel } from "./loaded-file-panel";
import { PdfFormatAsk } from "./pdf-format-ask";
import { useFileIntake } from "./use-file-intake";
import { WizardPanel } from "./wizard-panel";
import {
  canAcceptFile,
  canPreview,
  type FormatSelection,
  type WizardAction,
  type WizardState,
} from "./wizard-reducer";

/**
 * Step 1 — the target account (with inline creation) **first**, then the file.
 *
 * The order is the point (issue #181): a **Statement Format** is account-scoped,
 * so until the account is settled there is nothing to read the file against, and
 * the PDF path cannot even build its extraction prompt. The drop zone stays on
 * screen so the user can see what is coming, but it is inert while
 * {@link canAcceptFile} is false.
 *
 * What this component is, is the *sequence of panels*: the account, the zone, and
 * then whichever of the states a file in hand can be in. What happens to a file
 * once it is taken — the CSV/PDF fork, the extraction, the discovery run, the
 * failures — is {@link useFileIntake}'s, so the step reads as the screens it shows
 * rather than as the network calls behind them.
 *
 * Three of those screens are about a PDF no stored format reads, and they differ
 * only in what led to them. On a **mismatched format verdict** (issue #188) the
 * statement did not carry the columns the chosen format declares, so its rows were
 * read against the wrong shape and are dropped rather than shown. Where the
 * account has **no PDF format at all** (issue #218) the drop is no longer refused:
 * the file waits in the same place, and what the step offers instead of a picker
 * is to build one from this statement. And where **several** are saved and none
 * chosen (issue #185) the question is which one reads it — with the same offer
 * beside it since issue #221, because one of the account's formats may still be
 * the answer and only the user knows.
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
  /** Whether the account is settled — the one thing the drop zone waits for. */
  const accepting = canAcceptFile(state);

  /**
   * The account's stored **Statement Formats**. Account-scoped by the query
   * itself, since that is the only scope at which "which columns does this bank's
   * statement carry" has an answer (PRD #180) — and not asked for at all until the
   * account is settled, which is what {@link canAcceptFile} guards.
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

  const intake = useFileIntake({ pdfFormats, dispatch });

  /**
   * The PDF in hand that still needs a **Statement Format** said for it — and
   * `null` whenever none is, which is every other state of this step.
   *
   * On a mismatch the file comes from `state.file` rather than `pendingPdf`:
   * `pendingPdf` means *nothing has been sent anywhere*, and something has.
   */
  const awaitingFormat = state.pendingPdf ?? (state.mismatch === null ? null : state.file);

  /**
   * Which of the two questions the waiting file is asking, since the account
   * having no PDF format at all now waits here too (issue #218).
   *
   * **Which of these reads it** — a list to pick from, and extraction on the
   * answer. **There is none, build one** — no list, and a **discovery
   * extraction** on the answer. They are named apart rather than spelled inline
   * because they are two screens' worth of copy and two different next actions,
   * and `awaitingFormat !== null` says nothing about which.
   */
  const askingWhichFormat = awaitingFormat !== null && pdfFormats.length > 0;
  const offeringFirstFormat = awaitingFormat !== null && pdfFormats.length === 0;

  /**
   * Which of the three dead ends the offer is being taken from (issue #221) — the
   * one thing that survives the run, since it is what the mapping step opens by
   * saying.
   *
   * The three are exhaustive and this is the only place they are told apart,
   * because this component is the one that renders all three. A **mismatch** is
   * asked first: it is a fact about the extraction that just ran, and the
   * account's format count says nothing about it — the format that failed is still
   * in the list. Otherwise an empty list is the **first import** and a populated
   * one is the **ambiguity** nobody has answered.
   */
  const buildFormatReason: FormatSelection =
    state.mismatch !== null ? "mismatch" : pdfFormats.length === 0 ? "no-formats" : "several";

  /** The offer itself, identical on both panels — only what leads up to it differs. */
  const buildFormatButton = (variant: "primary" | "secondary") => (
    <Button
      variant={variant}
      size="md"
      onClick={() => {
        if (awaitingFormat === null) return;
        intake.discover(awaitingFormat, buildFormatReason);
      }}
    >
      {buildFormatLabel("pdf")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <WizardPanel>
        <InlineAccountSelect
          value={state.accountId}
          onChange={(accountId: AccountId) => dispatch({ type: "select-account", accountId })}
        />
      </WizardPanel>

      <FileDropZone accepting={accepting} onFile={intake.takeFile} />

      {offeringFirstFormat ? (
        // The **first PDF import** (issue #218). No format exists to pick, so
        // there is nothing to ask — only something to offer, and taking it is
        // what spends the AI run.
        <WizardPanel>
          <p className="text-sm text-gousse-muted">
            <span className="font-medium text-gousse-ink">{state.fileName}</span> — this account has
            no PDF statement format yet. Build one from this statement and it will be saved with
            this import.
          </p>
          <div>{buildFormatButton("primary")}</div>
        </WizardPanel>
      ) : null}

      {askingWhichFormat ? (
        <PdfFormatAsk
          fileName={state.fileName}
          missingColumns={state.mismatch === null ? null : state.mismatch.missingColumns}
          formats={pdfFormats}
          chosen={intake.chosenPdfFormat}
          onChoose={intake.setChosenPdfFormat}
          onExtract={() => {
            // Both are non-null under the button's own guard, but they are read
            // together here so the pair that travels is the pair the user
            // answered about.
            if (awaitingFormat === null || intake.chosenPdfFormat === null) return;
            intake.extractWithFormat(awaitingFormat, intake.chosenPdfFormat);
          }}
          buildOffer={buildFormatButton("secondary")}
        />
      ) : null}

      {state.extracting ? (
        <ExtractionProgress
          fileName={state.fileName ?? "The statement"}
          label="extracting transactions from the PDF…"
        />
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-gousse-high">
          {state.error}
          {/* The one extraction failure the user fixes *elsewhere* — no
              credential stored for the provider the task runs on (issue #122).
              Telling someone where to go and taking them there are not the same
              thing, and this is the only failure where the drop zone in front of
              them is the wrong answer. */}
          {intake.notConfigured ? (
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
        <LoadedFilePanel formats={formats} state={state} dispatch={dispatch} />
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
