import type { RecapTrendGranularity } from "@mamen/shared/contract";
import type { RecapTrendParams } from "@/lib/sdk";
import type { Period } from "../period";

/** The window a trend chart is drawn over, and the grain it is bucketed at. */
export type TrendWindow = {
  granularity: RecapTrendGranularity;
  /** Inclusive lower bound on the transaction date, or `undefined` for unbounded. */
  startDate?: Date;
  /** Inclusive upper bound, or `undefined`. */
  endDate?: Date;
  /** What the chart calls the span it is showing. */
  label: string;
};

/**
 * How many months of context a **month** period's trend shows.
 *
 * A single month is one bar, and one bar is not a trend — it answers "how much"
 * (which the totals above already say) rather than "compared to when", which is
 * the only question a time axis exists for. So a month period widens to the
 * trailing year *ending* at that month: the chart then puts the month the user
 * selected in the context of the eleven before it, which is the comparison they
 * came for. The recap's own totals stay scoped to the selected month — only the
 * chart widens, and it says so in its subtitle.
 */
export const TRAILING_MONTHS = 12;

/** Zero-pad to two chars, as the `YYYY-MM` keys are written. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The window and grain a {@link Period} is charted over (issue #113).
 *
 * The three periods ask three different questions of a time axis:
 *
 * - **month** → the trailing {@link TRAILING_MONTHS} months, by month. One bar
 *   is not a trend, so the window widens for context (see above).
 * - **year** → that calendar year, by month. Twelve bars — the year's shape.
 * - **all** → everything, by **year**. Bucketing all time by month would put
 *   hundreds of bars on an axis a few hundred pixels wide; years is the grain
 *   that fits and the one the question ("how have I been doing overall?") is
 *   actually asked at.
 *
 * Bounds are built in UTC to match the wire `date`, exactly as `periodToFilter`
 * does — a trend and the totals beside it must agree about which day a row is in.
 */
export function toTrendWindow(period: Period): TrendWindow {
  switch (period.kind) {
    case "month": {
      const year = Number(period.month.slice(0, 4));
      const month = Number(period.month.slice(5, 7)); // 1-based, as the key writes it
      // `TRAILING_MONTHS - 1` months back, so the selected month is the last of
      // the window rather than the one after it.
      const start = new Date(Date.UTC(year, month - TRAILING_MONTHS, 1, 0, 0, 0, 0));
      return {
        granularity: "month",
        startDate: start,
        // `day 0` of the next month is the last day of this one — never assumed
        // to be 30 or 31.
        endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        label: `${TRAILING_MONTHS} months to ${period.month}`,
      };
    }
    case "year": {
      const year = Number(period.year);
      return {
        granularity: "month",
        startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
        endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        label: `${period.year}, by month`,
      };
    }
    case "all":
      return { granularity: "year", label: "All time, by year" };
  }
}

/** The trend request a {@link TrendWindow} makes, for the given accounts. */
export function toTrendParams(
  window: TrendWindow,
  accountIds: readonly number[],
): RecapTrendParams {
  return {
    granularity: window.granularity,
    ...(window.startDate ? { startDate: window.startDate } : {}),
    ...(window.endDate ? { endDate: window.endDate } : {}),
    // An empty selection is "every account", which is the absent filter — `[]`
    // would ask for the accounts in an empty set, i.e. nothing.
    ...(accountIds.length > 0 ? { accountId: accountIds as RecapTrendParams["accountId"] } : {}),
  };
}

/**
 * Every bucket key the window spans, oldest first — the axis the series is drawn
 * on.
 *
 * The API returns only buckets that hold a counted row, because a gap in the
 * middle of a range is a real gap. Which is right for the *data* and wrong for
 * the *axis*: a chart that simply omits an empty March draws February beside
 * April as though they were adjacent, so a month of no spending reads as no
 * month at all. Filling the axis here is what lets the client draw the gap as
 * the zero it is — and it is the client that must do it, since only it knows the
 * span it is plotting.
 *
 * `all` has no bounds to enumerate, so it returns `[]` and the caller falls back
 * to whatever buckets the data itself carries.
 */
export function bucketsIn(window: TrendWindow): string[] {
  const { startDate, endDate, granularity } = window;
  if (!startDate || !endDate) return [];

  const keys: string[] = [];
  if (granularity === "year") {
    for (let y = startDate.getUTCFullYear(); y <= endDate.getUTCFullYear(); y += 1) {
      keys.push(String(y));
    }
    return keys;
  }

  let year = startDate.getUTCFullYear();
  let month = startDate.getUTCMonth() + 1; // 1-based
  const lastYear = endDate.getUTCFullYear();
  const lastMonth = endDate.getUTCMonth() + 1;
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    keys.push(`${year}-${pad2(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}
