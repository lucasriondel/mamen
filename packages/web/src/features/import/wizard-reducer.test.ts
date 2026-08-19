import type { AccountId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
  canAcceptFile,
  canPreview,
  initialWizardState,
  makeInitialWizardState,
  wizardReducer,
} from "./wizard-reducer";

const HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"];
const ROWS = [{ Statut: "COMPLETE", Date: "2026-01-01T00:00:00Z" }];

/** The account is picked first now (issue #181) — every file case starts here. */
const withAccount = wizardReducer(initialWizardState, {
  type: "select-account",
  accountId: 5 as AccountId,
});

describe("wizardReducer", () => {
  it("starts on the upload step with nothing configured", () => {
    expect(initialWizardState.step).toBe("upload");
    expect(initialWizardState.parserId).toBeNull();
    expect(initialWizardState.accountId).toBeNull();
  });

  it("takes no file until the account is chosen", () => {
    expect(canAcceptFile(initialWizardState)).toBe(false);
    expect(canAcceptFile(withAccount)).toBe(true);
  });

  it("auto-selects the parser when the file is recognized", () => {
    const state = wizardReducer(withAccount, {
      type: "file-parsed",
      fileName: "statement.csv",
      headers: HEADERS,
      rows: ROWS,
      detectedParserId: "green-got",
    });

    expect(state.fileName).toBe("statement.csv");
    expect(state.rows).toBe(ROWS);
    expect(state.parserId).toBe("green-got");
    expect(state.autoDetected).toBe(true);
    expect(state.importBatchId).toMatch(/.+/);
  });

  it("leaves the parser unset for a manual pick when unrecognized", () => {
    const state = wizardReducer(withAccount, {
      type: "file-parsed",
      fileName: "unknown.csv",
      headers: ["a", "b"],
      rows: ROWS,
      detectedParserId: null,
    });

    expect(state.parserId).toBeNull();
    expect(state.autoDetected).toBe(false);
  });

  // The ordering is the state machine's, not only the drop zone's: a **Statement
  // Format** is account-scoped, so nothing may be read into the wizard — and on
  // the PDF path nothing may be sent anywhere — before the account is settled.
  it("ignores a parsed CSV while no account is chosen", () => {
    const state = wizardReducer(initialWizardState, {
      type: "file-parsed",
      fileName: "statement.csv",
      headers: HEADERS,
      rows: ROWS,
      detectedParserId: "green-got",
    });

    expect(state).toBe(initialWizardState);
  });

  it("ignores a dropped PDF while no account is chosen", () => {
    const state = wizardReducer(initialWizardState, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });

    expect(state).toBe(initialWizardState);
  });

  it("records the account and then a manual parser choice", () => {
    const state = wizardReducer(withAccount, {
      type: "select-parser",
      parserId: "green-got",
    });

    expect(state.accountId).toBe(5);
    expect(state.parserId).toBe("green-got");
  });

  it("advances to preview only with a file, parser, and account", () => {
    const ready = wizardReducer(
      {
        ...initialWizardState,
        rows: ROWS,
        parserId: "green-got",
        accountId: 5 as AccountId,
      },
      { type: "go-to-preview" },
    );
    expect(ready.step).toBe("preview");

    const notReady = wizardReducer(
      { ...initialWizardState, rows: ROWS, parserId: null, accountId: null },
      { type: "go-to-preview" },
    );
    expect(notReady.step).toBe("upload");
  });

  it("goes back to upload from preview", () => {
    const state = wizardReducer(
      { ...initialWizardState, step: "preview" },
      { type: "back-to-upload" },
    );
    expect(state.step).toBe("upload");
  });

  it("records a file parse error", () => {
    const state = wizardReducer(withAccount, {
      type: "file-error",
      message: "Could not read that file.",
    });
    expect(state.error).toBe("Could not read that file.");
  });
});

