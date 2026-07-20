/**
 * Typed URL search-param schema for the transactions route.
 *
 * The active filters (account, month), the sort direction, and the pagination
 * offset all live here so a filtered/sorted/paged view is bookmarkable and
 * survives a refresh (PRD: "active filters reflected in the URL"). The schema is
 * a plain normalizing function — TanStack Router's `validateSearch` — so it is
 * unit-testable without a router.
 */

/** The page size for the offset-paginated transactions table. */
export const TRANSACTIONS_PAGE_SIZE = 50;

/**
 * The decoded transactions search params. Every field is optional so links and
 * redirects to `/transactions` need not supply them; {@link
 * validateTransactionsSearch} always fills `direction`/`offset` with their
 * defaults, so at runtime those two are effectively always present.
 */
export interface TransactionsSearch {
	/** Filter to one account (its numeric id), or all accounts when absent. */
	accountId?: number;
	/** Filter to one `YYYY-MM` import month, or all months when absent. */
	importMonth?: string;
	/** Free-text term matched across issuer text/name, notes, and amount (#40). */
	search?: string;
	/** Date sort order; defaults to `desc` (newest-first), matching the SDK. */
	direction?: "asc" | "desc";
	/** Offset into the filtered set; defaults to `0` (first page). */
	offset?: number;
}

/**
 * Normalize raw URL search into {@link TransactionsSearch}. Unknown/blank values
 * fall back to the defaults (no filter, `desc`, offset `0`) so a hand-edited or
 * partial URL still resolves to a valid, safe view.
 */
export function validateTransactionsSearch(
	search: Record<string, unknown>,
): TransactionsSearch {
	const result: TransactionsSearch = { direction: "desc", offset: 0 };

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

	if (search.direction === "asc" || search.direction === "desc") {
		result.direction = search.direction;
	}

	const offset = Number(search.offset);
	if (Number.isFinite(offset) && offset > 0) {
		result.offset = Math.floor(offset);
	}

	return result;
}
