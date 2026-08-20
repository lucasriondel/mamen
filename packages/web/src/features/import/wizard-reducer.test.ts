import type { AccountId, CsvStatementFormat, StatementFormatId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { blankDraft } from "./parsers/format-draft";
import {
  canAcceptFile,
  canPreview,
  initialWizardState,
  makeInitialWizardState,
  wizardReducer,
} from "./wizard-reducer";

const HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"];
const ROWS = [{ Statut: "COMPLETE", Date: "2026-01-01T00:00:00Z" }];

/**
 * A stored **Statement Format**, as the account's list hands it to the wizard
 * (issue #184). The reducer never reads anything off one but its `id` — the
 * detecting and the applying are both outside it — so the whole record is here
 * only because the `detect-format` action carries the detection result verbatim.
 */
const FORMAT: CsvStatementFormat = {
  id: 3 as StatementFormatId,
  accountId: 5 as AccountId,
  name: "Green-Got",
  kind: "csv",
  headers: HEADERS,
  mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
  rules: {
    sign: { strategy: "signed-column", amountColumn: "Montant" },
    dateOrder: "iso",
    decimalSeparator: "dot",
    filter: null,
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** The account is picked first now (issue #181) — every file case starts here. */
const withAccount = wizardReducer(initialWizardState, {
  type: "select-account",
  accountId: 5 as AccountId,
});

/** An account and a parsed CSV, with detection not yet run over it. */
const parsedCsv = wizardReducer(withAccount, {
  type: "file-parsed",
  fileName: "statement.csv",
  headers: HEADERS,
  rows: ROWS,
});

describe("wizardReducer", () => {
  it("starts on the upload step with nothing configured", () => {
    expect(initialWizardState.step).toBe("upload");
    expect(initialWizardState.formatId).toBeNull();
    expect(initialWizardState.formatSelection).toBeNull();
    expect(initialWizardState.accountId).toBeNull();
  });

  it("takes no file until the account is chosen", () => {
    expect(canAcceptFile(initialWizardState)).toBe(false);
    expect(canAcceptFile(withAccount)).toBe(true);
  });

  // A parsed file no longer arrives with a format on it: the account's formats
  // are fetched (issue #184), so detection is a second beat that lands whenever
  // that list does. Until it lands the file is loaded and undecided.
  it("loads a parsed file with no format decided yet", () => {
    const state = wizardReducer(withAccount, {
      type: "file-parsed",
      fileName: "statement.csv",
      headers: HEADERS,
      rows: ROWS,
    });

    expect(state.fileName).toBe("statement.csv");
    expect(state.rows).toBe(ROWS);
    expect(state.formatId).toBeNull();
    expect(state.formatSelection).toBeNull();
    expect(state.importBatchId).toMatch(/.+/);
  });

  it("selects the detected format when exactly one fingerprint matched", () => {
    const state = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "detected", format: FORMAT },
    });

    expect(state.formatId).toBe(FORMAT.id);
    expect(state.formatSelection).toBe("detected");
  });

  // The two hints the picker distinguishes are two *states*, not one failure:
  // "nothing matched" is a file the account has no format for, "several matched"
  // is an ambiguity only the user can settle. Both leave the format unset.
  it("leaves the format unset when nothing matched", () => {
    const state = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "none" },
    });

    expect(state.formatId).toBeNull();
    expect(state.formatSelection).toBe("none");
  });

  it("leaves the format unset when several matched", () => {
    const state = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "several" },
    });

    expect(state.formatId).toBeNull();
    expect(state.formatSelection).toBe("several");
  });

  // Detection is fired from an effect, so its result can arrive after the user
  // has replaced the CSV with a PDF. Applying it then would put a CSV format on
  // a file that has no headers at all.
  it("ignores a detection result once the CSV is gone", () => {
    const pdf = wizardReducer(parsedCsv, {
      type: "extract-start",
      file: new File([], "statement.pdf", { type: "application/pdf" }),
    });
    const state = wizardReducer(pdf, {
      type: "detect-format",
      detection: { outcome: "detected", format: FORMAT },
    });

    expect(state).toBe(pdf);
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

  // A manual pick overrides whatever detection concluded — including a
  // successful one, since the picker is on screen for every import rather than
  // only when detection failed.
  it("records the account and then a manual format choice", () => {
    const detected = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "detected", format: FORMAT },
    });
    const state = wizardReducer(detected, {
      type: "select-format",
      formatId: 9 as StatementFormatId,
    });

    expect(state.accountId).toBe(5);
    expect(state.formatId).toBe(9);
    expect(state.formatSelection).toBe("manual");
  });

  it("advances to preview only with a file, format, and account", () => {
    const ready = wizardReducer(
      {
        ...initialWizardState,
        rows: ROWS,
        formatId: 3 as StatementFormatId,
        accountId: 5 as AccountId,
      },
      { type: "go-to-preview" },
    );
    expect(ready.step).toBe("preview");

    const notReady = wizardReducer(
      { ...initialWizardState, rows: ROWS, formatId: null, accountId: null },
      { type: "go-to-preview" },
    );
    expect(notReady.step).toBe("upload");
  });

  // Formats are account-scoped, so the account changing under a loaded file
  // changes which formats could read it — including out of existence.
  it("drops the chosen format when the account changes", () => {
    const detected = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "detected", format: FORMAT },
    });
    const state = wizardReducer(detected, { type: "select-account", accountId: 8 as AccountId });

    expect(state.accountId).toBe(8);
    expect(state.formatId).toBeNull();
    expect(state.formatSelection).toBeNull();
    // The file itself is untouched — it is the same statement, read against
    // another account's formats.
    expect(state.rows).toBe(ROWS);
  });

  it("leaves a chosen format alone when the same account is picked again", () => {
    const detected = wizardReducer(parsedCsv, {
      type: "detect-format",
      detection: { outcome: "detected", format: FORMAT },
    });
    const state = wizardReducer(detected, { type: "select-account", accountId: 5 as AccountId });

    expect(state).toBe(detected);
  });

  it("goes back to upload from preview", () => {
    const state = wizardReducer(
      { ...initialWizardState, step: "preview" },
      { type: "back-to-upload" },
    );
    expect(state.step).toBe("upload");
  });

  /**
   * Issue #185 — a PDF is extracted *against* a **Statement Format**, so when the
   * account has more than one of them the file waits in the wizard while the user
   * says which. Held in the state machine rather than in the upload step's local
   * state, for the same reason the account gate is: "a file is in hand and
   * nothing has been sent anywhere" is a state of the import, and the step that
   * renders it is not the only thing that has to agree about it.
   */
  describe("a PDF waiting on a format choice", () => {
    const PDF = new File([], "statement.pdf", { type: "application/pdf" });

    it("holds the file without extracting anything", () => {
      const state = wizardReducer(withAccount, { type: "pdf-awaits-format", file: PDF });

      expect(state.pendingPdf).toBe(PDF);
      expect(state.source).toBe("pdf");
      expect(state.fileName).toBe("statement.pdf");
      // Nothing is in flight and nothing came back: the spinner belongs to a
      // request that has been made, and no request has been made.
      expect(state.extracting).toBe(false);
      expect(state.extracted).toBeNull();
      expect(canPreview(state)).toBe(false);
    });

    it("clears any CSV state, as a PDF drop does", () => {
      const fromCsv = wizardReducer(parsedCsv, {
        type: "detect-format",
        detection: { outcome: "detected", format: FORMAT },
      });

      const state = wizardReducer(fromCsv, { type: "pdf-awaits-format", file: PDF });

      expect(state.rows).toEqual([]);
      expect(state.formatId).toBeNull();
      expect(state.formatSelection).toBeNull();
    });

    it("lets go of the file once its extraction starts", () => {
      const waiting = wizardReducer(withAccount, { type: "pdf-awaits-format", file: PDF });
      const state = wizardReducer(waiting, { type: "extract-start", file: PDF });

      expect(state.pendingPdf).toBeNull();
      expect(state.extracting).toBe(true);
    });

    it("lets go of the file when the drop is refused", () => {
      const waiting = wizardReducer(withAccount, { type: "pdf-awaits-format", file: PDF });
      const state = wizardReducer(waiting, { type: "file-error", message: "No." });

      expect(state.pendingPdf).toBeNull();
    });

    // The same door the rest of the file waits at: without an account there is
    // no set of formats to choose from in the first place.
    it("is ignored while no account is chosen", () => {
      const state = wizardReducer(initialWizardState, { type: "pdf-awaits-format", file: PDF });

      expect(state).toBe(initialWizardState);
    });
  });

  /**
   * Issue #186 — when no format applies, the wizard walks the user into building
   * one against the file in front of them. The draft lives here, in the state of
   * the *import*, because it outlives the step that authors it: the preview
   * reads the rows through it and the commit saves it.
   */
  describe("a Statement Format being built from the file", () => {
    /** A draft with every answer the applying half needs, over `HEADERS`. */
    const READY = {
      ...blankDraft(),
      name: "Green-Got",
      mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
      sign: { strategy: "signed-column" as const, amountColumn: "Montant" },
      dateOrder: "iso" as const,
      decimalSeparator: "dot" as const,
    };

    // The third route in, and the one the copy exists for: an account nobody has
    // set up yet has not failed to recognise anything.
    it("records that the account has no format of this kind at all", () => {
      const state = wizardReducer(parsedCsv, {
        type: "detect-format",
        detection: { outcome: "no-formats" },
      });

      expect(state.formatId).toBeNull();
      expect(state.formatSelection).toBe("no-formats");
    });

    it("opens the mapping step on a draft that declares nothing", () => {
      const state = wizardReducer(parsedCsv, { type: "build-format" });

      expect(state.step).toBe("mapping");
      expect(state.draftFormat).toEqual(blankDraft());
    });

    // Reopening is editing, not restarting: a user who went to the preview and
    // came back to fix the date order must find the rest of their answers.
    it("reopens the draft it already has rather than blanking it", () => {
      const drafted = wizardReducer(wizardReducer(parsedCsv, { type: "build-format" }), {
        type: "update-format-draft",
        patch: { name: "Green-Got" },
      });
      const state = wizardReducer({ ...drafted, step: "upload" }, { type: "build-format" });

      expect(state.step).toBe("mapping");
      expect(state.draftFormat?.name).toBe("Green-Got");
    });

    // Nothing to map against: the mapping step's whole subject is the file's real
    // headers, and a PDF has none until extraction has run.
    it("is ignored when there is no parsed CSV to map", () => {
      const pdf = wizardReducer(withAccount, {
        type: "extract-start",
        file: new File([], "statement.pdf", { type: "application/pdf" }),
      });

      expect(wizardReducer(pdf, { type: "build-format" })).toBe(pdf);
      expect(wizardReducer(withAccount, { type: "build-format" })).toBe(withAccount);
    });

    it("patches one answer at a time, leaving the others standing", () => {
      const opened = wizardReducer(parsedCsv, { type: "build-format" });
      const named = wizardReducer(opened, {
        type: "update-format-draft",
        patch: { name: "Green-Got" },
      });
      const state = wizardReducer(named, {
        type: "update-format-draft",
        patch: { dateOrder: "day-first" },
      });

      expect(state.draftFormat).toEqual({
        ...blankDraft(),
        name: "Green-Got",
        dateOrder: "day-first",
      });
    });

    it("ignores a patch when nothing is being drafted", () => {
      expect(wizardReducer(parsedCsv, { type: "update-format-draft", patch: { name: "X" } })).toBe(
        parsedCsv,
      );
    });

    // The abandon path: the draft is never written anywhere but here, so letting
    // go of it is all "leave nothing behind" takes.
    it("throws the draft away and returns to the upload step", () => {
      const drafted = { ...parsedCsv, step: "mapping" as const, draftFormat: READY };
      const state = wizardReducer(drafted, { type: "discard-format-draft" });

      expect(state.draftFormat).toBeNull();
      expect(state.step).toBe("upload");
      // The file is untouched — the user gave up on the format, not the import.
      expect(state.rows).toBe(ROWS);
    });

    it("previews on a complete draft with no stored format chosen", () => {
      const incomplete = {
        ...parsedCsv,
        draftFormat: { ...READY, decimalSeparator: null },
      };
      expect(canPreview(incomplete)).toBe(false);

      const ready = { ...parsedCsv, draftFormat: READY };
      expect(canPreview(ready)).toBe(true);
      expect(wizardReducer(ready, { type: "go-to-preview" }).step).toBe("preview");
    });

    // An unnamed format cannot be saved, and the draft is saved by the very
    // action that commits — so an unnamed draft cannot reach the preview either.
    it("holds the preview back until the draft is named", () => {
      expect(canPreview({ ...parsedCsv, draftFormat: { ...READY, name: "  " } })).toBe(false);
    });

    it.each([
      [
        "the user picks a stored format instead",
        { type: "select-format", formatId: 9 as StatementFormatId } as const,
      ],
      [
        "another file is parsed",
        { type: "file-parsed", fileName: "b.csv", headers: HEADERS, rows: ROWS } as const,
      ],
      ["the account changes", { type: "select-account", accountId: 8 as AccountId } as const],
      [
        "a PDF takes the file's place",
        { type: "extract-start", file: new File([], "s.pdf") } as const,
      ],
      ["the drop fails", { type: "file-error", message: "No." } as const],
    ])("lets go of the draft when %s", (_when, action) => {
      const drafted = { ...parsedCsv, draftFormat: READY };

      expect(wizardReducer(drafted, action).draftFormat).toBeNull();
    });
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
    expect(state.formatId).toBeNull();
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
 * Which rows survive a commit, said the way a preview reads the state: the ids
 * that were minted, minus the ones a skip names. This is the whole point of the
 * ids — the answer is about rows, so the test asks about rows.
 */
const keptExtracted = (state: ReturnType<typeof extractPdf>) =>
  state.rowIds
    .map((id, index) => ({ id, row: state.extracted?.[index] }))
    .filter(({ id }) => !state.skippedRows.includes(id))
    .map(({ row }) => row);

/**
 * Skipping, keyed on **stable row ids** on both paths (issue #192 — the
 * *contract* half of the expand–contract #191 opened). A skip names a row, not a
 * position: the tests below say which row is held out, and the id form is what
 * lets them keep saying it after the rows around it change.
 */
describe("wizardReducer — skipping previewed rows", () => {
  it("skips a previewed CSV row and takes it back", () => {
    const loaded = parseCsv();
    const [first, , third] = loaded.rowIds;

    let state = wizardReducer(loaded, { type: "skip-row", rowId: third });
    expect(state.skippedRows).toEqual([third]);

    state = wizardReducer(state, { type: "skip-row", rowId: first });
    expect(state.skippedRows).toEqual([first, third]);

    state = wizardReducer(state, { type: "restore-row", rowId: third });
    expect(state.skippedRows).toEqual([first]);
  });

  it("skips an extracted PDF row and takes it back — the same action, the same shape", () => {
    const extracted = extractPdf();
    const [first] = extracted.rowIds;

    const skipped = wizardReducer(extracted, { type: "skip-row", rowId: first });
    expect(skipped.skippedRows).toEqual([first]);
    expect(keptExtracted(skipped)).toEqual([PDF_ROWS[1]]);

    const restored = wizardReducer(skipped, { type: "restore-row", rowId: first });
    expect(restored.skippedRows).toEqual([]);
    expect(keptExtracted(restored)).toEqual(PDF_ROWS);
  });

  // The phantom row the extraction read off a summary line used to be deleted
  // here. It is skipped now: struck through, inert and one click from coming
  // back — the same recourse the CSV path has always offered.
  it("skips a phantom extracted row instead of deleting it", () => {
    const extracted = extractPdf();

    const state = wizardReducer(extracted, { type: "skip-row", rowId: extracted.rowIds[0] });

    // Still on screen, still extracted — held out of the commit, not removed.
    expect(state.extracted).toHaveLength(2);
    expect(state.rowIds).toEqual(extracted.rowIds);
    expect(keptExtracted(state)).toEqual([PDF_ROWS[1]]);
  });

  // The failure the ids exist to prevent: under ascending indices, a skip is a
  // position, so anything that changes what sits at that position quietly holds
  // out a different row.
  it("names the same row after the rows around it change", () => {
    const extracted = extractPdf();
    const skipped = wizardReducer(extracted, { type: "skip-row", rowId: extracted.rowIds[1] });

    const state = wizardReducer(skipped, { type: "add-extracted" });

    expect(state.extracted).toHaveLength(3);
    // The added row commits; the row that was skipped is still the one held out.
    expect(keptExtracted(state)).toEqual([PDF_ROWS[0], state.extracted?.[2]]);
  });

  it("counts a row once however often it is skipped", () => {
    const loaded = parseCsv();
    const [, second] = loaded.rowIds;
    const state = wizardReducer(wizardReducer(loaded, { type: "skip-row", rowId: second }), {
      type: "skip-row",
      rowId: second,
    });
    expect(state.skippedRows).toEqual([second]);
  });

  it("restoring a row that was never skipped changes nothing", () => {
    const loaded = parseCsv();
    const state = wizardReducer(loaded, { type: "restore-row", rowId: loaded.rowIds[0] });
    expect(state.skippedRows).toEqual([]);
  });

  // Each of these mints a different set of candidate rows, and the counter never
  // rewinds — so a skip carried across would name a row that no longer exists.
  it("clears the skipped rows when another file is parsed", () => {
    const skipped = wizardReducer(parseCsv(), { type: "skip-row", rowId: parseCsv().rowIds[0] });
    const state = wizardReducer(skipped, {
      type: "file-parsed",
      fileName: "other.csv",
      headers: HEADERS,
      rows: CSV_ROWS,
    });
    expect(state.skippedRows).toEqual([]);
  });

  it("clears the skipped rows when the format changes", () => {
    const loaded = parseCsv();
    const skipped = wizardReducer(loaded, { type: "skip-row", rowId: loaded.rowIds[0] });
    const state = wizardReducer(skipped, {
      type: "select-format",
      formatId: 9 as StatementFormatId,
    });
    expect(state.skippedRows).toEqual([]);
  });

  it("clears the skipped rows when a new extraction starts and when one fails", () => {
    const extracted = extractPdf();
    const skipped = wizardReducer(extracted, { type: "skip-row", rowId: extracted.rowIds[0] });

    expect(
      wizardReducer(skipped, {
        type: "extract-start",
        file: new File([], "other.pdf", { type: "application/pdf" }),
      }).skippedRows,
    ).toEqual([]);

    expect(wizardReducer(skipped, { type: "extract-error", message: "nope" }).skippedRows).toEqual(
      [],
    );
  });

  it("clears the skipped rows when a file drop fails", () => {
    const loaded = parseCsv();
    const skipped = wizardReducer(loaded, { type: "skip-row", rowId: loaded.rowIds[0] });
    expect(wizardReducer(skipped, { type: "file-error", message: "nope" }).skippedRows).toEqual([]);
  });
});

/**
 * The **stable row id** half of issue #191 — the *expand* of an expand–contract.
 * Issue #192 closed it: `skippedRows` is keyed on these ids now, so the cases
 * above say what is done with them and the ones below say what they *are*
 * (present, unique, stable, cleared).
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

  // The counter is never rewound, so an id is spent once for the wizard's whole
  // life. A blank row that re-derived its id from the row count could land on the
  // id of a row already on screen — two rows one skip could not tell apart, which
  // is the whole reason the ids are not positions.
  it("never hands an added row an id already in circulation", () => {
    const extracted = extractPdf();

    const state = wizardReducer(wizardReducer(extracted, { type: "add-extracted" }), {
      type: "add-extracted",
    });

    expect(state.rowIds).toHaveLength(4);
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

  it("mints a different set of ids when the format changes", () => {
    const parsed = parseCsv();
    const state = wizardReducer(parsed, {
      type: "select-format",
      formatId: 9 as StatementFormatId,
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

  // One identity model, not two: the skipped set holds ids off the same counter
  // the rows carry, so nothing on this state is addressed by position any more.
  it("holds skipped rows as ids drawn from the rows' own", () => {
    const loaded = parseCsv();
    const state = wizardReducer(
      wizardReducer(loaded, { type: "skip-row", rowId: loaded.rowIds[2] }),
      {
        type: "skip-row",
        rowId: loaded.rowIds[0],
      },
    );

    expect(state.skippedRows).toEqual([loaded.rowIds[0], loaded.rowIds[2]]);
    for (const id of state.skippedRows) expect(loaded.rowIds).toContain(id);
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

  // The handoff carries a parsed file, never a format: the account's formats are
  // fetched, and at mount that request has not even been made. So a grid-driven
  // open lands undecided and detection runs the moment the list arrives, exactly
  // as a dropped file's does (issue #184).
  it("pre-loads an already-parsed statement, with no format decided yet", () => {
    const state = makeInitialWizardState({
      accountId: 7 as AccountId,
      file: {
        fileName: "statement.csv",
        headers: HEADERS,
        rows: ROWS,
      },
    });

    expect(state.fileName).toBe("statement.csv");
    expect(state.rows).toBe(ROWS);
    expect(state.headers).toBe(HEADERS);
    expect(state.formatId).toBeNull();
    expect(state.formatSelection).toBeNull();
    expect(state.importBatchId).toMatch(/.+/);
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
      },
    });

    expect(state.accountId).toBeNull();
    expect(state.fileName).toBeNull();
    expect(state.rows).toEqual([]);
    expect(state.formatId).toBeNull();
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
