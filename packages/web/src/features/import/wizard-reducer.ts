import type {
  AccountId,
  DeclaredTotals,
  ExtractedTransaction,
  StatementFormatId,
} from "@mamen/shared/contract";
import type { FormatDetection } from "./parsers/detect-format";

/** The wizard's two interactive steps (commit is a transient action, not a step). */
export type WizardStep = "upload" | "preview";

/**
 * Which file shape the dropped statement is. A **CSV** forks to the synchronous
 * papaparse + **Parser** path; a **PDF** forks to async **PDF extraction**. The
 * split is branched on this discriminant, not hidden behind a shared abstraction
 * (issue #45). `null` until a file is dropped.
 */
export type WizardSource = "csv" | "pdf";

/**
 * A **stable row id** — the identity of one candidate row, minted from the
 * wizard's monotonic counter when the row is parsed from a CSV, extracted from a
 * PDF, or added blank for an operation the extraction missed (issue #190).
 *
 * Branded, because an id and a row *index* are both numbers and the reducer
 * still takes an index for an in-place edit. Confusing the two is precisely how
 * the preview skips one row and silently drops another, so the compiler is asked
 * to keep them apart rather than a naming convention.
 */
export type RowId = number & { readonly __brand: "RowId" };

/**
 * Where the chosen **Statement Format** came from — and, when none was chosen,
 * why not. `null` until there is a CSV with a verdict on it.
 *
 * The last two arms are the reason this is not a boolean. **Nothing matched**
 * (the account has no format that fingerprints this file) and **several
 * matched** (more than one does, equally specifically) are different facts, and
 * one line covering both made an ambiguity read as the file being unrecognised
 * (PRD #180). `manual` silences both: the user has answered the question the
 * hint was asking.
 *
 * A format is set exactly under `detected` and `manual`; the other two leave it
 * `null`, which is what keeps the wizard off the preview until someone decides.
 */
export type FormatSelection = "detected" | "manual" | "none" | "several";

/** Local state for the 3-step import wizard (no global store — PRD). */
export type WizardState = {
  step: WizardStep;
  /** The dropped file's shape — which path (CSV parse vs PDF extraction) is live. */
  source: WizardSource | null;
  fileName: string | null;
  /**
   * The dropped **PDF** File, kept so the **side-by-side validation** view can
   * render it in a blob-URL iframe (`URL.createObjectURL`). `null` for a CSV (no
   * side-by-side) and until a PDF is dropped.
   */
  file: File | null;
  headers: readonly string[];
  rows: ReadonlyArray<Record<string, string>>;
  /**
   * The chosen **Statement Format** — a row of the account's formats table
   * (issue #184), auto-detected or manually picked; `null` until one is.
   *
   * Only the id: the record itself is the query's, and holding a copy here would
   * be a second answer to "which format is this import using" that a refetch
   * could contradict.
   */
  formatId: StatementFormatId | null;
  /** How {@link formatId} was arrived at, and the picker's hint. */
  formatSelection: FormatSelection | null;
  accountId: AccountId | null;
  /** Groups every row of this import together; regenerated per file. */
  importBatchId: string;
  /** A surfaced file error (bad CSV / failed extraction), shown on the upload step. */
  error: string | null;
  /** True while a PDF is uploading to `/import/extract-pdf` and awaiting a result. */
  extracting: boolean;
  /** The extracted candidate rows once a PDF extraction succeeds; `null` otherwise. */
  extracted: readonly ExtractedTransaction[] | null;
  /**
   * Which previewed rows the user held out of the commit, as a set of
   * {@link RowId} (epic #85). One set for both paths since issue #192: a skip
   * names a row rather than a position, so the CSV table and the PDF
   * side-by-side hold rows out the same way and the reducer carries one identity
   * model rather than two.
   *
   * A skip is reversible and the row stays on screen struck through with its
   * editable fields disabled. Nothing is ever removed from a preview: the point
   * of a preview is that every row the statement holds is accounted for on
   * screen, and a row that vanished could only come back by dropping the file
   * again.
   *
   * Held ascending, which is row order — ids come off a monotonic counter in the
   * order the rows do.
   *
   * The ids name rows of *this* file read by *this* **Parser**, so anything that
   * re-mints them clears the set with them.
   */
  skippedRows: readonly RowId[];
  /**
   * A **stable row id** per candidate row, positional with whichever array is
   * live: {@link WizardState.rows} on the CSV path, {@link WizardState.extracted}
   * on the PDF one. Minted alongside those rows and re-minted wherever
   * {@link WizardState.skippedRows} is cleared, so an id never outlives the row
   * it named.
   *
   * They name the rows *this state holds*, which on the CSV path is papaparse's
   * output — not the **Parser**'s records, which are a filtered subset of it (a
   * parser drops the rows it won't import, e.g. a non-`COMPLETE` `Statut`) and
   * are derived outside the reducer. The join is the parser's to report: `parse`
   * returns each record's `sourceIndex`, and the preview reads the id off that.
   */
  rowIds: readonly RowId[];
  /**
   * The next id the counter will hand out. Monotonic for the wizard's whole life
   * — never rewound by a clear — so an id from a discarded file can never match a
   * row of the next one.
   *
   * It lives in state rather than in a module-level counter so the reducer stays
   * pure: the same actions from the same state always mint the same ids, which is
   * what keeps the fixture-driven tests deterministic. A UUID or a content hash
   * would not do — the first is not deterministic, and the second collides on the
   * two identical rows a real statement is allowed to carry.
   */
  nextRowId: number;
  /** The statement's own declared totals, echoed by extraction (reconcile handle). */
  declaredTotals: DeclaredTotals | null;
  /**
   * Wall-clock time the PDF extraction took, in milliseconds — measured
   * client-side around the `/import/extract-pdf` round-trip. `null` for a CSV and
   * until a PDF extraction settles successfully.
   */
  extractionMs: number | null;
};

