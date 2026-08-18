import type { RecapTrendCategoryCell } from "@mamen/shared/contract";

/**
 * How many movers the delta chart shows per direction (up and down).
 *
 * Four, not a dozen. Two reasons, and the second is the real one:
 *
 * - a "what changed" list is read top-down and acted on from the top, so a long
 *   tail of one-euro movements is scrolling, not information;
 * - the bars share one **symmetric linear** scale, so a row is only visible in
 *   proportion to the biggest mover on screen. Against a €1,700 swing a €7 one
 *   is a third of a pixel — present in the data, invisible on the axis. Cutting
 *   the tail keeps every row the chart *does* draw legible, rather than
 *   pretending to show movements no reader can see.
 *
 * The rows that fall outside the cut are not hidden information: the by-category
 * list below carries every bucket's exact figure.
 */
export const MAX_MOVERS = 4;

/** One category's change between the last two buckets of the window. */
export type CategoryDelta = {
  key: string;
  name: string;
  /** Spending in the latest bucket. */
  current: number;
  /** Spending in the bucket before it. */
  previous: number;
  /** `current - previous` — positive means *more* was spent. */
  delta: number;
};

export type DeltaComparison = {
  /** The bucket being judged, and the one it is judged against. */
  current: string;
  previous: string;
  /** The movers, biggest absolute change first. */
  deltas: CategoryDelta[];
};

function keyOf(categoryId: number | null): string {
  return categoryId === null ? "uncategorised" : String(categoryId);
}

/**
 * What changed between the window's last two buckets (issue #113).
 *
 * The question the other three charts leave unanswered. A donut says what a
 * period was made of, a trend says whether it was more than the last one, a
 * composition says how the mix drifted — none of them says *which category* is
 * responsible for this month costing more, which is the one thing a reader can
 * act on.
 *
 * The comparison is always the **last two buckets on the axis**, not an
 * arbitrary pair: it is the change the reader is standing in. A category present
 * in only one of the two still appears — a new subscription and a cancelled one
 * are precisely the movements worth surfacing, and treating a missing bucket as
 * absent rather than as zero would hide both.
 *
 * Only the biggest {@link MAX_MOVERS} in each direction are returned. A month
 * touches dozens of categories and nearly all of them move by a euro or two;
 * showing every one buries the three that matter.
 */
export function toCategoryDeltas(
  cells: readonly RecapTrendCategoryCell[],
  buckets: readonly string[],
  nameFor: (categoryId: number | null) => string,
): DeltaComparison | null {
  if (buckets.length < 2) return null;

  const current = buckets[buckets.length - 1] as string;
  const previous = buckets[buckets.length - 2] as string;

  const currentBy = new Map<string, number>();
  const previousBy = new Map<string, number>();
  const nameByKey = new Map<string, string>();

  for (const cell of cells) {
    if (cell.bucket !== current && cell.bucket !== previous) continue;
    const key = keyOf(cell.categoryId);
    if (!nameByKey.has(key)) nameByKey.set(key, nameFor(cell.categoryId));
    const target = cell.bucket === current ? currentBy : previousBy;
    target.set(key, (target.get(key) ?? 0) + cell.spent);
  }

  const keys = new Set([...currentBy.keys(), ...previousBy.keys()]);
  const all: CategoryDelta[] = [...keys].map((key) => {
    // A category absent from a bucket spent zero there — it did not "not exist".
    const now = currentBy.get(key) ?? 0;
    const before = previousBy.get(key) ?? 0;
    return {
      key,
      name: nameByKey.get(key) ?? key,
      current: now,
      previous: before,
      delta: now - before,
    };
  });

  const moved = all.filter((d) => d.delta !== 0);
  const up = moved
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, MAX_MOVERS);
  const down = moved
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MAX_MOVERS);

  // Biggest absolute movement first, whichever way it went — the chart is read
  // top-down as "what moved most".
  const deltas = [...up, ...down].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return deltas.length === 0 ? null : { current, previous, deltas };
}
