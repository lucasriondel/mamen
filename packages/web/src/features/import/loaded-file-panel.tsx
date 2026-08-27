import type { CsvStatementFormat } from "@mamen/shared/contract";
import { BuildFormatOffer } from "./build-format-offer";
import { formatExtractionTime } from "./format-extraction-time";
import { FormatPicker } from "./format-picker";
import { WizardPanel } from "./wizard-panel";
import type { WizardAction, WizardState } from "./wizard-reducer";

/**
 * What is loaded and what it will be read with — the panel under the drop zone
 * once a file is in hand.
 *
 * The count it prints is the extraction's own **snapshot** rather than the live
 * row array (issue #202): this line is seen on the way *back* from the validation
 * view, so by the time it is on screen the user may already have added the
 * operations the model missed, and a line claiming the extraction returned those
 * would be claiming something that never happened.
 *
 * A stored format to pick is a CSV-only question — the PDF path settles which
 * format reads a statement before it sends it anywhere, and a discovered one has
 * no stored format at all — while the offer to *build* one stands on both paths
 * since issue #218, where for a discovered PDF it is the way back to the form over
 * the table already in hand.
 */
export function LoadedFilePanel({
  formats,
  state,
  dispatch,
}: {
  /** The account's CSV formats — what the picker offers. */
  formats: readonly CsvStatementFormat[];
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  return (
    <WizardPanel>
      <p className="text-sm text-gousse-muted">
        <span className="font-medium text-gousse-ink">{state.fileName}</span> —{" "}
        {state.extracted !== null
          ? `${state.extraction?.rowCount ?? 0} transactions extracted`
          : `${state.rows.length} rows`}
        {state.extracted !== null && state.extraction !== null ? (
          <span className="text-gousse-muted"> in {formatExtractionTime(state.extraction.ms)}</span>
        ) : null}
      </p>

      {state.source === "csv" ? (
        <FormatPicker formats={formats} state={state} dispatch={dispatch} />
      ) : null}
      {state.rows.length > 0 ? <BuildFormatOffer state={state} dispatch={dispatch} /> : null}
    </WizardPanel>
  );
}
