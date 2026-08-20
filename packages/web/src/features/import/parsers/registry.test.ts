import { describe, expect, it } from "vitest";
import type { StatementFormat } from "./format";
import { greenGotFormat } from "./formats";
import { detectFormat, FORMATS, getFormatById, matchesHeaders } from "./registry";

const GREEN_GOT_HEADERS = [
  "N° transaction",
  "Statut",
  "Date",
  "Montant",
  "Arrondi",
  "Direction",
  "Devise",
  "Intitulé",
];

describe("the format registry", () => {
  it("carries the Green-Got format", () => {
    expect(FORMATS).toContain(greenGotFormat);
    expect(getFormatById("green-got")).toBe(greenGotFormat);
  });

  it("auto-detects Green-Got by its header fingerprint", () => {
    expect(detectFormat(GREEN_GOT_HEADERS)).toBe(greenGotFormat);
  });

  it("returns null on zero matches so the user picks manually", () => {
    expect(detectFormat(["Date", "Description", "Amount"])).toBeNull();
  });

  it("returns undefined for an unknown format id", () => {
    expect(getFormatById("nope")).toBeUndefined();
  });

  it("holds only formats of the CSV kind — a PDF format carries no fingerprint", () => {
    expect(FORMATS.every((format) => format.kind === "csv")).toBe(true);
  });
});

describe("detection over a given set of formats", () => {
  // The candidate list is a parameter so the ambiguous arm can be reached at
  // all: with one format registered, "several matched" is unconstructible
  // through the module-level `FORMATS`, and it is the arm the picker exists
  // for. It is also the shape the next ticket needs, where the candidates are
  // one account's formats rather than every format there is.
  const base: StatementFormat = { ...greenGotFormat, headers: ["Date", "Montant"] };
  const alsoMatches: StatementFormat = { ...base, id: "other", name: "Other" };

  it("returns the sole match", () => {
    expect(detectFormat(["Date", "Montant", "Extra"], [base])).toBe(base);
  });

  it("returns null when several formats match, so the user picks", () => {
    expect(detectFormat(["Date", "Montant"], [base, alsoMatches])).toBeNull();
  });

  it("returns null when none match", () => {
    expect(detectFormat(["Date", "Montant"], [])).toBeNull();
  });

  it("defaults to the registered formats", () => {
    expect(detectFormat(GREEN_GOT_HEADERS)).toBe(greenGotFormat);
  });
});

describe("the header fingerprint", () => {
  const format: StatementFormat = {
    ...greenGotFormat,
    id: "test",
    name: "Test",
    headers: ["Date", "Montant"],
  };

  it("matches a file carrying more columns than the format names", () => {
    // The fingerprint identifies the file; it is not the file's column set. The
    // rest is archive, so a bank adding a column does not stop matching.
    expect(matchesHeaders(format, ["Date", "Montant", "Something new"])).toBe(true);
  });

  it("does not match a file missing one of them", () => {
    expect(matchesHeaders(format, ["Date"])).toBe(false);
  });

  it("does not match a foreign header set", () => {
    expect(matchesHeaders(greenGotFormat, ["Date", "Description", "Amount", "Balance"])).toBe(
      false,
    );
  });
});
