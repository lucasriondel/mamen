import { describe, expect, it } from "vitest";
import { DEFAULT_SPEND_SORT, nextSpendSort, type SpendSort, sortSpendRows } from "./recap-sort";
import type { SpendRow } from "./spend-rows";

function row(name: string, spent: number, id: number | null = null): SpendRow {
  return { id, name, spent, count: 1 };
}

const names = (rows: readonly SpendRow[]) => rows.map((r) => r.name);

describe("sortSpendRows", () => {
  const amazon = row("Amazon", 50);
  const netflix = row("netflix", 20);
  const zando = row("Zando", 20);

  it("defaults to spent, high→low", () => {
    const out = sortSpendRows([netflix, amazon, zando], DEFAULT_SPEND_SORT);
    expect(names(out)).toEqual(["Amazon", "netflix", "Zando"]);
  });

  it("breaks equal-spend ties by name A→Z, even descending", () => {
    const out = sortSpendRows([zando, netflix], {
      key: "spent",
      direction: "desc",
    });
    // Both 20 → tiebreak is name A→Z (case-insensitive), unaffected by direction.
    expect(names(out)).toEqual(["netflix", "Zando"]);
  });

  it("sorts spent ascending", () => {
    const out = sortSpendRows([amazon, netflix, zando], {
      key: "spent",
      direction: "asc",
    });
    expect(names(out)).toEqual(["netflix", "Zando", "Amazon"]);
  });

  it("sorts by name, case-insensitively", () => {
    const out = sortSpendRows([zando, amazon, netflix], {
      key: "name",
      direction: "asc",
    });
    expect(names(out)).toEqual(["Amazon", "netflix", "Zando"]);
  });

  it("does not mutate its input", () => {
    const input = [netflix, amazon];
    sortSpendRows(input, DEFAULT_SPEND_SORT);
    expect(input).toEqual([netflix, amazon]);
  });
});

describe("nextSpendSort", () => {
  const start: SpendSort = { key: "spent", direction: "desc" };

  it("flips direction when the active key is re-selected", () => {
    expect(nextSpendSort(start, "spent")).toEqual({
      key: "spent",
      direction: "asc",
    });
  });

  it("adopts a new key's default direction", () => {
    expect(nextSpendSort(start, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });
});
