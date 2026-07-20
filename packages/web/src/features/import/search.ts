/**
 * Typed URL search-param schema for the import route.
 *
 * The accounts import grid links to `/import?accountId=…` to pre-select the
 * wizard's target account (issue #36). The schema is a plain normalizing
 * function — TanStack Router's `validateSearch` — so it's unit-testable without
 * a router. A plain `/import` visit supplies nothing and starts empty.
 */

/** The decoded import search params. All optional — a bare `/import` is valid. */
export interface ImportSearch {
	/** Account (numeric id) to pre-select, from a grid cell handoff. */
	accountId?: number;
}

/** Normalize raw URL search into {@link ImportSearch}, dropping bad values. */
export function validateImportSearch(
	search: Record<string, unknown>,
): ImportSearch {
	const result: ImportSearch = {};

	const accountId = Number(search.accountId);
	if (
		search.accountId != null &&
		search.accountId !== "" &&
		Number.isFinite(accountId)
	) {
		result.accountId = accountId;
	}

	return result;
}
