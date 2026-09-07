import { describe, expect, it } from "vitest";
import { inferDecimalSeparator } from "./infer-decimal-separator";

/**
 * Value-level inference for the **Decimal separator** field (PRD #180's second
 * unguessable rule).
 *
 * The trap under test throughout is the thousands separator: `1,234.56` and
 * `1.234,56` are the same number written by two banks, and `1,234` on its own is
 * the value that reads one way alone and the other way in company.
 */

describe("inferDecimalSeparator", () => {
  it("reads a decimal comma", () => {
    expect(inferDecimalSeparator(["1234,56", "-12,50", "0,99"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("reads a decimal dot", () => {
    expect(inferDecimalSeparator(["1234.56", "-12.50", "0.99"])).toEqual({
      outcome: "inferred",
      separator: "dot",
    });
  });

  it("reads a decimal comma through a spaced thousands group", () => {
    expect(inferDecimalSeparator(["1 234,56", "1 929,71"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("reads a decimal comma through a non-breaking space", () => {
    expect(inferDecimalSeparator(["1 234,56", "12 345,00"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("reads a decimal dot through an apostrophe thousands group", () => {
    expect(inferDecimalSeparator(["1'234.56"])).toEqual({ outcome: "inferred", separator: "dot" });
  });

  // Both marks present: the last one is the decimal mark, whichever it is.
  it("resolves a thousands comma beside a decimal dot", () => {
    expect(inferDecimalSeparator(["1,234.56", "12,345.00"])).toEqual({
      outcome: "inferred",
      separator: "dot",
    });
  });

  it("resolves a thousands dot beside a decimal comma", () => {
    expect(inferDecimalSeparator(["1.234,56", "12.345,00"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  // The trap. `1,234` alone is a thousands group, so it is evidence for the dot.
  it("reads a lone three-digit group as thousands, voting for the other mark", () => {
    expect(inferDecimalSeparator(["1,234", "12,345"])).toEqual({
      outcome: "inferred",
      separator: "dot",
    });
  });

  it("cross-checks a thousands comma against the rest of the sample", () => {
    expect(inferDecimalSeparator(["1,234", "9,876.54"])).toEqual({
      outcome: "inferred",
      separator: "dot",
    });
  });

  it("reads a repeated mark as grouping, voting for the other mark", () => {
    expect(inferDecimalSeparator(["1.234.567"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("strips currency symbols and signs before reading", () => {
    expect(inferDecimalSeparator(["-12,50 €", "+1 340,00 €"])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("refuses to guess from bare integers", () => {
    expect(inferDecimalSeparator(["1234", "-50", "0"])).toEqual({ outcome: "ambiguous" });
  });

  it("refuses to guess from an empty sample", () => {
    expect(inferDecimalSeparator([])).toEqual({ outcome: "ambiguous" });
  });

  it("refuses to guess when every value is blank", () => {
    expect(inferDecimalSeparator(["", "  "])).toEqual({ outcome: "ambiguous" });
  });

  // Unanimity required: a majority would be silently wrong on the rows it outvoted.
  it("refuses to guess when the sample contradicts itself", () => {
    expect(inferDecimalSeparator(["1234,56", "1234.56"])).toEqual({ outcome: "ambiguous" });
  });

  it("refuses to guess from a column that is not amounts", () => {
    expect(inferDecimalSeparator(["CARREFOUR", "SNCF"])).toEqual({ outcome: "ambiguous" });
  });

  it("ignores blank rows among readable ones", () => {
    expect(inferDecimalSeparator(["", "12,50", "  "])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });

  it("reads the blank half of a debit/credit pair as saying nothing", () => {
    expect(inferDecimalSeparator(["", "", "42,00", ""])).toEqual({
      outcome: "inferred",
      separator: "comma",
    });
  });
});
