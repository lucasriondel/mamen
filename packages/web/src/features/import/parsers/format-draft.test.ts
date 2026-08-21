import type { AccountId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { applyFormat } from "./apply-format";
import {
  blankDraft,
  draftComplete,
  draftCreate,
  type FormatDraft,
  draftRules,
} from "./format-draft";

/**
 * The **format draft** seam (issue #186, PRD #180) — what the mapping step holds
 * while the user builds a **Statement Format** from the file in front of them,
 * and the two things it turns into: the half a **Parser** applies (so the live
 * preview is parsed by the very code the import will use), and the create
 * payload the commit saves.
 *
 * Pure, so both are driven directly here rather than through the wizard.
 */

const HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"];

/** A draft with everything the applying half needs, ready to be narrowed from. */
function filled(over: Partial<FormatDraft> = {}): FormatDraft {
  return {
    ...blankDraft(),
    name: "Green-Got",
    mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
    sign: { strategy: "signed-column", amountColumn: "Montant" },
    dateOrder: "iso",
    decimalSeparator: "dot",
    ...over,
  };
}

describe("a blank draft", () => {
  it("declares nothing — no date order, no decimal separator, no columns", () => {
    const draft = blankDraft();

    // The two unguessable rules start *unset* rather than defaulted (PRD #180).
    // A default would be a guess made on the user's behalf, and this is the pair
    // whose wrong answer reads as a plausible date and a plausible number: `iso`
    // over `03/04/2026` yields the 4th of March, which looks like a date.
    expect(draft.dateOrder).toBeNull();
    expect(draft.decimalSeparator).toBeNull();
    expect(draft.name).toBe("");
    expect(draft.mapping.date).toBe("");
    // No filter: most banks need none, and "import every row" is the honest
    // starting point rather than a filter on a column nobody has chosen.
    expect(draft.filter).toBeNull();
    // …and a bank writing no counterparty IBAN is the shape `null` already means.
    expect(draft.mapping.counterpartyIban).toBeNull();
  });

  it("is not ready to parse anything", () => {
    expect(draftRules(blankDraft())).toBeNull();
    expect(draftComplete(blankDraft())).toBe(false);
  });
});

describe("when a draft is ready to parse", () => {
  it("is ready as soon as the mapping and the two rules are answered", () => {
    expect(draftRules(filled())).toEqual({
      kind: "csv",
      mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
      rules: {
        sign: { strategy: "signed-column", amountColumn: "Montant" },
        dateOrder: "iso",
        decimalSeparator: "dot",
        filter: null,
      },
    });
  });

  // The name is required to *save* a format (PRD #180 — a list of untitled
  // records is not a list), but not to preview one: the preview is how the user
  // finds out whether this is a format worth naming.
  it("previews an unnamed draft, and refuses to save it", () => {
    const unnamed = filled({ name: "  " });

    expect(draftRules(unnamed)).not.toBeNull();
    expect(draftComplete(unnamed)).toBe(false);
  });

  it.each([
    ["a date order", { dateOrder: null }],
    ["a decimal separator", { decimalSeparator: null }],
    [
      "a date column",
      { mapping: { date: "", rawIssuerString: "Intitulé", counterpartyIban: null } },
    ],
    ["a label column", { mapping: { date: "Date", rawIssuerString: "", counterpartyIban: null } }],
    ["an amount column", { sign: { strategy: "signed-column", amountColumn: "" } as const }],
  ])("parses nothing without %s", (_what, over) => {
    expect(draftRules(filled(over))).toBeNull();
  });

  // Which column(s) carry the amount is the sign rule's to say, so each strategy
  // has its own answer to "is the amount mapped yet".
  it("needs both columns of a debit/credit pair, and every part of a direction rule", () => {
    const debitCredit = { strategy: "debit-credit-columns" } as const;
    expect(
      draftRules(filled({ sign: { ...debitCredit, debitColumn: "Débit", creditColumn: "" } })),
    ).toBeNull();
    expect(
      draftRules(
        filled({ sign: { ...debitCredit, debitColumn: "Débit", creditColumn: "Crédit" } }),
      ),
    ).not.toBeNull();

    const direction = { strategy: "direction-column", amountColumn: "Montant" } as const;
    expect(
      draftRules(filled({ sign: { ...direction, directionColumn: "Direction", debitValue: "" } })),
    ).toBeNull();
    expect(
      draftRules(
        filled({ sign: { ...direction, directionColumn: "Direction", debitValue: "DEBIT" } }),
      ),
    ).not.toBeNull();
  });

  // A filter half-answered is not a filter. The column alone would keep only the
  // rows whose value is the empty string, which is every row of no file.
  it("ignores a filter until both its column and its value are given", () => {
    expect(
      draftRules(filled({ filter: { column: "Statut", equals: "" } }))?.rules.filter,
    ).toBeNull();
    expect(
      draftRules(filled({ filter: { column: "Statut", equals: "COMPLETE" } }))?.rules.filter,
    ).toEqual({
      column: "Statut",
      equals: "COMPLETE",
    });
  });
});

describe("the create payload a commit saves", () => {
  const accountId = 5 as AccountId;

  it("is the drafted rules, the trimmed name, and the file's own headers", () => {
    expect(draftCreate(filled({ name: "  Green-Got  " }), accountId, HEADERS)).toEqual({
      kind: "csv",
      accountId,
      name: "Green-Got",
      // The fingerprint is the header row of the file it was built from: the
      // format was authored against *this* export, so the columns it carries are
      // exactly what a later file must carry to be recognised as the same one.
      headers: HEADERS,
      mapping: filled().mapping,
      rules: draftRules(filled())?.rules,
    });
  });

  it("is nothing at all while the draft is incomplete", () => {
    expect(draftCreate(blankDraft(), accountId, HEADERS)).toBeNull();
    expect(draftCreate(filled({ name: "" }), accountId, HEADERS)).toBeNull();
  });
});

// The point of the draft being the applying half rather than a copy of it: the
// preview the user watches is parsed by the code the import runs.
describe("what a draft parses", () => {
  const ROWS = [
    { Statut: "COMPLETE", Date: "03/04/2026", Montant: "1 929,71", Intitulé: "SHOP A" },
  ];
  const ctx = { accountId: 5 as AccountId, importBatchId: "batch" };

  it("reads a day-first comma-decimal row the way the draft declares it", () => {
    const rules = draftRules(filled({ dateOrder: "day-first", decimalSeparator: "comma" }));
    if (rules === null) throw new Error("draft should be ready");

    const [parsed] = applyFormat(rules, ROWS, ctx);
    expect(parsed.record.date.toISOString()).toBe("2026-04-03T00:00:00.000Z");
    expect(parsed.record.amount).toBe(1929.71);
  });

  it("reads the same row differently when the draft says month-first and dots", () => {
    const rules = draftRules(filled({ dateOrder: "month-first", decimalSeparator: "dot" }));
    if (rules === null) throw new Error("draft should be ready");

    const [parsed] = applyFormat(rules, ROWS, ctx);
    expect(parsed.record.date.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    // `1 929,71` read with a dot decimal is `1929,71` — a number that ends at
    // the comma. This is the wrongness a live preview is there to make visible.
    expect(parsed.record.amount).toBe(1929);
  });
});
