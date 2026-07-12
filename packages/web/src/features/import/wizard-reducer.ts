import type { AccountId } from "@mamen/shared/contract";

/** The wizard's two interactive steps (commit is a transient action, not a step). */
export type WizardStep = "upload" | "preview";

/** Local state for the 3-step import wizard (no global store — PRD). */
export type WizardState = {
	step: WizardStep;
	fileName: string | null;
	headers: readonly string[];
	rows: ReadonlyArray<Record<string, string>>;
	/** The chosen parser id — auto-detected or manually picked; `null` until set. */
	parserId: string | null;
	/** Whether {@link parserId} came from auto-detection (vs a manual pick). */
	autoDetected: boolean;
	accountId: AccountId | null;
	/** Groups every row of this import together; regenerated per file. */
	importBatchId: string;
	/** A surfaced file-parse error (bad CSV), shown inline on the upload step. */
	error: string | null;
};

export type WizardAction =
	| {
			type: "file-parsed";
			fileName: string;
			headers: readonly string[];
			rows: ReadonlyArray<Record<string, string>>;
			detectedParserId: string | null;
	  }
	| { type: "file-error"; message: string }
	| { type: "select-parser"; parserId: string }
	| { type: "select-account"; accountId: AccountId }
	| { type: "go-to-preview" }
	| { type: "back-to-upload" };

export const initialWizardState: WizardState = {
	step: "upload",
	fileName: null,
	headers: [],
	rows: [],
	parserId: null,
	autoDetected: false,
	accountId: null,
	importBatchId: "",
	error: null,
};

/** Whether the upload step has everything it needs to move to the preview. */
export function canPreview(state: WizardState): boolean {
	return (
		state.rows.length > 0 && state.parserId !== null && state.accountId !== null
	);
}

/** Pure state machine for the import wizard. */
export function wizardReducer(
	state: WizardState,
	action: WizardAction,
): WizardState {
	switch (action.type) {
		case "file-parsed":
			return {
				...state,
				fileName: action.fileName,
				headers: action.headers,
				rows: action.rows,
				parserId: action.detectedParserId,
				autoDetected: action.detectedParserId !== null,
				importBatchId: crypto.randomUUID(),
				error: null,
			};
		case "file-error":
			return { ...state, error: action.message };
		case "select-parser":
			return { ...state, parserId: action.parserId };
		case "select-account":
			return { ...state, accountId: action.accountId };
		case "go-to-preview":
			return canPreview(state) ? { ...state, step: "preview" } : state;
		case "back-to-upload":
			return { ...state, step: "upload" };
		default:
			return state;
	}
}
