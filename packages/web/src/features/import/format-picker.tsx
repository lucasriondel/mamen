import { PARSERS } from "./parsers/registry";
import type { WizardAction, WizardState } from "./wizard-reducer";

const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent";

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
		<label className="flex flex-col gap-1 text-sm text-muted">
			Format
			<select
				className={INPUT_CLASS}
				value={state.parserId ?? ""}
				onChange={(event) =>
					dispatch({ type: "select-parser", parserId: event.target.value })
				}
				aria-label="Statement format"
			>
				<option value="" disabled>
					Pick the statement format…
				</option>
				{PARSERS.map((parser) => (
					<option key={parser.id} value={parser.id}>
						{parser.label}
					</option>
				))}
			</select>
			{state.parserId !== null && state.autoDetected ? (
				<span className="text-xs text-low">Auto-detected.</span>
			) : state.parserId === null ? (
				<span className="text-xs text-muted">
					Format not recognized — pick it manually.
				</span>
			) : null}
		</label>
	);
}
