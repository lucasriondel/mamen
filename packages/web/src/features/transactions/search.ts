/**
 * Typed URL search-param schema for the transactions route.
 *
 * The active filters (account, month), the sort direction, and the current page
 * all live here so a filtered/sorted/paged view is bookmarkable and survives a
 * refresh (PRD: "active filters reflected in the URL"). The schema is a plain
 * normalizing function — TanStack Router's `validateSearch` — so it is
 * unit-testable without a router.
 */

/** The page size for the paginated transactions table. */
export const TRANSACTIONS_PAGE_SIZE = 50;

/**
 * The decoded transactions search params. Every field is optional so links and
 * redirects to `/transactions` need not supply them; {@link
 * validateTransactionsSearch} always fills `direction`/`page` with their
 * defaults, so at runtime those two are effectively always present.
 */
export interface TransactionsSearch {
	/** Filter to one account (its numeric id), or all accounts when absent. */
	accountId?: number;
	/** Filter to one `YYYY-MM` import month, or all months when absent. */
	importMonth?: string;
	/** Free-text term matched across issuer text/name, notes, and amount (#40). */
	search?: string;
	/**
	 * When `true`, narrow to rows nothing has been reviewed on — no issuer, no
	 * derived category, no note (the rows the table tints). Absent shows every
	 * row; there is no "curated only" URL state, the control is a toggle.
	 */
	uncurated?: boolean;
	/** Date sort order; defaults to `desc` (newest-first), matching the SDK. */
	direction?: "asc" | "desc";
	/**
	 * The 1-based page number into the filtered set; defaults to `1`. The URL
	 * carries the page a human reads off the pager ("page 3"), not the row offset
	 * it multiplies out to — see {@link pageToOffset} for the conversion the
	 * offset-paginated SDK call needs.
	 */
	page?: number;
}

/** The row offset a 1-based `page` starts at, for the offset-paginated SDK list. */
export function pageToOffset(page: number, pageSize: number): number {
	return (page - 1) * pageSize;
}

/** The 1-based page a row `offset` falls on — the inverse of {@link pageToOffset}. */
export function offsetToPage(offset: number, pageSize: number): number {
	return Math.floor(offset / pageSize) + 1;
}

/**
 * Normalize raw URL search into {@link TransactionsSearch}. Unknown/blank values
 * fall back to the defaults (no filter, `desc`, page `1`) so a hand-edited or
 * partial URL still resolves to a valid, safe view.
 */
export function validateTransactionsSearch(
	search: Record<string, unknown>,
): TransactionsSearch {
	const result: TransactionsSearch = { direction: "desc", page: 1 };

	const accountId = Number(search.accountId);
	if (
		search.accountId != null &&
		search.accountId !== "" &&
		Number.isFinite(accountId)
	) {
		result.accountId = accountId;
	}

	if (typeof search.importMonth === "string" && search.importMonth !== "") {
		result.importMonth = search.importMonth;
	}

	if (typeof search.search === "string") {
		const term = search.search.trim();
		if (term !== "") result.search = term;
	}

	// Only the `true` state is representable: the filter is a toggle, so an
	// explicit `false` is the same view as no filter at all and stays out of the
	// URL. A hand-typed `?uncurated=true` decodes like the boolean the toggle writes.
	if (search.uncurated === true || search.uncurated === "true") {
		result.uncurated = true;
	}

	if (search.direction === "asc" || search.direction === "desc") {
		result.direction = search.direction;
	}

	// Pages are 1-based, so anything below 1 (or unparseable) is the first page.
	const page = Number(search.page);
	if (Number.isFinite(page) && page > 1) {
		result.page = Math.floor(page);
	}

	return result;
}
