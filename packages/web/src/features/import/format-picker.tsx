import { Select } from "@/components/ui/select";
import { FORMATS } from "./parsers/registry";
import type { WizardAction, WizardState } from "./wizard-reducer";

/**
 * The CSV-only statement-format `<select>` (with the auto-detect / manual-pick
 * hint) shown on the upload step. Extracted from {@link UploadStep} so that
 * step's `return` stays small; the PDF path renders nothing here.
 */
export function FormatPicker({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gousse-muted">
      Format
      <Select
        value={state.parserId ?? ""}
        onChange={(event) => dispatch({ type: "select-parser", parserId: event.target.value })}
        aria-label="Statement format"
      >
        <option value="" disabled>
          Pick the statement format…
        </option>
        {FORMATS.map((format) => (
          <option key={format.id} value={format.id}>
            {format.name}
          </option>
        ))}
      </Select>
      {state.parserId !== null && state.autoDetected ? (
        <span className="text-xs text-gousse-low">Auto-detected.</span>
      ) : state.parserId === null ? (
        <span className="text-xs text-gousse-muted">Format not recognized — pick it manually.</span>
      ) : null}
    </label>
  );
}