export type WizardAction =
  | {
      type: "file-parsed";
      fileName: string;
      headers: readonly string[];
      rows: ReadonlyArray<Record<string, string>>;
    }
  /**
   * What detection made of the loaded CSV, once the account's formats are in
   * hand. A second beat rather than part of `file-parsed`, because the formats
   * are fetched: the file can be sitting in the wizard — dropped, or handed off
   * by the accounts grid at mount — before the list that decides it arrives.
   */
  | { type: "detect-format"; detection: FormatDetection }
  | { type: "file-error"; message: string }
  | { type: "select-format"; formatId: StatementFormatId }
  | { type: "select-account"; accountId: AccountId }
  | { type: "go-to-preview" }
  | { type: "back-to-upload" }
  /** A PDF was dropped — extraction has started (spinner until it settles). */
  | { type: "extract-start"; file: File }
  /** Extraction succeeded — candidate rows (+ declared totals) are in hand. */
  | {
      type: "extract-success";
      transactions: readonly ExtractedTransaction[];
      declaredTotals: DeclaredTotals;
      /** Wall-clock extraction time in ms, measured around the round-trip. */
      extractionMs: number;
    }
  /** Extraction failed — surface the error and stay on the upload step. */
  | { type: "extract-error"; message: string }
  /**
   * Edit one **extracted transaction** in place (side-by-side validation): patch
   * any of its date / amount / raw issuer. Whatever the table holds at commit is
   * what commits.
   */
  | {
      type: "edit-extracted";
      index: number;
      patch: Partial<ExtractedTransaction>;
    }
  /** Append a blank extracted row (a missed operation the model didn't read). */
  | { type: "add-extracted" }
  /**
   * Hold one previewed row out of the commit — the recourse for a row marked
   * **already imported** (epic #85), and for the phantom row an extraction read
   * off a summary line. The row is not dropped from the preview, only from what
   * commits.
   */
  | { type: "skip-row"; rowId: RowId }
  /** Put a skipped row back into the commit. */
  | { type: "restore-row"; rowId: RowId };

export const initialWizardState: WizardState = {
  step: "upload",
  source: null,
  fileName: null,
  file: null,
  headers: [],
  rows: [],
  formatId: null,
  formatSelection: null,
  accountId: null,
  importBatchId: "",
  error: null,
  extracting: false,
  extracted: null,
  declaredTotals: null,
  extractionMs: null,
  skippedRows: [],
  rowIds: [],
  nextRowId: 1,
};

/**
 * Take `count` ids off the counter. Returns the minted ids and the counter
 * advanced past them — the caller spreads both into the next state, so the
 * counter only ever moves forward.
 */
