import type { RecapTrendCategoryCell } from "@mamen/shared/contract";
import { assignColorSlots, seriesColorFor } from "./chart-palette";

/**
 * How many categories the composition chart bands before the rest fold into
 * **Other** — one under the palette's eight, so "Other" always has a slot of its
 * own and never borrows a categorical hue.
 */
export const MAX_BANDS = 7;

/** The label the folded tail wears, matching the donut's. */
export const OTHER_LABEL = "Other";
/** The key the folded tail is plotted under. */
export const OTHER_KEY = "other";

/** One band of the composition chart — a category, across every bucket. */
export type CompositionBand = {
  /** Plot key — the category id as a string, `"uncategorised"`, or `"other"`. */
  key: string;
  name: string;
  color: string;
};

/** One bucket's row, with a value per band key. */
export type CompositionDatum = {
  bucket: string;
  /** Total spending in the bucket, so a band's share is derivable. */
  total: number;
} & Record<string, number | string>;

export type CompositionSeries = {
  bands: CompositionBand[];
  data: CompositionDatum[];
};

/** The key a cell's category is plotted under. */
function keyOf(categoryId: number | null): string {
  return categoryId === null ? "uncategorised" : String(categoryId);
}

/**
 * Turn the API's `(bucket, category, spent)` cells into stacked bands over an
 * axis (issue #113).
 *
 * Which categories get their own band is decided **once, over the whole window**
 * — by total spend across every bucket, not per bucket. That matters: ranking
 * within each bucket would let a category be its own band in March and part of
 * *Other* in April, so its band would flicker in and out of the stack and no
 * band would mean one thing across the chart.
 *
 * For the same reason colour is assigned from that whole-window ranking, which
 * is stable for as long as the window is. Everything past {@link MAX_BANDS}
 * folds into one **Other** band rather than being dropped, so the stack still
 * sums to each bucket's real spending.
 *
 * `buckets` is the axis the caller is drawing — passed in rather than derived
 * from the cells, so a month with no spending at all is a genuine zero column
 * instead of a missing one.
 */
export function toCompositionSeries(
  cells: readonly RecapTrendCategoryCell[],
  buckets: readonly string[],
  nameFor: (categoryId: number | null) => string,
): CompositionSeries {
  if (cells.length === 0 || buckets.length === 0) return { bands: [], data: [] };

  // Rank categories over the WHOLE window, so a band means the same thing in
  // every column of the chart.
  const windowTotals = new Map<string, number>();
  for (const cell of cells) {
    const key = keyOf(cell.categoryId);
    windowTotals.set(key, (windowTotals.get(key) ?? 0) + cell.spent);
  }
  const ranked = [...windowTotals.entries()].sort(([, a], [, b]) => b - a).map(([key]) => key);

  const named = ranked.slice(0, MAX_BANDS);
  const isNamed = new Set(named);
  const slots = assignColorSlots(named);

  const nameByKey = new Map<string, string>();
  for (const cell of cells) {
    const key = keyOf(cell.categoryId);
    if (!nameByKey.has(key)) nameByKey.set(key, nameFor(cell.categoryId));
  }

  const bands: CompositionBand[] = named.map((key) => ({
    key,
    name: nameByKey.get(key) ?? key,
    color: seriesColorFor(slots.get(key) ?? null),
  }));
  if (ranked.length > MAX_BANDS) {
    bands.push({ key: OTHER_KEY, name: OTHER_LABEL, color: seriesColorFor(null) });
  }

  const byBucket = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    const key = keyOf(cell.categoryId);
    const plotKey = isNamed.has(key) ? key : OTHER_KEY;
    const row = byBucket.get(cell.bucket) ?? new Map<string, number>();
    row.set(plotKey, (row.get(plotKey) ?? 0) + cell.spent);
    byBucket.set(cell.bucket, row);
  }

  const data: CompositionDatum[] = buckets.map((bucket) => {
    const row = byBucket.get(bucket);
    const datum: CompositionDatum = { bucket, total: 0 };
    let total = 0;
    for (const band of bands) {
      const value = row?.get(band.key) ?? 0;
      datum[band.key] = value;
      total += value;
    }
    datum.total = total;
    return datum;
  });

  return { bands, data };
}
