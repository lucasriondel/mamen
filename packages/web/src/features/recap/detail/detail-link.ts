import { UNASSIGNED_FILTER } from "@mamen/shared/contract";
import type { Period } from "../period";
import type { RecapDetailAxis, RecapDetailSearch } from "./search";

/**
 * The search params that open a **recap detail** page for one bucket (issue #86).
 *
 * Built here rather than at each call site so every link into the page agrees on
 * what "the same rows this row counted" means: the target, the recap's period,
 * its account selection, and `excludedFromRecap: false` — the counted rows, the
 * only half of the recap's predicate the transactions list can state, seeded as a
 * *visible* filter value so the detail's filter bar shows the narrowing it
 * applies and the user can widen it to inspect what was held out.
 */
export function toDetailSearch(
	axis: RecapDetailAxis,
	bucket: number | null,
	period: Period,
	accountIds: readonly number[],
): RecapDetailSearch {
	return {
		by: axis,
		// `null` — the *Unassigned* bucket — travels as the `"none"` filter value:
		// every URL value is a string, so an omitted param could not tell "the rows
		// with no issuer" apart from "any issuer".
		bucket: bucket === null ? UNASSIGNED_FILTER : bucket,
		period: period.kind,
		month: period.kind === "month" ? period.month : undefined,
		year: period.kind === "year" ? period.year : undefined,
		accountIds: accountIds.length > 0 ? [...accountIds] : undefined,
		excludedFromRecap: false,
	};
}

/**
 * The search params that open the **excluded** detail page (issue #87) — the rows
 * held out of the recap's totals, over the same period and account selection the
 * summary line reported them for.
 *
 * `excludedFromRecap: true` rather than `false`: this page is the other side of the
 * same filter, so the *Excluded only* option is already selected in its filter bar
 * and the control spells the page's subject out instead of contradicting it. There
 * is no `by`/`bucket` — the excluded rows are the complement of the breakdowns, not
 * a bucket within one.
 */
export function toExcludedDetailSearch(
	period: Period,
	accountIds: readonly number[],
): RecapDetailSearch {
	return {
		excluded: true,
		period: period.kind,
		month: period.kind === "month" ? period.month : undefined,
		year: period.kind === "year" ? period.year : undefined,
		accountIds: accountIds.length > 0 ? [...accountIds] : undefined,
		excludedFromRecap: true,
	};
}
