/**
 * The **period** a transactions list is narrowed to, and the translation between
 * it and the URL's three date fields.
 *
 * The URL has carried two ways to name a period since the recap started linking
 * here: `importMonth` (one `YYYY-MM`) and the `startDate`/`endDate` bounds on
 * the transaction's own date (see `TransactionsSearch`). Only the first ever had
 * a control — so a recap link could pin a period the filter bar could neither
 * show nor undo except through *Clear*.
 *
 * This module gives both one vocabulary. A {@link Period} is what the user
 * picked; {@link periodToFilter} turns it into the fields to write, and
 * {@link filterToPeriod} reads the URL back into one so the trigger can label
 * itself. Round-tripping is what keeps a link's period visible in the bar.
 */

/** The filter fields a period occupies. `undefined` clears one. */
export interface PeriodFilterFields {
  importMonth?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * A named period.
 *
 * - `all` — no narrowing; the resting state.
 * - `month` — one `YYYY-MM`, written to `importMonth` as it always was.
 * - `range` — explicit ISO bounds, written to `startDate`/`endDate`.
 *
 * The quick picks (*This month*, *Last month*, *This year*) are not variants:
 * they are shorthands that resolve to one of the above at the moment they are
 * clicked, so a bookmark keeps meaning the period it named rather than drifting
 * as the calendar moves.
 */
export type Period =
  | { kind: "all" }
  | { kind: "month"; month: string }
  | { kind: "range"; startDate: string; endDate: string };

/** Zero-pad to two digits — month and day numbers on the way into an ISO string. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The `YYYY-MM` a date falls in, in **local** time. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** The `YYYY-MM-DD` for a date, in **local** time. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Read the URL's fields back into a period.
 *
 * `importMonth` wins over the bounds when both are somehow present: a link
 * writes one or the other, so the pair only co-occurs in a hand-edited URL, and
 * the single month is the more specific of the two claims.
 */
export function filterToPeriod(fields: PeriodFilterFields): Period {
  if (fields.importMonth != null) return { kind: "month", month: fields.importMonth };
  if (fields.startDate != null && fields.endDate != null) {
    return { kind: "range", startDate: fields.startDate, endDate: fields.endDate };
  }
  return { kind: "all" };
}

/**
 * The fields to write for a period. Every field the period does not occupy is
 * set to `undefined` rather than left alone, so switching from a range to a
 * month cannot leave the old bounds behind — silently AND-ing a stale range
 * onto the new month and returning fewer rows than the label claims.
 */
export function periodToFilter(
  period: Period,
): Required<Record<keyof PeriodFilterFields, string | undefined>> {
  switch (period.kind) {
    case "month":
      return { importMonth: period.month, startDate: undefined, endDate: undefined };
    case "range":
      return {
        importMonth: undefined,
        startDate: period.startDate,
        endDate: period.endDate,
      };
    case "all":
      return { importMonth: undefined, startDate: undefined, endDate: undefined };
  }
}

/** The quick picks, in the order the panel offers them. */
export type QuickPickId = "this-month" | "last-month" | "this-year";

export interface QuickPick {
  id: QuickPickId;
  label: string;
}

export const QUICK_PICKS: readonly QuickPick[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
] as const;

/**
 * Resolve a quick pick against a reference date — `now` is a parameter rather
 * than read from the clock so the resolution is testable and so a render and the
 * click it produces cannot straddle midnight.
 *
 * *This month* and *Last month* resolve to a `month` period: they name exactly
 * what `importMonth` already means, so they reuse it rather than expressing the
 * same thing as a pair of bounds. *This year* has no single-month spelling, so
 * it resolves to the range Jan 1 – Dec 31, which is the same shape the recap's
 * year links already write.
 */
export function resolveQuickPick(id: QuickPickId, now: Date): Period {
  switch (id) {
    case "this-month":
      return { kind: "month", month: monthOf(now) };
    case "last-month": {
      // Day 1 before stepping back, so the 31st of a month doesn't skip a
      // 30-day one (`setMonth` on Mar 31 lands in March again via Feb 31).
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      first.setMonth(first.getMonth() - 1);
      return { kind: "month", month: monthOf(first) };
    }
    case "this-year": {
      const year = now.getFullYear();
      return {
        kind: "range",
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      };
    }
  }
}

/**
 * Which quick pick a period *is*, or `undefined` when it is none of them.
 *
 * Lets the panel light the pill a period came from — including one restored from
 * a bookmark — without storing which button was pressed. A period is identified
 * by its value, so a range typed by hand that happens to span this year lights
 * *This year*, which is the honest answer: it is the same filter.
 */
export function matchQuickPick(period: Period, now: Date): QuickPickId | undefined {
  return QUICK_PICKS.find((pick) => samePeriod(resolveQuickPick(pick.id, now), period))?.id;
}

/** Structural equality for two periods. */
export function samePeriod(a: Period, b: Period): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "month" && b.kind === "month") return a.month === b.month;
  if (a.kind === "range" && b.kind === "range") {
    return a.startDate === b.startDate && a.endDate === b.endDate;
  }
  return true;
}
