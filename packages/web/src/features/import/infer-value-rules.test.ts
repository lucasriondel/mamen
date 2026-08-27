import { describe, expect, it } from "vitest";
import { inferredValueRules, NOTHING_TOUCHED, type TouchedValueRules } from "./infer-value-rules";
import { blankDraft, type FormatDraft } from "./parsers/format-draft";

/**
 * The seam between a column assignment and the two **value rules** it proves
 * (issue #222) — which field re-reads which rule, and the two refusals that keep
 * inference a default rather than an override.
 *
 * Driven with drafts as they stand *after* the assignment, which is how the
 * mapping step calls it.
 */

const ROWS = [
  { Date: "23/04/2026", Montant: "-12,50", Debit: "12,50", Credit: "", Tiers: "CARREFOUR" },
  { Date: "01/05/2026", Montant: "1 340,00", Debit: "", Credit: "1 340,00", Tiers: "SALAIRE" },
];

/** A blank CSV draft with the given fields already mapped. */
function draftWith(patch: Partial<FormatDraft>): FormatDraft {
  return { ...blankDraft("csv"), ...patch };
}

const TOUCHED_BOTH: TouchedValueRules = { dateOrder: true, decimalSeparator: true };

describe("inferredValueRules", () => {
  it("sets the date order when the date column is assigned", () => {
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: [], counterpartyIban: null },
    });
    expect(inferredValueRules(draft, "date", ROWS, NOTHING_TOUCHED)).toEqual({
      dateOrder: "day-first",
    });
  });

  it("sets the decimal separator when the amount column is assigned", () => {
    const draft = draftWith({ sign: { strategy: "signed-column", amountColumn: "Montant" } });
    expect(inferredValueRules(draft, "amount", ROWS, NOTHING_TOUCHED)).toEqual({
      decimalSeparator: "comma",
    });
  });

  it("sets the decimal separator from a debit column", () => {
    const draft = draftWith({
      sign: { strategy: "debit-credit-columns", debitColumn: "Debit", creditColumn: "" },
    });
    expect(inferredValueRules(draft, "debit", ROWS, NOTHING_TOUCHED)).toEqual({
      decimalSeparator: "comma",
    });
  });

  // The wider sample is the better evidence, so both halves are read together.
  it("reads both halves of a debit/credit pair once the second lands", () => {
    const draft = draftWith({
      sign: { strategy: "debit-credit-columns", debitColumn: "Debit", creditColumn: "Credit" },
    });
    expect(inferredValueRules(draft, "credit", ROWS, NOTHING_TOUCHED)).toEqual({
      decimalSeparator: "comma",
    });
  });

  it("infers nothing from a field that feeds neither rule", () => {
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: ["Tiers"], counterpartyIban: null },
    });
    expect(inferredValueRules(draft, "label", ROWS, NOTHING_TOUCHED)).toEqual({});
    expect(inferredValueRules(draft, "iban", ROWS, NOTHING_TOUCHED)).toEqual({});
    expect(inferredValueRules(draft, "filter", ROWS, NOTHING_TOUCHED)).toEqual({});
  });

  // The override rule, both halves.
  it("never touches a rule the user has answered by hand", () => {
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: [], counterpartyIban: null },
      sign: { strategy: "signed-column", amountColumn: "Montant" },
    });
    expect(inferredValueRules(draft, "date", ROWS, TOUCHED_BOTH)).toEqual({});
    expect(inferredValueRules(draft, "amount", ROWS, TOUCHED_BOTH)).toEqual({});
  });

  it("still infers the untouched rule when the other has been overridden", () => {
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: [], counterpartyIban: null },
    });
    expect(
      inferredValueRules(draft, "date", ROWS, { dateOrder: false, decimalSeparator: true }),
    ).toEqual({ dateOrder: "day-first" });
  });

  // PRD #180's refusal, preserved exactly where the file gives nothing to read.
  it("leaves the field alone when the sample is ambiguous", () => {
    const rows = [{ Date: "01/02/2026", Montant: "1234" }];
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: [], counterpartyIban: null },
      sign: { strategy: "signed-column", amountColumn: "Montant" },
    });
    expect(inferredValueRules(draft, "date", rows, NOTHING_TOUCHED)).toEqual({});
    expect(inferredValueRules(draft, "amount", rows, NOTHING_TOUCHED)).toEqual({});
  });

  it("infers nothing when the assignment cleared the column", () => {
    const draft = draftWith({});
    expect(inferredValueRules(draft, "date", ROWS, NOTHING_TOUCHED)).toEqual({});
    expect(inferredValueRules(draft, "amount", ROWS, NOTHING_TOUCHED)).toEqual({});
  });

  // The previous value was inference's own, so there is nothing to protect.
  it("re-reads when an untouched field is remapped to another column", () => {
    const rows = [{ Wrong: "01/02/2026", Date: "04/23/2026" }];
    const draft = draftWith({
      mapping: { date: "Date", rawIssuerString: [], counterpartyIban: null },
      dateOrder: "day-first",
    });
    expect(inferredValueRules(draft, "date", rows, NOTHING_TOUCHED)).toEqual({
      dateOrder: "month-first",
    });
  });
});
