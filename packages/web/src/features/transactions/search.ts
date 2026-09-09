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
  /**
   * Filter to a **set** of accounts (their numeric ids), or all accounts when
   * absent. A set rather than one id because the recap's account picker is
   * multi-select and its summary lines link here carrying that selection whole:
   * narrowing it to one account would show a total the line never claimed, and
   * dropping it would show every account's rows under a header naming a few.
   * A single id still decodes (one-element set), so existing bookmarks hold.
   */
  accountId?: number[];
  /** Filter to one `YYYY-MM` import month, or all months when absent. */
  importMonth?: string;
  /**
   * Inclusive lower/upper bounds on the transaction's own **`date`**, as ISO
   * strings. How a **recap period** travels here (month, year and all-time are
   * all one date range — see `periodToFilter`), which `importMonth` could not
   * express: it names a single month, so a year or all-time recap had no way to
   * open its rows. AND-combined with `importMonth` like every other filter,
   * though a link writes one or the other, never both.
   */
  startDate?: string;
  endDate?: string;
  /** Free-text term matched across issuer text/name, notes, and amount (#40). */
  search?: string;
  /**
   * When `true`, narrow to rows nothing has been reviewed on — no issuer, no
   * derived category, no note (the rows the table tints). Absent shows every
   * row; there is no "curated only" URL state, the control is a toggle.
   */
  uncurated?: boolean;
  /**
   * **Excluded from recap** state (issue #67), tri-state: `true` narrows to the
   * rows held out of spend totals, `false` to the rows that count, absent shows
   * both. Unlike {@link TransactionsSearch.uncurated} this is a real three-way
   * filter rather than a toggle — both halves answer a question the user asks
   * ("what have I held out?" and "what actually counts?").
   *
   * "Held out" is the server's `isRecapExcluded` — the exclusion flag **or** a
   * duplicate-exclusion — matching what the recap's *Excluded from recap* line
   * sums, since that line links here.
   */
  excludedFromRecap?: boolean;
  /**
   * **Transfer legs** — `true` narrows to money moved between the user's own
   * accounts, `false` to everything else, absent shows both. Tri-state for the
   * same reason `excludedFromRecap` is: both halves are questions the user asks.
   * What the recap's *Internal transfers* line opens.
   */
  isTransferLeg?: boolean;
  /**
   * The row **kind** — only `"bundle"` is representable, narrowing to the
   * **bundle parents**: the rows that stand for a group, one per bundle, each
   * expandable in place to the transactions it covers (the table already ships
   * members with their parent). Absent shows every kind.
   *
   * A toggle rather than a tri-state: "not a bundle parent" is not a view anyone
   * asks for, so its off state is the absent filter.
   */
  kind?: "bundle";
  /**
   * The row whose **detail panel** is open beside the table (issue #154), by
   * id. Not a filter — it narrows nothing, so it never reaches a query and
   * never resets {@link TransactionsSearch.page}; the list underneath is the
   * same list whether the panel is open or shut.
   *
   * It lives in the URL because the panel is a *place*: `/transactions?selected=123`
   * is linkable, survives a reload, and is what `Escape` and the back button
   * navigate out of. The full page at `/transactions/123` keeps its own address
   * — the panel is beside it, not in place of it.
   */
  selected?: number;
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

/**
 * Coerce a raw URL search value — a scalar, a repeated param's array, or absent
 * — into a numeric id list, dropping anything unparseable. Shared so every
 * surface that reads an id set from a URL agrees on what one looks like.
 */
export function toIdList(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const ids: number[] = [];
  for (const value of values) {
    const n = Number(value);
    if (value !== "" && Number.isFinite(n)) ids.push(n);
  }
  return ids;
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
export function validateTransactionsSearch(search: Record<string, unknown>): TransactionsSearch {
  const result: TransactionsSearch = { direction: "desc", page: 1 };

  // A repeated param decodes to an array, a single one to a scalar — both land
  // as a set here, so a one-account bookmark written before the filter went
  // multi-select still resolves to the same view.
  const accountIds = toIdList(search.accountId);
  if (accountIds.length > 0) result.accountId = accountIds;

  if (typeof search.importMonth === "string" && search.importMonth !== "") {
    result.importMonth = search.importMonth;
  }

  // Date bounds are kept as the ISO strings they arrive as, and only when they
  // parse: a malformed bound would otherwise reach the query as `Invalid Date`
  // and silently match nothing, which reads as "no transactions" rather than as
  // the bad URL it is.
  for (const key of ["startDate", "endDate"] as const) {
    const raw = search[key];
    if (typeof raw === "string" && raw !== "" && !Number.isNaN(Date.parse(raw))) {
      result[key] = raw;
    }
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

  // Both sides are representable here (unlike the uncurated toggle): the filter
  // is a three-way choice, so an explicit `false` is its own view — the rows
  // that do count — and belongs in the URL. Anything else is "no filter".
  if (search.excludedFromRecap === true || search.excludedFromRecap === "true") {
    result.excludedFromRecap = true;
  } else if (search.excludedFromRecap === false || search.excludedFromRecap === "false") {
    result.excludedFromRecap = false;
  }

  // Tri-state like `excludedFromRecap` above, and for the same reason: both
  // "transfers only" and "everything else" are views the user asks for.
  if (search.isTransferLeg === true || search.isTransferLeg === "true") {
    result.isTransferLeg = true;
  } else if (search.isTransferLeg === false || search.isTransferLeg === "false") {
    result.isTransferLeg = false;
  }

  // Only `"bundle"` is representable: the filter offers the **bundle parents**,
  // and its off state is the absent filter rather than a second view.
  if (search.kind === "bundle") {
    result.kind = "bundle";
  }

  // The open panel's row (issue #154). A row id is a positive integer, and
  // anything else names no row: the panel stays shut rather than opening on a
  // read that can only fail. Unlike every field above it, this one is not a
  // filter — it is dropped from nothing and resets nothing.
  const selected = Number(search.selected);
  if (search.selected !== "" && Number.isInteger(selected) && selected > 0) {
    result.selected = selected;
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
