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

/** Three CSV rows, so a per-row id list is distinguishable from a per-file one. */
const CSV_ROWS = [
  { Statut: "COMPLETE", Date: "2026-01-01T00:00:00Z" },
  { Statut: "COMPLETE", Date: "2026-01-02T00:00:00Z" },
  { Statut: "COMPLETE", Date: "2026-01-03T00:00:00Z" },
];

const PDF_ROWS = [
  { date: new Date("2026-01-15T00:00:00Z"), amount: -10, rawIssuerString: "A" },
  { date: new Date("2026-02-03T00:00:00Z"), amount: 20, rawIssuerString: "B" },
];

/** Drive the wizard to a parsed CSV — the CSV path's minting point. */
const parseCsv = (rows = CSV_ROWS) =>
  wizardReducer(withAccount, {
    type: "file-parsed",
    fileName: "statement.csv",
    headers: HEADERS,
    rows,
    detectedParserId: "green-got",
  });

/** Drive the wizard through a whole PDF drop to a settled extraction. */
const extractPdf = () =>
  wizardReducer(
    wizardReducer(withAccount, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    }),
    {
      type: "extract-success",
      transactions: PDF_ROWS,
      declaredTotals: { debit: 10, credit: 20 },
      extractionMs: 0,
    },
  );

/**
 * The **stable row id** half of issue #191 — the *expand* of an expand–contract.
 * The ids sit beside the index-addressed `skippedRows`, which is untouched here:
 * nothing reads an id yet, so these tests state what the ids *are* (present,
 * unique, stable, cleared) rather than what anything does with them.
 */
describe("wizardReducer — stable row ids", () => {
  it("mints one id per row parsed from a CSV", () => {
    const state = parseCsv();

    expect(state.rowIds).toHaveLength(CSV_ROWS.length);
    expect(new Set(state.rowIds).size).toBe(CSV_ROWS.length);
  });

  it("mints one id per row extracted from a PDF", () => {
    const state = extractPdf();

    expect(state.rowIds).toHaveLength(PDF_ROWS.length);
    expect(new Set(state.rowIds).size).toBe(PDF_ROWS.length);
  });

  it("mints a fresh id for a blank added row, unique against every existing row", () => {
    const extracted = extractPdf();
    const state = wizardReducer(extracted, { type: "add-extracted" });

    expect(state.rowIds).toHaveLength(3);
    expect(state.rowIds.slice(0, 2)).toEqual(extracted.rowIds);
    expect(extracted.rowIds).not.toContain(state.rowIds[2]);
  });

  // The counter is never rewound, so a removed row takes its id out of
  // circulation with it. A `delete` that re-derived ids from the row count would
  // hand the blank row the deleted row's id — two rows one skip could not tell
  // apart, which is the whole reason the ids are not positions.
  it("never hands an added row the id of one just deleted", () => {
    const extracted = extractPdf();
    const deleted = wizardReducer(extracted, { type: "delete-extracted", index: 0 });

    const state = wizardReducer(deleted, { type: "add-extracted" });

    expect(state.rowIds).not.toContain(extracted.rowIds[0]);
    expect(new Set(state.rowIds).size).toBe(state.rowIds.length);
  });

  it("keeps a row's id through an in-place edit of its date, label and amount", () => {
    const extracted = extractPdf();

    const state = wizardReducer(extracted, {
      type: "edit-extracted",
      index: 0,
      patch: {
        date: new Date("2026-03-09T00:00:00Z"),
        amount: -12,
        rawIssuerString: "CORRECTED",
      },
    });

    expect(state.rowIds).toEqual(extracted.rowIds);
  });

  it("drops the id of a deleted extracted row and leaves the others alone", () => {
    const extracted = extractPdf();

    const state = wizardReducer(extracted, { type: "delete-extracted", index: 0 });

    expect(state.rowIds).toEqual([extracted.rowIds[1]]);
  });

  // The four points that clear `skippedRows` today. Each mints a different set of
  // candidate rows (or none at all), so an id surviving one would name a row that
  // no longer exists — the failure mode the ids are being introduced to prevent.
  it("mints a different set of ids when another file is parsed", () => {
    const first = parseCsv();
    const second = wizardReducer(first, {
      type: "file-parsed",
      fileName: "other.csv",
      headers: HEADERS,
      rows: CSV_ROWS,
      detectedParserId: "green-got",
    });

    expect(second.rowIds).toHaveLength(CSV_ROWS.length);
    for (const id of second.rowIds) expect(first.rowIds).not.toContain(id);
  });

  it("clears the ids when a file drop fails", () => {
    const state = wizardReducer(parseCsv(), {
      type: "file-error",
      message: "Couldn't read that file. Is it a valid CSV?",
    });

    expect(state.rowIds).toEqual([]);
  });

  it("mints a different set of ids when the parser changes", () => {
    const parsed = parseCsv();
    const state = wizardReducer(parsed, {
      type: "select-parser",
      parserId: "some-other-bank",
    });

    // Re-minted rather than emptied: the rows are still on screen, so every one
    // of them still needs an id — just not the one a stale skip might name.
    expect(state.rowIds).toHaveLength(CSV_ROWS.length);
    for (const id of state.rowIds) expect(parsed.rowIds).not.toContain(id);
  });

  it("clears the ids when a new extraction starts, and re-mints them on success", () => {
    const first = extractPdf();

    const extracting = wizardReducer(first, {
      type: "extract-start",
      file: new File([], "other.pdf", { type: "application/pdf" }),
    });
    expect(extracting.rowIds).toEqual([]);

    const second = wizardReducer(extracting, {
      type: "extract-success",
      transactions: PDF_ROWS,
      declaredTotals: { debit: 10, credit: 20 },
      extractionMs: 0,
    });
    for (const id of second.rowIds) expect(first.rowIds).not.toContain(id);
  });

  it("clears the ids when an extraction fails", () => {
    const state = wizardReducer(extractPdf(), {
      type: "extract-error",
      message: "Couldn't read that PDF statement. Please try again.",
    });

    expect(state.rowIds).toEqual([]);
  });

  it("mints the same ids for the same actions, so the reducer stays fixture-driven", () => {
    expect(parseCsv().rowIds).toEqual(parseCsv().rowIds);
    expect(extractPdf().rowIds).toEqual(extractPdf().rowIds);
  });

  it("leaves the skipped rows as ascending indices, unread by any id", () => {
    const state = wizardReducer(wizardReducer(parseCsv(), { type: "skip-row", index: 2 }), {
      type: "skip-row",
      index: 0,
    });

    expect(state.skippedRows).toEqual([0, 2]);
    expect(state.rowIds).toHaveLength(CSV_ROWS.length);
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

  // The handoff arrives already parsed, so its rows never pass through
  // `file-parsed` — they would start the wizard as the only candidate rows with
  // no identity if the initializer didn't mint here too.
  it("mints a stable row id for every handed-off row", () => {
    const state = makeInitialWizardState({
      accountId: 7 as AccountId,
      file: {
        fileName: "statement.csv",
        headers: HEADERS,
        rows: [ROWS[0], ROWS[0]],
        detectedParserId: "green-got",
      },
    });

    expect(state.rowIds).toHaveLength(2);
    expect(new Set(state.rowIds).size).toBe(2);
    expect(state.nextRowId).toBeGreaterThan(Math.max(...state.rowIds));
  });

  it("mints no ids when there is no handed-off file", () => {
    expect(makeInitialWizardState({ accountId: 7 as AccountId }).rowIds).toEqual([]);
  });
});
