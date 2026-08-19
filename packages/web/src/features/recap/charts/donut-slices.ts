import type { SpendRow } from "../spend-rows";
import { assignColorSlots, seriesColorFor } from "./chart-palette";

/**
 * How many named slices a donut shows before the rest fold into **Other**.
 *
 * Six, because a part-to-whole read only survives at a glance up to about that
 * many segments: past it the slices get thinner than their own labels, adjacent
 * hues blur, and the reader is doing arc-length arithmetic they would do better
 * from the sorted list beside the chart. Five named + Other keeps the ranking
 * legible and the total honest.
 *
 * The tail is **folded, never dropped**: the arcs still sum to the period's whole
 * spend, so the donut cannot quietly disagree with the section total above it.
 */
export const MAX_NAMED_SLICES = 5;

/** The label the folded tail wears. */
export const OTHER_LABEL = "Other";

/** One arc of a recap donut. */
export type DonutSlice = {
  /** Stable key for React lists — the entity id, `"unassigned"`, or `"other"`. */
  key: string;
  /** What the legend and the tooltip call this arc. */
  name: string;
  /** The arc's magnitude — a positive number of euros. */
  value: number;
  /** Share of the period's total, `0`–`1`. Precomputed so no consumer re-divides. */
  share: number;
  /** How many transactions the arc stands for. */
  count: number;
  /** The CSS colour the arc is painted in — a `var(--chart-*)` role. */
  color: string;
  /**
   * The row this arc came from, when it is a single bucket — carried so the arc
   * can link to the same detail page its list row does. `undefined` on **Other**,
   * which stands for several buckets and therefore has no one page to open.
   */
  row?: SpendRow;
};

/** The key a row is plotted under — its id, or the unassigned bucket's label. */
function keyOf(row: SpendRow): string {
  return row.id === null ? "unassigned" : String(row.id);
}

/**
 * Fold a section's rows into at most {@link MAX_NAMED_SLICES} named arcs plus an
 * **Other** arc (issue #113).
 *
 * `rows` arrive **already sorted by the caller's chosen sort**, but the donut
 * ranks by magnitude regardless: an alphabetical sort on the list beside it must
 * not make the biggest slice the sixth one, since a part-to-whole chart whose
 * arcs are not ordered by size is unreadable. So the rows are re-ranked here by
 * `spent`, and the caller's sort is left to govern only the list.
 *
 * Colour is assigned from the **magnitude ranking**, not from the caller's sort,
 * for the same reason and one more: it is the one ordering that does not change
 * when the user re-sorts the list, so re-sorting cannot repaint the chart.
 *
 * A period with no spending yields no slices — the caller shows an empty state
 * rather than a zero-radius ring.
 */
export function toDonutSlices(rows: readonly SpendRow[]): DonutSlice[] {
  const spending = rows.filter((row) => row.spent > 0);
  if (spending.length === 0) return [];

  const ranked = [...spending].sort((a, b) => b.spent - a.spent);
  const total = ranked.reduce((sum, row) => sum + row.spent, 0);
  if (total <= 0) return [];

  const named = ranked.slice(0, MAX_NAMED_SLICES);
  const tail = ranked.slice(MAX_NAMED_SLICES);

  const slots = assignColorSlots(named.map(keyOf));

  const slices: DonutSlice[] = named.map((row) => {
    const key = keyOf(row);
    return {
      key,
      name: row.name,
      value: row.spent,
      share: row.spent / total,
      count: row.count,
      color: seriesColorFor(slots.get(key) ?? null),
      row,
    };
  });

  // The tail becomes one arc rather than vanishing: dropping it would make the
  // ring sum to less than the total the section header states.
  if (tail.length > 0) {
    const value = tail.reduce((sum, row) => sum + row.spent, 0);
    slices.push({
      key: "other",
      name: OTHER_LABEL,
      value,
      share: value / total,
      count: tail.reduce((sum, row) => sum + row.count, 0),
      color: seriesColorFor(null),
    });
  }

  return slices;
}
