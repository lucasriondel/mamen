import type { RecapTrendCategoryCell } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { MAX_MOVERS, toCategoryDeltas } from "./category-deltas";

const cell = (
  bucket: string,
  categoryId: number | null,
  spent: number,
): RecapTrendCategoryCell => ({ bucket, categoryId, spent });

const nameFor = (id: number | null) => (id === null ? "Uncategorised" : `Cat ${id}`);

describe("toCategoryDeltas", () => {
  it("compares the last two buckets of the axis", () => {
    const result = toCategoryDeltas(
      [
        cell("2026-05", 1, 999), // an older bucket, not part of the comparison
        cell("2026-06", 1, 100),
        cell("2026-07", 1, 130),
      ],
      ["2026-05", "2026-06", "2026-07"],
      nameFor,
    );

    expect(result?.current).toBe("2026-07");
    expect(result?.previous).toBe("2026-06");
    expect(result?.deltas[0]).toMatchObject({
      name: "Cat 1",
      current: 130,
      previous: 100,
      delta: 30,
    });
  });

  it("treats a category missing from one bucket as zero, not absent", () => {
    // A new subscription and a cancelled one are the movements worth surfacing.
    const result = toCategoryDeltas(
      [cell("2026-06", 1, 40), cell("2026-07", 2, 25)],
      ["2026-06", "2026-07"],
      nameFor,
    );

    const byName = Object.fromEntries((result?.deltas ?? []).map((d) => [d.name, d]));
    expect(byName["Cat 1"]).toMatchObject({ current: 0, previous: 40, delta: -40 });
    expect(byName["Cat 2"]).toMatchObject({ current: 25, previous: 0, delta: 25 });
  });

  it("orders by absolute movement, either direction", () => {
    const result = toCategoryDeltas(
      [
        cell("2026-06", 1, 10),
        cell("2026-07", 1, 20), // +10
        cell("2026-06", 2, 100),
        cell("2026-07", 2, 20), // -80
        cell("2026-06", 3, 5),
        cell("2026-07", 3, 35), // +30
      ],
      ["2026-06", "2026-07"],
      nameFor,
    );

    expect(result?.deltas.map((d) => d.delta)).toEqual([-80, 30, 10]);
  });

  it("caps each direction so the real movers are not buried", () => {
    const cells: RecapTrendCategoryCell[] = [];
    // 8 risers and 8 fallers — more than the cap allows in either direction.
    for (let i = 1; i <= 8; i += 1) {
      cells.push(cell("2026-06", i, 0), cell("2026-07", i, i * 10));
      cells.push(cell("2026-06", 100 + i, i * 10), cell("2026-07", 100 + i, 0));
    }

    const result = toCategoryDeltas(cells, ["2026-06", "2026-07"], nameFor);

    const up = result?.deltas.filter((d) => d.delta > 0) ?? [];
    const down = result?.deltas.filter((d) => d.delta < 0) ?? [];
    expect(up).toHaveLength(MAX_MOVERS);
    expect(down).toHaveLength(MAX_MOVERS);
  });

  it("ignores categories that did not move", () => {
    const result = toCategoryDeltas(
      [cell("2026-06", 1, 50), cell("2026-07", 1, 50), cell("2026-07", 2, 5)],
      ["2026-06", "2026-07"],
      nameFor,
    );

    expect(result?.deltas.map((d) => d.name)).toEqual(["Cat 2"]);
  });

  it("has nothing to compare with fewer than two buckets", () => {
    expect(toCategoryDeltas([cell("2026-07", 1, 10)], ["2026-07"], nameFor)).toBeNull();
  });

  it("returns null when nothing moved at all", () => {
    const result = toCategoryDeltas(
      [cell("2026-06", 1, 50), cell("2026-07", 1, 50)],
      ["2026-06", "2026-07"],
      nameFor,
    );

    expect(result).toBeNull();
  });
});
