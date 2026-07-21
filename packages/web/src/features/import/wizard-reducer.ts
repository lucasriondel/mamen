import type {
	AccountId,
	DeclaredTotals,
	ExtractedTransaction,
} from "@mamen/shared/contract";

/** The wizard's two interactive steps (commit is a transient action, not a step). */
export type WizardStep = "upload" | "preview";

/**
 * Which file shape the dropped statement is. A **CSV** forks to the synchronous
 * papaparse + **Parser** path; a **PDF** forks to async **PDF extraction**. The
 * split is branched on this discriminant, not hidden behind a shared abstraction
 * (issue #45). `null` until a file is dropped.
 */
export type WizardSource = "csv" | "pdf";

/** Local state for the 3-step import wizard (no global store — PRD). */
export type WizardState = {
	step: WizardStep;
	/** The dropped file's shape — which path (CSV parse vs PDF extraction) is live. */
	source: WizardSource | null;
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
	/** A surfaced file error (bad CSV / failed extraction), shown on the upload step. */
	error: string | null;
	/** True while a PDF is uploading to `/import/extract-pdf` and awaiting a result. */
	extracting: boolean;
	/** The extracted candidate rows once a PDF extraction succeeds; `null` otherwise. */
	extracted: readonly ExtractedTransaction[] | null;
	/** The statement's own declared totals, echoed by extraction (reconcile handle). */
	declaredTotals: DeclaredTotals | null;
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
	| { type: "back-to-upload" }
	/** A PDF was dropped — extraction has started (spinner until it settles). */
	| { type: "extract-start"; fileName: string }
	/** Extraction succeeded — candidate rows (+ declared totals) are in hand. */
	| {
			type: "extract-success";
			transactions: readonly ExtractedTransaction[];
			declaredTotals: DeclaredTotals;
	  }
	/** Extraction failed — surface the error and stay on the upload step. */
	| { type: "extract-error"; message: string };

export const initialWizardState: WizardState = {
	step: "upload",
	source: null,
	fileName: null,
	headers: [],
	rows: [],
	parserId: null,
	autoDetected: false,
	accountId: null,
	importBatchId: "",
	error: null,
	extracting: false,
	extracted: null,
	declaredTotals: null,
};

/**
 * Seed values for a wizard opened from the accounts import grid (issue #36): the
 * target account is pre-picked from the dropped-on cell, and an already-parsed
 * statement (handed off via {@link module:import-handoff}) drops the user
 * straight onto the format/preview path instead of the empty dropzone.
 */
export type WizardPrefill = {
	accountId?: AccountId | null;
	file?: {
		fileName: string;
		headers: readonly string[];
		rows: ReadonlyArray<Record<string, string>>;
		detectedParserId: string | null;
	};
};

/**
 * Build the wizard's starting state, optionally pre-filling the account and an
 * already-parsed file. Used as `useReducer`'s lazy initializer so a grid-driven
 * open lands ready, while a plain `/import` visit starts empty.
 */
export function makeInitialWizardState(prefill?: WizardPrefill): WizardState {
	if (!prefill) return initialWizardState;
	const { accountId, file } = prefill;
	return {
		...initialWizardState,
		accountId: accountId ?? null,
		...(file
			? {
					source: "csv" as const,
					fileName: file.fileName,
					headers: file.headers,
					rows: file.rows,
					parserId: file.detectedParserId,
					autoDetected: file.detectedParserId !== null,
					importBatchId: crypto.randomUUID(),
				}
			: {}),
	};
}

/**
 * Whether the upload step has everything it needs to move to the preview. The
 * account is required either way; a CSV also needs parsed rows + a picked parser,
 * while a PDF needs a settled extraction (rows in hand, not still extracting).
 */
export function canPreview(state: WizardState): boolean {
	if (state.accountId === null) return false;
	if (state.source === "pdf") {
		return state.extracted !== null && !state.extracting;
	}
	return state.rows.length > 0 && state.parserId !== null;
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
				source: "csv",
				fileName: action.fileName,
				headers: action.headers,
				rows: action.rows,
				parserId: action.detectedParserId,
				autoDetected: action.detectedParserId !== null,
				importBatchId: crypto.randomUUID(),
				error: null,
				// A CSV replacing a prior PDF drop clears the extraction state.
				extracting: false,
				extracted: null,
				declaredTotals: null,
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
		case "extract-start":
			return {
				...state,
				source: "pdf",
				fileName: action.fileName,
				extracting: true,
				extracted: null,
				declaredTotals: null,
				importBatchId: crypto.randomUUID(),
				error: null,
				// A PDF replacing a prior CSV drop clears the parser state.
				headers: [],
				rows: [],
				parserId: null,
				autoDetected: false,
			};
		case "extract-success": {
			const next: WizardState = {
				...state,
				extracting: false,
				extracted: action.transactions,
				declaredTotals: action.declaredTotals,
				error: null,
			};
			// Auto-land on the preview when the account was already chosen; otherwise
			// hold on upload so the user can pick one, then continue.
			return canPreview(next) ? { ...next, step: "preview" } : next;
		}
		case "extract-error":
			return {
				...state,
				extracting: false,
				extracted: null,
				declaredTotals: null,
				error: action.message,
			};
		default:
			return state;
	}
}