function mintRowIds(from: number, count: number): { rowIds: readonly RowId[]; nextRowId: number } {
  const rowIds = Array.from({ length: count }, (_, offset) => (from + offset) as RowId);
  return { rowIds, nextRowId: from + count };
}

/**
 * Seed values for a wizard opened from the accounts import grid (issue #36): the
 * target account is pre-picked from the dropped-on cell, and an already-parsed
 * statement (handed off via {@link module:import-handoff}) drops the user
 * straight onto the format/preview path instead of the empty dropzone.
 *
 * The cell is the account, so the grid always sends both — and the file is kept
 * only when it does, which is the same door {@link canAcceptFile} holds.
 */
export type WizardPrefill = {
  accountId?: AccountId | null;
  file?: {
    fileName: string;
    headers: readonly string[];
    rows: ReadonlyArray<Record<string, string>>;
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
    // Same door as {@link canAcceptFile}: a statement handed off without an
    // account is one the wizard cannot read, so it is dropped rather than seated
    // in front of a user who still owes the account it belongs to.
    ...(file && accountId != null
      ? {
          // The handoff's rows are already parsed, so they never see
          // `file-parsed` — this is their one chance to be given an identity.
          ...mintRowIds(initialWizardState.nextRowId, file.rows.length),
          source: "csv" as const,
          fileName: file.fileName,
          headers: file.headers,
          rows: file.rows,
          // No format: the account's formats have not been fetched at mount, so
          // a handed-off statement lands undecided and `detect-format` settles
          // it when the list arrives — the same beat a dropped file waits for.
          importBatchId: crypto.randomUUID(),
        }
      : {}),
  };
}

/**
 * Whether the wizard may take a statement yet — i.e. whether the account it
 * belongs to is settled (issue #181).
 *
 * The account comes **first**, before the file: a **Statement Format** is
 * account-scoped, so neither path can choose one until the account is known, and
 * the PDF path in particular cannot build its extraction prompt without it. So
 * this gates the drop zone, and the reducer ignores `file-parsed` /
 * `extract-start` while it is false — the ordering is a property of the state
 * machine rather than of one component's disabled attribute, which is what keeps
 * a PDF from being sent anywhere before there is an account to read it against.
 */
export function canAcceptFile(state: WizardState): boolean {
  return state.accountId !== null;
}

/**
 * Whether the upload step has everything it needs to move to the preview. The
 * account is required either way; a CSV also needs parsed rows + a chosen
 * **Statement Format**, while a PDF needs a settled extraction (rows in hand,
 * not still extracting).
 */
export function canPreview(state: WizardState): boolean {
  if (state.accountId === null) return false;
  if (state.source === "pdf") {
    return state.extracted !== null && !state.extracting;
  }
  return state.rows.length > 0 && state.formatId !== null;
}

