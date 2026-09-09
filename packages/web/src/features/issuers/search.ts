import {
  DEFAULT_ISSUER_SORT,
  type IssuerSort,
  type IssuerSortKey,
  type SortDirection,
} from "./issuer-sort";

/**
 * Typed URL search-param schema for the issuers route (issue #41).
 *
 * The table's sort key + direction live in the URL so a chosen ordering is
 * bookmarkable and survives a refresh, mirroring the transactions route. The
 * name filter (`q`) rides along for the same reason — a filtered table is a
 * shareable view. The schema is a plain normalizing function — TanStack Router's
 * `validateSearch` — so it is unit-testable without a router.
 */
export interface IssuersSearch {
  sort?: IssuerSortKey;
  direction?: SortDirection;
  /** Free-text name filter; absent when the box is empty. */
  q?: string;
}

const SORT_KEYS: ReadonlyArray<IssuerSortKey> = ["name", "count", "value", "recap"];

/**
 * Normalize raw URL search into {@link IssuersSearch}. Unknown/blank values fall
 * back to {@link DEFAULT_ISSUER_SORT} (name, A→Z) so a hand-edited or partial URL
 * still resolves to a valid view.
 */
export function validateIssuersSearch(search: Record<string, unknown>): IssuersSearch {
  const sort = SORT_KEYS.includes(search.sort as IssuerSortKey)
    ? (search.sort as IssuerSortKey)
    : DEFAULT_ISSUER_SORT.key;
  const direction =
    search.direction === "asc" || search.direction === "desc"
      ? search.direction
      : DEFAULT_ISSUER_SORT.direction;
  // A blank/whitespace-only `q` is dropped rather than kept as "": an empty
  // filter is the default view, so it shouldn't clutter the URL.
  const q = typeof search.q === "string" ? search.q.trim() : "";
  return q === "" ? { sort, direction } : { sort, direction, q };
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
