import { describe, expect, it } from "vitest";
import { inferDateOrder } from "./infer-date-order";

/**
 * Value-level inference for the **Date order** field (PRD #180's first
 * unguessable rule, now guessed at only where the file actually proves it).
 *
 * Driven with the values a real statement column holds, because that is the
 * whole input: the function never sees a header name, so there is nothing else
 * to construct.
 */

describe("inferDateOrder", () => {
  it("reads a leading four-digit year as ISO", () => {
    expect(inferDateOrder(["2026-04-03", "2026-04-17", "2026-05-02"])).toEqual({
      outcome: "inferred",
      order: "iso",
    });
  });

  it("reads a full ISO instant as ISO — the time does not disqualify it", () => {
    expect(inferDateOrder(["2026-01-31T23:30:00.000Z", "2026-02-01T08:00:00.000Z"])).toEqual({
      outcome: "inferred",
      order: "iso",
    });
  });

  it("proves day-first from a first part above twelve", () => {
    expect(inferDateOrder(["03/04/2026", "23/04/2026", "01/05/2026"])).toEqual({
      outcome: "inferred",
      order: "day-first",
    });
  });

  it("proves month-first from a second part above twelve", () => {
    expect(inferDateOrder(["04/03/2026", "04/23/2026", "05/01/2026"])).toEqual({
      outcome: "inferred",
      order: "month-first",
    });
  });

  it("reads any single non-digit between the parts", () => {
    expect(inferDateOrder(["23.04.2026", "01.05.2026"])).toEqual({
      outcome: "inferred",
      order: "day-first",
    });
    expect(inferDateOrder(["23-04-2026"])).toEqual({ outcome: "inferred", order: "day-first" });
  });

  it("concludes from a single unambiguous value", () => {
    expect(inferDateOrder(["31/12/2026"])).toEqual({ outcome: "inferred", order: "day-first" });
  });

  it("reads one-digit parts", () => {
    expect(inferDateOrder(["3/4/2026", "23/4/2026"])).toEqual({
      outcome: "inferred",
      order: "day-first",
    });
  });

  // The case the whole two-arm result exists for.
  it("refuses to guess when no value ever exceeds twelve", () => {
    expect(inferDateOrder(["01/02/2026", "03/04/2026", "05/06/2026"])).toEqual({
      outcome: "ambiguous",
    });
  });

  it("refuses to guess from a single ambiguous value", () => {
    expect(inferDateOrder(["01/02/2026"])).toEqual({ outcome: "ambiguous" });
  });

  // Cross-checked whole: the first row does not get to win.
  it("refuses to guess when the sample contradicts itself", () => {
    expect(inferDateOrder(["23/04/2026", "04/23/2026"])).toEqual({ outcome: "ambiguous" });
  });

  it("refuses to guess from an empty sample", () => {
    expect(inferDateOrder([])).toEqual({ outcome: "ambiguous" });
  });

  it("refuses to guess when every value is blank", () => {
    expect(inferDateOrder(["", "   ", ""])).toEqual({ outcome: "ambiguous" });
  });

  it("ignores blank rows among readable ones", () => {
    expect(inferDateOrder(["", "23/04/2026", "  "])).toEqual({
      outcome: "inferred",
      order: "day-first",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(inferDateOrder([" 23/04/2026 "])).toEqual({ outcome: "inferred", order: "day-first" });
  });

  it("refuses to guess from a column that is not dates", () => {
    expect(inferDateOrder(["CARREFOUR", "SNCF", "-12,50"])).toEqual({ outcome: "ambiguous" });
  });

  // A two-digit year is not the shape the parser reads, so it is not the shape
  // inference concludes from either.
  it("refuses to guess from a two-digit year", () => {
    expect(inferDateOrder(["23/04/26", "01/05/26"])).toEqual({ outcome: "ambiguous" });
  });

  it("ignores a part above thirty-one, which is neither a day nor a month", () => {
    expect(inferDateOrder(["45/04/2026"])).toEqual({ outcome: "ambiguous" });
  });

  it("ignores unreadable rows and concludes from the readable ones", () => {
    expect(inferDateOrder(["n/a", "23/04/2026", "pending"])).toEqual({
      outcome: "inferred",
      order: "day-first",
    });
  });
});
