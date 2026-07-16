import {
	DEFAULT_ISSUER_SORT,
	type IssuerSort,
	type IssuerSortKey,
	type SortDirection,
} from "./issuer-sort";

/**
 * Typed URL search-param schema for the issuers route (issue #41).
 *
 * The grid's sort key + direction live in the URL so a chosen ordering is
 * bookmarkable and survives a refresh, mirroring the transactions route. The
 * schema is a plain normalizing function — TanStack Router's `validateSearch` —
 * so it is unit-testable without a router.
 */
export interface IssuersSearch {
	sort?: IssuerSortKey;
	direction?: SortDirection;
}

const SORT_KEYS: ReadonlyArray<IssuerSortKey> = ["name", "count", "value"];

/**
 * Normalize raw URL search into {@link IssuersSearch}. Unknown/blank values fall
 * back to {@link DEFAULT_ISSUER_SORT} (name, A→Z) so a hand-edited or partial URL
 * still resolves to a valid view.
 */
export function validateIssuersSearch(
	search: Record<string, unknown>,
): IssuersSearch {
	const sort = SORT_KEYS.includes(search.sort as IssuerSortKey)
		? (search.sort as IssuerSortKey)
		: DEFAULT_ISSUER_SORT.key;
	const direction =
		search.direction === "asc" || search.direction === "desc"
			? search.direction
			: DEFAULT_ISSUER_SORT.direction;
	return { sort, direction };
}

/**
 * Read the current search back as an {@link IssuerSort}. Fields are typed
 * optional so links to `/issuers` need not supply them; {@link
 * validateIssuersSearch} always fills both, but fall back to the default here so
 * this is total even for a hand-built search object.
 */
export function toIssuerSort(search: IssuersSearch): IssuerSort {
	return {
		key: search.sort ?? DEFAULT_ISSUER_SORT.key,
		direction: search.direction ?? DEFAULT_ISSUER_SORT.direction,
	};
}
