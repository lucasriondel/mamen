import type { RecapTrendPoint } from "@mamen/shared/contract";
import { bucketsIn, type TrendWindow } from "./trend-window";

/** One plotted bucket of the earnings-vs-spending chart. */
export type TrendDatum = {
  /** The bucket key — `"YYYY-MM"` or `"YYYY"`. */
  bucket: string;
  /** Money in, as a positive magnitude. */
  earned: number;
  /**
   * Money out, as a **negative** number — the sign the chart plots it at, so the
   * two series diverge around a zero baseline rather than stacking above it.
   * The magnitude is `spent`; this is only its position on the axis.
   */
  spentAxis: number;
  /** Money out, as the positive magnitude every readout shows. */
  spent: number;
  /** `earned - spent` — what the period actually left over, positive or not. */
  net: number;
};

/**
 * Lay the API's points onto the window's full axis (issue #113).
 *
 * The API returns only buckets holding a counted row, because a gap in the data
 * is a real gap. An *axis* must not have gaps, though: a chart that omits an
 * empty March draws February beside April as if they were adjacent, which reads
 * as "no such month" rather than "nothing happened that month". So every bucket
 * the window spans is emitted, and the ones with no data are the zeroes they
 * genuinely are.
 *
 * The all-time window has no bounds to enumerate, so it falls back to the
 * buckets the data itself carries — there is no meaningful "first year" to start
 * an axis at beyond the first year the user has records for.
 */
export function toTrendSeries(
  points: readonly RecapTrendPoint[],
  window: TrendWindow,
): TrendDatum[] {
  const byBucket = new Map(points.map((point) => [point.bucket, point]));
  const axis = bucketsIn(window);
  const keys = axis.length > 0 ? axis : points.map((point) => point.bucket);

  return keys.map((bucket) => {
    const point = byBucket.get(bucket);
    const earned = point?.earned ?? 0;
    const spent = point?.spent ?? 0;
    return { bucket, earned, spent, spentAxis: -spent, net: earned - spent };
  });
}

/** Totals across a plotted series — the figures the chart's header states. */
export type TrendTotals = { earned: number; spent: number; net: number };

/** Sum a series into the totals shown beside the chart title. */
export function sumTrend(series: readonly TrendDatum[]): TrendTotals {
  const earned = series.reduce((sum, d) => sum + d.earned, 0);
  const spent = series.reduce((sum, d) => sum + d.spent, 0);
  return { earned, spent, net: earned - spent };
}