describe("wizardReducer — PDF extraction path", () => {
  const EXTRACTED = [
    {
      date: new Date("2026-01-15T00:00:00Z"),
      amount: -10,
      rawIssuerString: "A",
    },
    {
      date: new Date("2026-02-03T00:00:00Z"),
      amount: 20,
      rawIssuerString: "B",
    },
  ];
  const TOTALS = { debit: 10, credit: 20 };

  it("enters the extracting state on a PDF drop, clearing any CSV state", () => {
    const fromCsv = wizardReducer(withAccount, {
      type: "file-parsed",
      fileName: "statement.csv",
      headers: HEADERS,
      rows: ROWS,
      detectedParserId: "green-got",
    });

    const state = wizardReducer(fromCsv, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });

    expect(state.source).toBe("pdf");
    expect(state.extracting).toBe(true);
    expect(state.fileName).toBe("statement.pdf");
    expect(state.importBatchId).toMatch(/.+/);
    // The prior CSV parse is wiped so it can't leak into the PDF preview.
    expect(state.rows).toEqual([]);
    expect(state.parserId).toBeNull();
  });

  // Extraction can only have started with an account in hand, so a success has
  // nothing left to wait for — it lands on the validation view directly.
  it("lands on the preview when extraction succeeds", () => {
    const extracting = wizardReducer(withAccount, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });
    const state = wizardReducer(extracting, {
      type: "extract-success",
      transactions: EXTRACTED,
      declaredTotals: TOTALS,
      extractionMs: 0,
    });

    expect(state.extracting).toBe(false);
    expect(state.extracted).toBe(EXTRACTED);
    expect(state.declaredTotals).toEqual(TOTALS);
    expect(state.step).toBe("preview");
  });

  it("records the extraction duration on success and clears it on a later error", () => {
    const extracting = wizardReducer(withAccount, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });
    expect(extracting.extractionMs).toBeNull();

    const extracted = wizardReducer(extracting, {
      type: "extract-success",
      transactions: EXTRACTED,
      declaredTotals: TOTALS,
      extractionMs: 8421,
    });
    expect(extracted.extractionMs).toBe(8421);

    const failed = wizardReducer(extracted, {
      type: "extract-error",
      message: "nope",
    });
    expect(failed.extractionMs).toBeNull();
  });

  it("keeps the dropped PDF file for the side-by-side blob-URL preview", () => {
    const pdf = new File([], "statement.pdf", { type: "application/pdf" });
    const state = wizardReducer(withAccount, {
      type: "extract-start",
      file: pdf,
    });
    expect(state.file).toBe(pdf);
    expect(state.fileName).toBe("statement.pdf");
  });

  it("edits an extracted row in place (date, amount, raw issuer)", () => {
    const extracted = wizardReducer(
      wizardReducer(withAccount, {
        type: "extract-start",
        file: new File([], "statement.pdf", { type: "application/pdf" }),
      }),
      {
        type: "extract-success",
        transactions: EXTRACTED,
        declaredTotals: TOTALS,
        extractionMs: 0,
      },
    );

    const state = wizardReducer(extracted, {
      type: "edit-extracted",
      index: 0,
      patch: { amount: -12, rawIssuerString: "CORRECTED" },
    });

    expect(state.extracted?.[0]).toMatchObject({
      amount: -12,
      rawIssuerString: "CORRECTED",
    });
    // Other rows are untouched.
    expect(state.extracted?.[1]).toBe(EXTRACTED[1]);
  });

  it("deletes a phantom extracted row", () => {
    const extracted = wizardReducer(
      wizardReducer(withAccount, {
        type: "extract-start",
        file: new File([], "statement.pdf", { type: "application/pdf" }),
      }),
      {
        type: "extract-success",
        transactions: EXTRACTED,
        declaredTotals: TOTALS,
        extractionMs: 0,
      },
    );

    const state = wizardReducer(extracted, {
      type: "delete-extracted",
      index: 0,
    });

    expect(state.extracted).toHaveLength(1);
    expect(state.extracted?.[0]).toBe(EXTRACTED[1]);
  });

  it("adds a blank extracted row for a missed operation", () => {
    const extracted = wizardReducer(
      wizardReducer(withAccount, {
        type: "extract-start",
        file: new File([], "statement.pdf", { type: "application/pdf" }),
      }),
      {
        type: "extract-success",
        transactions: EXTRACTED,
        declaredTotals: TOTALS,
        extractionMs: 0,
      },
    );

    const state = wizardReducer(extracted, { type: "add-extracted" });

    expect(state.extracted).toHaveLength(3);
    expect(state.extracted?.[2]).toMatchObject({
      amount: 0,
      rawIssuerString: "",
    });
  });

  it("surfaces an extraction failure and stays on upload", () => {
    const extracting = wizardReducer(withAccount, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });
    const state = wizardReducer(extracting, {
      type: "extract-error",
      message: "Couldn't read that PDF statement. Please try again.",
    });

    expect(state.extracting).toBe(false);
    expect(state.extracted).toBeNull();
    expect(state.step).toBe("upload");
    expect(state.error).toBe("Couldn't read that PDF statement. Please try again.");
  });

  it("clears a prior successful extraction when a later file drop fails", () => {
    const extracting = wizardReducer(withAccount, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });
    const extracted = wizardReducer(extracting, {
      type: "extract-success",
      transactions: EXTRACTED,
      declaredTotals: TOTALS,
      extractionMs: 0,
    });

    const state = wizardReducer(extracted, {
      type: "file-error",
      message: "Couldn't read that file. Is it a valid CSV?",
    });

    // The failed drop leaves nothing previewable behind the error banner.
    expect(state.error).toBe("Couldn't read that file. Is it a valid CSV?");
    expect(state.source).toBeNull();
    expect(state.extracted).toBeNull();
    expect(state.rows).toEqual([]);
    expect(canPreview({ ...state, accountId: 5 as AccountId })).toBe(false);
  });
});