/** Pure state machine for the import wizard. */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "file-parsed":
      if (!canAcceptFile(state)) return state;
      return {
        ...state,
        // A fresh id per row of the new file; the old file's are gone with it.
        ...mintRowIds(state.nextRowId, action.rows.length),
        source: "csv",
        fileName: action.fileName,
        file: null,
        headers: action.headers,
        rows: action.rows,
        // Undecided until `detect-format` lands: the account's formats are a
        // query, and this file may have arrived before its result did.
        formatId: null,
        formatSelection: null,
        importBatchId: crypto.randomUUID(),
        error: null,
        // A CSV replacing a prior PDF drop clears the extraction state.
        extracting: false,
        extracted: null,
        declaredTotals: null,
        extractionMs: null,
        // The indices named the previous file's records.
        skippedRows: [],
      };
    case "detect-format":
      // A detection result names *this* CSV's headers. It is dispatched from an
      // effect, so a file replaced in the meantime — by a PDF, or by a drop that
      // failed — has already taken its verdict's subject with it.
      if (state.source !== "csv") return state;
      return action.detection.outcome === "detected"
        ? { ...state, formatId: action.detection.format.id, formatSelection: "detected" }
        : { ...state, formatId: null, formatSelection: action.detection.outcome };
    case "file-error":
      // A failed drop must not leave a prior file previewable behind the error.
      // Clear both paths' loaded state so the wizard shows only the error and
      // `canPreview` is false (mirrors the extract-* / file-parsed resets).
      return {
        ...state,
        error: action.message,
        source: null,
        file: null,
        headers: [],
        rows: [],
        formatId: null,
        formatSelection: null,
        extracting: false,
        extracted: null,
        declaredTotals: null,
        extractionMs: null,
        skippedRows: [],
        // Nothing is previewable behind the error, so there is no row to name.
        rowIds: [],
      };
    case "select-format":
      // Another format reads the same file into different records, so an index
      // kept here would hold out whichever row landed at that position.
      return {
        ...state,
        // Re-minted, not emptied: the rows stay on screen and every one of them
        // still needs an id — just not one a skip made under the old format could
        // still name. The counter never rewinds, so the new ids can't collide.
        ...mintRowIds(state.nextRowId, state.rows.length),
        formatId: action.formatId,
        // The user has answered; whatever detection had to say about this file
        // is no longer the thing to tell them.
        formatSelection: "manual",
        skippedRows: [],
      };
    case "select-account":
      if (action.accountId === state.accountId) return state;
      // Formats belong to an account, so another account is another set of them
      // — and a format the new account does not have is not a format this import
      // may use. Cleared rather than re-checked, which puts the file back where
      // a freshly parsed one is and lets `detect-format` answer again over the
      // list that is now the right one.
      return {
        ...state,
        accountId: action.accountId,
        formatId: null,
        formatSelection: null,
      };
    case "go-to-preview":
      return canPreview(state) ? { ...state, step: "preview" } : state;
    case "back-to-upload":
      return { ...state, step: "upload" };
    case "extract-start":
      if (!canAcceptFile(state)) return state;
      return {
        ...state,
        source: "pdf",
        fileName: action.file.name,
        file: action.file,
        extracting: true,
        extracted: null,
        declaredTotals: null,
        extractionMs: null,
        importBatchId: crypto.randomUUID(),
        error: null,
        // A PDF replacing a prior CSV drop clears the format state.
        headers: [],
        rows: [],
        formatId: null,
        formatSelection: null,
        skippedRows: [],
        // No candidate rows until the extraction settles.
        rowIds: [],
      };
    case "extract-success":
      return {
        ...state,
        ...mintRowIds(state.nextRowId, action.transactions.length),
        extracting: false,
        extracted: action.transactions,
        declaredTotals: action.declaredTotals,
        extractionMs: action.extractionMs,
        error: null,
        // Extraction could only have started with an account in hand, so a
        // success has nothing left to wait for: it lands on the validation view
        // rather than parking the user on the upload step to pick one.
        step: "preview",
      };
    case "extract-error":
      return {
        ...state,
        extracting: false,
        extracted: null,
        declaredTotals: null,
        extractionMs: null,
        error: action.message,
        rowIds: [],
        // Nothing previewable is left behind the error, so there is no row a skip
        // could still name — and since #192 a PDF's rows can carry skips too.
        skippedRows: [],
      };
    case "edit-extracted": {
      if (state.extracted === null) return state;
      return {
        ...state,
        extracted: state.extracted.map((tx, index) =>
          index === action.index ? { ...tx, ...action.patch } : tx,
        ),
      };
    }
    case "add-extracted": {
      const blank: ExtractedTransaction = {
        date: new Date(),
        amount: 0,
        rawIssuerString: "",
      };
      // The one place ids are appended rather than replaced. Off the same
      // counter, so the blank row can never land on the id of a row this wizard
      // has already shown — including one a skip is currently holding out.
      const minted = mintRowIds(state.nextRowId, 1);
      return {
        ...state,
        extracted: [...(state.extracted ?? []), blank],
        rowIds: [...state.rowIds, ...minted.rowIds],
        nextRowId: minted.nextRowId,
      };
    }
    case "skip-row": {
      if (state.skippedRows.includes(action.rowId)) return state;
      return {
        ...state,
        // Kept ascending — the preview reads them as a set, so the order is for
        // whoever reads the state, and ascending ids are the rows in file order.
        skippedRows: [...state.skippedRows, action.rowId].sort((a, b) => a - b),
      };
    }
    case "restore-row":
      return {
        ...state,
        skippedRows: state.skippedRows.filter((rowId) => rowId !== action.rowId),
      };
    default:
      return state;
  }
}
