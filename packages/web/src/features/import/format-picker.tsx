import type { CsvStatementFormat, StatementFormatId } from "@mamen/shared/contract";
import { Select } from "@/components/ui/select";
import type { WizardAction, WizardState } from "./wizard-reducer";

/**
 * The CSV **Statement Format** `<select>` shown on the upload step, with the
 * hint that says how the current choice was arrived at.
 *
 * On screen for **every** CSV import rather than only when detection failed
 * (issue #184): detection preselects, and a user who disagrees with it needs
 * somewhere to say so. The PDF path renders nothing here — a PDF format declares
 * the columns to ask a model for rather than a header fingerprint, so it is
 * chosen on the extraction path instead.
 *
 * `formats` is one account's CSV formats, already narrowed by the wizard. The
 * list is never filtered by what matched: the point of the control is that the
 * user may pick something detection did not.
 */
export function FormatPicker({
  formats,
  state,
  dispatch,
}: {
  formats: readonly CsvStatementFormat[];
  state: WizardState;
  dispatch: (action: WizardAction) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gousse-muted">
      Format
      <Select
        value={state.formatId === null ? "" : String(state.formatId)}
        onChange={(event) =>
          dispatch({
            type: "select-format",
            formatId: Number(event.target.value) as StatementFormatId,
          })
        }
        aria-label="Statement format"
      >
        <option value="" disabled>
          Pick the statement format…
        </option>
        {formats.map((format) => (
          <option key={format.id} value={format.id}>
            {format.name}
          </option>
        ))}
      </Select>
      <FormatHint state={state} />
    </label>
  );
}

/**
 * What detection concluded, in one line — and **nothing matched** and **several
 * matched** are two lines, not one.
 *
 * They were a single "Format not recognized" before, which made an ambiguity
 * read as the file being unreadable when in fact the app understood it twice
 * over. A manual pick silences the hint: the user has answered the question it
 * was asking.
 */
function FormatHint({ state }: { state: WizardState }) {
  switch (state.formatSelection) {
    case "detected":
      return <span className="text-xs text-gousse-low">Auto-detected.</span>;
    case "none":
      return (
        <span className="text-xs text-gousse-muted">
          No saved format recognizes this file — pick the one to read it with.
        </span>
      );
    case "several":
      return (
        <span className="text-xs text-gousse-muted">
          More than one saved format matches this file — pick the one to read it with.
        </span>
      );
    default:
      return null;
  }
}