describe("wizardReducer — skipping previewed rows (CSV path)", () => {
  const loaded = wizardReducer(withAccount, {
    type: "file-parsed",
    fileName: "statement.csv",
    headers: HEADERS,
    rows: ROWS,
    detectedParserId: "green-got",
  });

  it("skips a previewed row and takes it back", () => {
    let state = wizardReducer(loaded, { type: "skip-row", index: 2 });
    expect(state.skippedRows).toEqual([2]);

    state = wizardReducer(state, { type: "skip-row", index: 0 });
    expect(state.skippedRows).toEqual([0, 2]);

    state = wizardReducer(state, { type: "restore-row", index: 2 });
    expect(state.skippedRows).toEqual([0]);
  });

  it("counts a row once however often it is skipped", () => {
    const state = wizardReducer(wizardReducer(loaded, { type: "skip-row", index: 1 }), {
      type: "skip-row",
      index: 1,
    });
    expect(state.skippedRows).toEqual([1]);
  });

  it("restoring a row that was never skipped changes nothing", () => {
    const state = wizardReducer(loaded, { type: "restore-row", index: 3 });
    expect(state.skippedRows).toEqual([]);
  });

  // The indices name parsed records, and both of these mint a different set of
  // them — a skip carried across would hold out whichever row landed at that
  // position next.
  it("clears the skipped rows when another file is parsed", () => {
    const skipped = wizardReducer(loaded, { type: "skip-row", index: 0 });
    const state = wizardReducer(skipped, {
      type: "file-parsed",
      fileName: "other.csv",
      headers: HEADERS,
      rows: ROWS,
      detectedParserId: "green-got",
    });
    expect(state.skippedRows).toEqual([]);
  });

  it("clears the skipped rows when the parser changes", () => {
    const skipped = wizardReducer(loaded, { type: "skip-row", index: 0 });
    const state = wizardReducer(skipped, {
      type: "select-parser",
      parserId: "some-other-bank",
    });
    expect(state.skippedRows).toEqual([]);
  });
});

describe("makeInitialWizardState", () => {
  it("returns the empty state with no prefill", () => {
    expect(makeInitialWizardState()).toBe(initialWizardState);
  });

  it("pre-selects the account from a grid handoff", () => {
    const state = makeInitialWizardState({ accountId: 7 as AccountId });
    expect(state.accountId).toBe(7);
    expect(state.rows).toEqual([]);
    expect(state.step).toBe("upload");
  });

  it("pre-loads an already-parsed statement, auto-detected", () => {
    const state = makeInitialWizardState({
      accountId: 7 as AccountId,
      file: {
        fileName: "statement.csv",
        headers: HEADERS,
        rows: ROWS,
        detectedParserId: "green-got",
      },
    });

    expect(state.fileName).toBe("statement.csv");
    expect(state.rows).toBe(ROWS);
    expect(state.parserId).toBe("green-got");
    expect(state.autoDetected).toBe(true);
    expect(state.importBatchId).toMatch(/.+/);
  });

  it("leaves the parser unset when the handed-off file is unrecognized", () => {
    const state = makeInitialWizardState({
      accountId: 7 as AccountId,
      file: {
        fileName: "unknown.csv",
        headers: ["a", "b"],
        rows: ROWS,
        detectedParserId: null,
      },
    });

    expect(state.parserId).toBeNull();
    expect(state.autoDetected).toBe(false);
  });

  // The grid always hands off both, so this is the invariant restated at the
  // door rather than a case the UI can reach: a statement with no account is a
  // statement the wizard cannot read, and taking it would seat the user in front
  // of a file whose account they still owe.
  it("drops a handed-off file that carries no account", () => {
    const state = makeInitialWizardState({
      file: {
        fileName: "statement.csv",
        headers: HEADERS,
        rows: ROWS,
        detectedParserId: "green-got",
      },
    });

    expect(state.accountId).toBeNull();
    expect(state.fileName).toBeNull();
    expect(state.rows).toEqual([]);
    expect(state.parserId).toBeNull();
  });
});
