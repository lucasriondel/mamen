import type { SpendRow } from "./spend-rows";

/**
 * How a recap spend section can be ordered (issue #35):
 * - `spent` — by total money spent (the point of the page), high→low by default.
 * - `name` — alphabetical by bucket name.
 */
export type SpendSortKey = "spent" | "name";

/** Ascending or descending; both keys support both. */
export type SortDirection = "asc" | "desc";

export type SpendSort = {
  key: SpendSortKey;
  direction: SortDirection;
};

/** Sections open ranked by spend, biggest first — the review-your-spending default. */
export const DEFAULT_SPEND_SORT: SpendSort = {
  key: "spent",
  direction: "desc",
};

/**
 * The direction a key starts in when first selected: `spent` opens high→low so
 * the biggest expenses surface first; names read A→Z. Re-selecting the active
 * key toggles from here.
 */
export const DEFAULT_DIRECTION: Record<SpendSortKey, SortDirection> = {
  spent: "desc",
  name: "asc",
};

/**
 * The sort produced by clicking a key's control (issue #35): selecting a new key
 * adopts that key's default direction; clicking the already-active key flips it.
 * Mirrors the issuers grid's `nextIssuerSort` so the two controls behave alike.
 */
export function nextSpendSort(current: SpendSort, key: SpendSortKey): SpendSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: DEFAULT_DIRECTION[key] };
}

/** The A→Z tiebreaker every key falls back to — locale-aware, case-insensitive. */
const byName = (a: SpendRow, b: SpendRow) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Order spend rows by the chosen key + direction (issue #35). Returns a new
 * array; the input is not mutated. Alphabetical uses a locale-aware, case-
 * insensitive compare; the `spent` key breaks ties by name (A→Z) so equal-value
 * buckets keep a stable, readable order regardless of direction.
 */
export function sortSpendRows(rows: readonly SpendRow[], sort: SpendSort): SpendRow[] {
  const sign = sort.direction === "desc" ? -1 : 1;

  const compare = (a: SpendRow, b: SpendRow): number => {
    switch (sort.key) {
      case "name":
        return sign * byName(a, b);
      case "spent":
        return sign * (a.spent - b.spent) || byName(a, b);
    }
  };

  return [...rows].sort(compare);
}
