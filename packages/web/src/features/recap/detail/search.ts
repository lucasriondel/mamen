import { UNASSIGNED_FILTER } from "@mamen/shared/contract";
import {
	type TransactionsSearch,
	toIdList,
	validateTransactionsSearch,
} from "@/features/transactions/search";
import type { PeriodKind } from "../period";
import type { RecapSearch } from "../search";

/**
 * Typed URL search-param schema for the **recap detail** route (issue #86).
 *
 * The page is the drill-down of ONE recap row, so its URL is the union of two
 * schemas already in use rather than a third dialect:
 *
 * - the recap's own {@link RecapSearch} — the period (`period`/`month`/`year`)
 *   and the account selection (`accountIds`) — carried across verbatim, so the
 *   rows the detail lists are exactly the rows the row it came from counted;
 * - the transactions view's {@link TransactionsSearch} — the filter bar, the date
 *   sort, and the page — so the detail is the same table with the same controls.
 *
 * On top of those it adds the *target*: a **bucket** on a breakdown — which one
 * the user clicked (`by`) and which bucket (`bucket`). `bucket` is a numeric id,
 * or {@link UNASSIGNED_FILTER} for the recap's **Unassigned** bucket — the biggest
 * number on the page for a fresh import, so it must be reachable, and its "no id"
 * state has to survive a URL where every value is a string.
 *
 * The recap's two summary lines used to open this page as well, on an `excluded`
 * target with no bucket. They now link straight to `/transactions` with their
 * narrowing as filter values, which is the same table with controls that can show
 * and widen what was applied — so this page is bucket-drill-down only, and each
 * page here is about a bucket rather than sometimes about the complement of every
 * bucket.
 */
export type RecapDetailSearch = TransactionsSearch &
	Pick<RecapSearch, "period" | "month" | "year" | "accountIds"> & {
		/** Which recap breakdown this page drills into. */
		by?: RecapDetailAxis;
		/** The bucket: an entity id, or `"none"` for the Unassigned bucket. */
		bucket?: number | typeof UNASSIGNED_FILTER;
	};

/** The two recap breakdowns a detail page can drill into. */
export type RecapDetailAxis = "issuer" | "category";

/**
 * The resolved target of a detail page: a slice of the spend — an axis plus the
 * bucket on it. A `bucket` of `null` is the **Unassigned** bucket (the rows with
 * no issuer / no derived category), a real target distinct from "no target at
 * all" (an unusable URL, which {@link toDetailTarget} reports as `undefined`).
 *
 * Kept as a tagged member rather than flattened to `{ axis, bucket }` now that it
 * is the only one: `kind` is what every reader switches on, and re-adding a second
 * target should not mean rewriting them.
 */
export type RecapDetailTarget = {
	kind: "bucket";
	axis: RecapDetailAxis;
	bucket: number | null;
};

const AXES: ReadonlyArray<RecapDetailAxis> = ["issuer", "category"];
const PERIOD_KINDS: ReadonlyArray<PeriodKind> = ["month", "year", "all"];

/**
 * Normalize raw URL search into {@link RecapDetailSearch}. The transactions half
 * is delegated to {@link validateTransactionsSearch} — one definition of what
 * `page`/`direction`/the filter bar decode to, shared with every other page that
 * lists transactions — and this function adds the target and the recap half.
 *
 * A blank or unknown target is left absent rather than guessed at: the view shows
 * an empty state and offers the way back to the recap, which is more use than a
 * page of some other bucket's rows. `month`/`year` are kept only when the period
 * actually uses them, exactly as the recap's own validator does, so the URL never
 * carries a stale month once you switch to year/all.
 */
export function validateRecapDetailSearch(
	search: Record<string, unknown>,
): RecapDetailSearch {
	const result: RecapDetailSearch = validateTransactionsSearch(search);

	if (AXES.includes(search.by as RecapDetailAxis)) {
		result.by = search.by as RecapDetailAxis;
	}

	if (search.bucket === UNASSIGNED_FILTER) {
		result.bucket = UNASSIGNED_FILTER;
	} else {
		const bucket = Number(search.bucket);
		if (
			search.bucket != null &&
			search.bucket !== "" &&
			Number.isFinite(bucket)
		) {
			result.bucket = bucket;
		}
	}

	const period = PERIOD_KINDS.includes(search.period as PeriodKind)
		? (search.period as PeriodKind)
		: undefined;
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

	return result;
}

/**
 * Read the search back as a resolved {@link RecapDetailTarget}, or `undefined`
 * when the URL names no usable bucket — including an old `?excluded=true` link,
 * which now has no target here and lands on the view's empty state with the way
 * back to the recap. (Its live equivalent is `/transactions` with
 * `excludedFromRecap=true`, which the recap's own line writes.)
 *
 * `"none"` becomes `null` — the shape the rest of the feature reasons about,
 * matching the `null` bucket id the recap summary itself reports for unattributed
 * spend.
 */
export function toDetailTarget(
	search: RecapDetailSearch,
): RecapDetailTarget | undefined {
	if (search.by === undefined || search.bucket === undefined) return undefined;
	return {
		kind: "bucket",
		axis: search.by,
		bucket: search.bucket === UNASSIGNED_FILTER ? null : search.bucket,
	};
}
