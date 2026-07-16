import { monthKeyOf, type Period, type PeriodKind } from "./period";
import {
	DEFAULT_SPEND_SORT,
	type SortDirection,
	type SpendSort,
	type SpendSortKey,
} from "./recap-sort";

/**
 * Typed URL search-param schema for the recap route (issue #35).
 *
 * The period (month/year/all), the selected accounts, and each section's sort
 * live in the URL so a filtered recap is bookmarkable and survives a refresh,
 * mirroring the transactions and issuers routes. The schema is a plain
 * normalizing function — TanStack Router's `validateSearch` — so it is unit-
 * testable without a router.
 *
 * `period` defaults to the current month, but that default is date-dependent, so
 * {@link validateRecapSearch} leaves `month`/`year` absent when not supplied and
 * {@link toPeriod} fills the current month at read time (injecting `today`),
 * keeping the validator pure.
 */
export interface RecapSearch {
	/** The period window; absent means the current-month default. */
	period?: PeriodKind;
	/** The `YYYY-MM` the `month` period points at (absent → current month). */
	month?: string;
	/** The `YYYY` the `year` period points at (absent → current year). */
	year?: string;
	/** Accounts to include; empty/absent means all accounts. */
	accountIds?: number[];
	/** Sort key for both spend sections. */
	sort?: SpendSortKey;
	/** Sort direction for both spend sections. */
	direction?: SortDirection;
}

const PERIOD_KINDS: ReadonlyArray<PeriodKind> = ["month", "year", "all"];
const SORT_KEYS: ReadonlyArray<SpendSortKey> = ["spent", "name"];

/** Coerce a raw search value (string, array, or absent) into a numeric id list. */
function toIdList(raw: unknown): number[] {
	const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
	const ids: number[] = [];
	for (const value of values) {
		const n = Number(value);
		if (value !== "" && Number.isFinite(n)) ids.push(n);
	}
	return ids;
}

/**
 * Normalize raw URL search into {@link RecapSearch}. Unknown/blank values fall
 * back to the defaults (current-month period, all accounts, spend high→low) so a
 * hand-edited or partial URL still resolves to a valid view. `month`/`year` are
 * only kept when the period actually uses them, so the URL never carries a stale
 * month once you switch to year/all.
 */
export function validateRecapSearch(
	search: Record<string, unknown>,
): RecapSearch {
	const period = PERIOD_KINDS.includes(search.period as PeriodKind)
		? (search.period as PeriodKind)
		: undefined;

	const result: RecapSearch = {};
	if (period != null) result.period = period;

	if (
		period === "month" &&
		typeof search.month === "string" &&
		search.month !== ""
	) {
		result.month = search.month;
	}
	if (
		period === "year" &&
		typeof search.year === "string" &&
		search.year !== ""
	) {
		result.year = search.year;
	}

	const accountIds = toIdList(search.accountIds);
	if (accountIds.length > 0) result.accountIds = accountIds;

	if (SORT_KEYS.includes(search.sort as SpendSortKey)) {
		result.sort = search.sort as SpendSortKey;
	}
	if (search.direction === "asc" || search.direction === "desc") {
		result.direction = search.direction;
	}

	return result;
}

/**
 * Read the current search back as a resolved {@link Period} (issue #35). The
 * `month`/`year` defaults are date-dependent, so `today` is injected and used to
 * fill the current month (period absent or `month` with no explicit month) or the
 * current year (`year` with no explicit year).
 */
export function toPeriod(search: RecapSearch, today: Date): Period {
	switch (search.period) {
		case "all":
			return { kind: "all" };
		case "year":
			return {
				kind: "year",
				year: search.year ?? String(today.getFullYear()),
			};
		case "month":
			return {
				kind: "month",
				month: search.month ?? monthKeyOf(today),
			};
		default:
			return { kind: "month", month: monthKeyOf(today) };
	}
}

/** Read the current search back as a {@link SpendSort}, filling the defaults. */
export function toSpendSort(search: RecapSearch): SpendSort {
	return {
		key: search.sort ?? DEFAULT_SPEND_SORT.key,
		direction: search.direction ?? DEFAULT_SPEND_SORT.direction,
	};
}
