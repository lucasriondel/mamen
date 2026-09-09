import { describe, expect, it } from "vitest";
import type { SpendRow } from "../spend-rows";
import { MAX_NAMED_SLICES, OTHER_LABEL, toDonutSlices } from "./donut-slices";

const row = (over: Partial<SpendRow> & { spent: number }): SpendRow => ({
  id: 1,
  name: "Bucket",
  count: 1,
  ...over,
});

describe("toDonutSlices", () => {
  it("keeps every bucket when there are no more than the named cap", () => {
    const slices = toDonutSlices([
      row({ id: 1, name: "Rent", spent: 600 }),
      row({ id: 2, name: "Food", spent: 400 }),
    ]);

    expect(slices.map((s) => s.name)).toEqual(["Rent", "Food"]);
    expect(slices.map((s) => s.share)).toEqual([0.6, 0.4]);
  });

  it("ranks by magnitude even when the caller's sort says otherwise", () => {
    // The list beside the chart may be sorted alphabetically; the ring must
    // still open with its biggest arc.
    const slices = toDonutSlices([
      row({ id: 1, name: "Apples", spent: 10 }),
      row({ id: 2, name: "Zebras", spent: 90 }),
    ]);

    expect(slices.map((s) => s.name)).toEqual(["Zebras", "Apples"]);
  });

  it("folds the tail into one Other arc rather than dropping it", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ id: i + 1, name: `B${i + 1}`, spent: 100 - i, count: 2 }),
    );

    const slices = toDonutSlices(rows);

    expect(slices).toHaveLength(MAX_NAMED_SLICES + 1);
    const other = slices.at(-1);
    expect(other?.name).toBe(OTHER_LABEL);
    // The four folded buckets: 95 + 94 + 93 + 92, and their counts.
    expect(other?.value).toBe(95 + 94 + 93 + 92);
    expect(other?.count).toBe(8);
    // Other stands for several buckets, so it has no single row to open.
    expect(other?.row).toBeUndefined();
  });

  it("keeps the arcs summing to the whole period, tail included", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: i + 1, name: `B${i + 1}`, spent: (i + 1) * 3 }),
    );

    const slices = toDonutSlices(rows);

    const total = rows.reduce((sum, r) => sum + r.spent, 0);
    expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(total);
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it("gives each named arc a distinct colour and the tail the neutral", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ id: i + 1, name: `B${i + 1}`, spent: 70 - i }),
    );

    const slices = toDonutSlices(rows);

    const named = slices.slice(0, MAX_NAMED_SLICES).map((s) => s.color);
    expect(new Set(named).size).toBe(MAX_NAMED_SLICES);
    expect(slices.at(-1)?.color).toBe("var(--chart-other)");
  });

  it("carries the unassigned bucket rather than hiding it", () => {
    const slices = toDonutSlices([
      row({ id: null, name: "Unassigned", spent: 500 }),
      row({ id: 2, name: "Food", spent: 100 }),
    ]);

    expect(slices[0]?.key).toBe("unassigned");
    expect(slices[0]?.name).toBe("Unassigned");
  });

  it("returns nothing for a period with no spending", () => {
    expect(toDonutSlices([])).toEqual([]);
    expect(toDonutSlices([row({ spent: 0 })])).toEqual([]);
  });
});
