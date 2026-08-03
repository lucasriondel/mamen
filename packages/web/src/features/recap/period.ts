import type { RecapParams } from "@/lib/sdk";

/**
 * The recap page's period selector (issue #35). Spend is reviewed over one of
 * three windows:
 * - `month` — a single `YYYY-MM`, the default on load (the current month).
 * - `year` — a whole calendar year (`YYYY`).
 * - `all` — every transaction, no date bound.
 *
 * The chosen window lives in the route's URL search params so a filtered recap
 * is bookmarkable and survives a refresh, mirroring the transactions route.
 */
export type PeriodKind = "month" | "year" | "all";

/**
 * A fully-resolved period: the kind plus the specific month/year it points at.
 * `month` is a `YYYY-MM` key; `year` is a four-digit `YYYY`. `all` carries
 * neither — it is the unbounded window.
 */
export type Period =
	| { kind: "month"; month: string }
	| { kind: "year"; year: string }
	| { kind: "all" };

/** Zero-pad a 1–2 digit number to two chars (`3` → `"03"`). */
function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * The `YYYY-MM` key of the month a `Date` falls in, in local time. Kept beside
 * the period model so the "current month" default and the month-filter both mint
 * the key the same way. `today` is injected (never read from the clock here) so
 * the derivation stays pure and testable.
 */
export function monthKeyOf(today: Date): string {
	return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
}

/**
 * The default period on load (issue #35): the current calendar month. Derived
 * from an injected `today` so the default is deterministic in tests.
 */
export function currentMonthPeriod(today: Date): Period {
	return { kind: "month", month: monthKeyOf(today) };
}

/**
 * Turn a resolved {@link Period} into the recap filter that scopes a query to it
 * (issue #35). All three periods are one bound on the transaction **`date`**,
 * widened (issue #71):
 * - `month` → Jan-1-style bounds spanning the first and last day of the month.
 * - `year` → the same, spanning Jan 1 – Dec 31.
 * - `all` → no bound at all.
 *
 * The month used to filter on `importMonth` instead, which made the same row land
 * in different buckets depending on whether you were looking at the month or the
 * year: import month is **provenance** — it keys the delete-then-insert that
 * makes re-import idempotent, and it is per-account-per-statement — while spend
 * happens when the transaction happens. A late statement or a month-boundary row
 * therefore moves; that is the correction, and statement-level reconciliation is
 * already handled at import time.
 *
 * The bounds are built in UTC so they match the wire `date` (an ISO instant)
 * rather than drifting by the viewer's offset. `endDate` is the last millisecond
 * of the final day, so the upper bound is inclusive of the whole of it; a month's
 * last day is derived (`day 0` of the next month), never assumed to be 30 or 31.
 */
export function periodToFilter(period: Period): RecapParams {
	switch (period.kind) {
		case "month": {
			const year = Number(period.month.slice(0, 4));
			// 1-based, as the key writes it: `Date.UTC(y, m, 0)` is then the last
			// day of month `m`, and `Date.UTC(y, m - 1, 1)` its first.
			const month = Number(period.month.slice(5, 7));
			return {
				startDate: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
				endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
			};
		}
		case "year": {
			const year = Number(period.year);
			return {
				startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
				endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
			};
		}
		case "all":
			return {};
	}
}
