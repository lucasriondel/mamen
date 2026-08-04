import { UNASSIGNED_FILTER } from "@mamen/shared/contract";
import {
	type TransactionsSearch,
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
 * On top of those it adds the *target*, in one of two forms:
 *
 * - a **bucket** on a breakdown — which one the user clicked (`by`) and which
 *   bucket (`bucket`). `bucket` is a numeric id, or {@link UNASSIGNED_FILTER} for
 *   the recap's **Unassigned** bucket — the biggest number on the page for a fresh
 *   import, so it must be reachable, and its "no id" state has to survive a URL
 *   where every value is a string.
 * - the **excluded** rows (`excluded=true`), the money held out of the totals
 *   altogether (issue #87). It has no axis and no bucket: it is not a slice of the
 *   spend but the complement of it, so it is its own kind of target rather than a
 *   third value of `by`.
 */
export type RecapDetailSearch = TransactionsSearch &
	Pick<RecapSearch, "period" | "month" | "year" | "accountIds"> & {
		/** Which recap breakdown this page drills into. */
		by?: RecapDetailAxis;
		/** The bucket: an entity id, or `"none"` for the Unassigned bucket. */
		bucket?: number | typeof UNASSIGNED_FILTER;
		/**
		 * When `true`, the page lists the rows **held out** of the recap rather than a
		 * bucket of it (issue #87). Only the `true` state is representable: it is what
		 * makes this page the excluded view, and its absence is the ordinary
		 * bucket-drill-down, not a second view.
		 */
		excluded?: boolean;
	};

/** The two recap breakdowns a detail page can drill into. */
export type RecapDetailAxis = "issuer" | "category";

/**
 * The resolved target of a detail page — one of the two things the recap page can
 * open (issue #87):
 *
 * - `bucket` — a slice of the spend: an axis plus the bucket on it. A `bucket` of
 *   `null` is the **Unassigned** bucket (the rows with no issuer / no derived
 *   category), a real target distinct from "no target at all" (an unusable URL,
 *   which {@link toDetailTarget} reports as `undefined`).
 * - `excluded` — the rows held out of the totals. Carries no axis and no bucket,
 *   which is exactly why it is a separate member rather than a nullable axis: every
 *   reader has to decide what to do about it rather than fall through a default.
 */
export type RecapDetailTarget =
	| { kind: "bucket"; axis: RecapDetailAxis; bucket: number | null }
	| { kind: "excluded" };

const AXES: ReadonlyArray<RecapDetailAxis> = ["issuer", "category"];
const PERIOD_KINDS: ReadonlyArray<PeriodKind> = ["month", "year", "all"];

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

	// Only the `true` state is representable (issue #87): it is what makes this page
	// the excluded view, and its absence is the ordinary bucket drill-down rather
	// than a second view. A hand-typed `?excluded=true` decodes like the boolean the
	// recap's link writes.
	if (search.excluded === true || search.excluded === "true") {
		result.excluded = true;
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
 * when the URL names neither a usable bucket nor the excluded view.
 *
 * `excluded=true` wins over a bucket that happens to be in the URL as well: the
 * excluded rows are the complement of the spend, so "this issuer's excluded rows"
 * is not a view this page offers — the filter bar's *Excluded only* option is how
 * you ask that of a bucket. Deciding it here rather than in the view keeps the two
 * readings from disagreeing about the same URL.
 *
 * `"none"` becomes `null` — the shape the rest of the feature reasons about,
 * matching the `null` bucket id the recap summary itself reports for unattributed
 * spend.
 */
export function toDetailTarget(
	search: RecapDetailSearch,
): RecapDetailTarget | undefined {
	if (search.excluded === true) return { kind: "excluded" };
	if (search.by === undefined || search.bucket === undefined) return undefined;
	return {
		kind: "bucket",
		axis: search.by,
		bucket: search.bucket === UNASSIGNED_FILTER ? null : search.bucket,
	};
}
