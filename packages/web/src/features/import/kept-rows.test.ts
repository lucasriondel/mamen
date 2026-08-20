import { describe, expect, it } from "vitest";
import { keptPositions } from "./kept-rows";
import type { RowId } from "./wizard-reducer";

const ids = (...values: number[]) => values as RowId[];
const skipped = (...values: number[]) => new Set(values as RowId[]);

/**
 * The one question both preview paths ask of a **skipped row** decision since
 * issue #192, so it is asked in one place. Stated as positions because the
 * callers read more than one list off the answer — the records to commit and the
 * **already imported** flags to count.
 */
describe("keptPositions", () => {
  it("keeps every row when nothing is skipped", () => {
    expect(keptPositions(ids(1, 2, 3), skipped())).toEqual([0, 1, 2]);
  });

  it("drops the position of each skipped id", () => {
    expect(keptPositions(ids(1, 2, 3), skipped(2))).toEqual([0, 2]);
  });

  it("keeps nothing when every row is skipped", () => {
    expect(keptPositions(ids(1, 2), skipped(1, 2))).toEqual([]);
  });

  // The point of the ids: a skip names a row, so the position it comes out at
  // follows the row rather than the click.
  it("names the same row after one is inserted above it", () => {
    expect(keptPositions(ids(9, 1, 2), skipped(2))).toEqual([0, 1]);
  });

  // A skip cannot be minted for a row that was never on screen, so an id from
  // nowhere holds nothing out — the app never drops a row on its own judgement.
  it("keeps every row when a skip names an id no row carries", () => {
    expect(keptPositions(ids(1, 2), skipped(7))).toEqual([0, 1]);
  });

  it("keeps nothing when there are no rows", () => {
    expect(keptPositions(ids(), skipped(1))).toEqual([]);
  });
});
