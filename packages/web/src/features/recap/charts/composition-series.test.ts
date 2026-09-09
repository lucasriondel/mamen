import type { RecapTrendCategoryCell } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { MAX_BANDS, OTHER_KEY, OTHER_LABEL, toCompositionSeries } from "./composition-series";

const cell = (
  bucket: string,
  categoryId: number | null,
  spent: number,
): RecapTrendCategoryCell => ({ bucket, categoryId, spent });

const nameFor = (id: number | null) => (id === null ? "Uncategorised" : `Cat ${id}`);

describe("toCompositionSeries", () => {
  it("bands each category across the given axis", () => {
    const { bands, data } = toCompositionSeries(
      [cell("2026-01", 1, 10), cell("2026-02", 1, 20), cell("2026-02", 2, 5)],
      ["2026-01", "2026-02"],
      nameFor,
    );

    expect(bands.map((b) => b.name)).toEqual(["Cat 1", "Cat 2"]);
    expect(data[0]).toMatchObject({ bucket: "2026-01", "1": 10, "2": 0, total: 10 });
    expect(data[1]).toMatchObject({ bucket: "2026-02", "1": 20, "2": 5, total: 25 });
  });

  it("emits a zero column for a bucket with no spending", () => {
    // The axis is what the caller is drawing, not what the data happens to hold.
    const { data } = toCompositionSeries(
      [cell("2026-01", 1, 10)],
      ["2026-01", "2026-02", "2026-03"],
      nameFor,
    );

    expect(data).toHaveLength(3);
    expect(data[1]).toMatchObject({ bucket: "2026-02", "1": 0, total: 0 });
  });

  it("ranks bands over the whole window, not per bucket", () => {
    // Cat 2 wins the first bucket but Cat 1 wins the window; the band order
    // must not flip between columns.
    const { bands } = toCompositionSeries(
      [cell("2026-01", 2, 50), cell("2026-01", 1, 10), cell("2026-02", 1, 900)],
      ["2026-01", "2026-02"],
      nameFor,
    );

    expect(bands.map((b) => b.name)).toEqual(["Cat 1", "Cat 2"]);
  });

  it("folds the tail into one Other band, keeping the columns whole", () => {
    const cells = Array.from({ length: MAX_BANDS + 3 }, (_, i) => cell("2026-01", i + 1, 100 - i));

    const { bands, data } = toCompositionSeries(cells, ["2026-01"], nameFor);

    expect(bands).toHaveLength(MAX_BANDS + 1);
    expect(bands.at(-1)?.name).toBe(OTHER_LABEL);
    // The folded three, still counted.
    expect(data[0]?.[OTHER_KEY]).toBe(93 + 92 + 91);
    // And the column still sums to the real total.
    const expected = cells.reduce((sum, c) => sum + c.spent, 0);
    expect(data[0]?.total).toBe(expected);
  });

  it("gives every named band a distinct colour and Other the neutral", () => {
    const cells = Array.from({ length: MAX_BANDS + 2 }, (_, i) => cell("2026-01", i + 1, 100 - i));

    const { bands } = toCompositionSeries(cells, ["2026-01"], nameFor);

    const named = bands.slice(0, MAX_BANDS).map((b) => b.color);
    expect(new Set(named).size).toBe(MAX_BANDS);
    expect(bands.at(-1)?.color).toBe("var(--chart-other)");
  });

  it("names the uncategorised band rather than dropping it", () => {
    const { bands, data } = toCompositionSeries([cell("2026-01", null, 40)], ["2026-01"], nameFor);

    expect(bands[0]).toMatchObject({ key: "uncategorised", name: "Uncategorised" });
    expect(data[0]?.uncategorised).toBe(40);
  });

  it("returns nothing when there is no spending to compose", () => {
    expect(toCompositionSeries([], ["2026-01"], nameFor)).toEqual({ bands: [], data: [] });
  });
});
