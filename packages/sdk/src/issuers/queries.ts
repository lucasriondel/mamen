import type { Issuer, IssuerCreate, IssuerId, IssuerUpdate } from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `orderBy`/`search` optional, mirroring the contract. */
export type IssuerListParams = {
  limit?: number;
  offset?: number;
  orderBy?: "name";
  /** A case-insensitive name substring — the picker read (#79). */
  search?: string;
};

/** The paged envelope every issuers list read resolves to. */
type PagedIssuers = {
  readonly items: readonly Issuer[];
  readonly total: number;
};

/** Query-key factory for the issuers resource. */
export const issuerKeys = {
  all: ["issuers"] as const,
  lists: () => [...issuerKeys.all, "list"] as const,
  list: (params: IssuerListParams) => [...issuerKeys.lists(), params] as const,
  /**
   * The **by-ids** read's key. Takes the already-normalised (deduped, ascending)
   * set {@link issuerQueries.byIds} builds, so two surfaces asking for the same
   * issuers in a different order share one cache entry rather than fetching the
   * same rows twice.
   */
  byIds: (ids: ReadonlyArray<number>) => [...issuerKeys.all, "by-ids", ids] as const,
  details: () => [...issuerKeys.all, "detail"] as const,
  detail: (id: IssuerId) => [...issuerKeys.details(), id] as const,
  byName: (name: string) => [...issuerKeys.all, "by-name", name] as const,
  byNameCi: (name: string) => [...issuerKeys.all, "by-name-ci", name] as const,
  /**
   * **Logo search** results, keyed by the exact query text.
   *
   * Deliberately **not** under {@link issuerKeys.all}: every issuer write
   * invalidates that whole family, and picking a search result *is* a write.
   * Folded in, choosing a logo would immediately re-run the search it was
   * chosen from — spending a second of the 100 daily queries to re-fetch an
   * answer already on screen (ADR 0007).
   */
  logoSearch: (q: string) => ["logo-search", q] as const,
};

/**
 * How long a **Logo search** answer stays usable. The free tier allows 100
 * queries a *day* and then refuses, so this window is sized to the quota window
 * rather than to freshness: results for one query are held for a day and never
 * go stale on their own, so re-submitting the same text — or re-opening the
 * popover on the same issuer — costs nothing (ADR 0007).
 */
const LOGO_SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * The page size the whole-set reads ask for — high enough to hold a single
 * user's whole issuer set in one response.
 *
 * Only two surfaces still ask for it, and both are *about* the whole set: the
 * issuers grid (which sorts and filters it client-side) and the create-issuer
 * duplicate-name guard. Both are bounded by the user's own issuer count and
 * there is nothing narrower for them to ask for.
 *
 * Everything else asks a narrower question and so has no ceiling at all:
 * **naming** a row's issuer asks for the ids on screen ({@link
 * issuerQueries.byIds}, #62), and **choosing** one asks for the names matching
 * what was typed ({@link issuerQueries.searchByName}, #79). Both used to come
 * through here, which is why this number is so far above a realistic issuer
 * count — and the cap still bit at 1000: a short page silently resolved (or
 * offered) only the issuers it happened to contain, so past it a row pointing at
 * a newer issuer rendered as unresolved and a picker could not find an issuer
 * that plainly existed.
 */
export const ISSUER_SCAN_LIMIT = 1000;

/**
 * How many matches a **name search** returns — a page of a picker's list, not a
 * scan. The list is read top-down by a user who narrows it by typing, so past
 * this many matches the answer is "type more", never a longer list.
 */
export const ISSUER_SEARCH_LIMIT = 50;

/** tanstack-query read options for the issuers resource. */
export const issuerQueries = {
  /**
   * **The issuers whose name matches `term`** — the picker read (#79).
   *
   * The counterpart of {@link issuerQueries.byIds}: that one names the issuers a
   * surface is *already showing*, this one offers the ones it could show next. A
   * picker used to answer that by reading the issuer table and filtering the
   * page it got back, which put a cliff under the choice — past the page, an
   * issuer that plainly existed simply could not be picked, however precisely
   * its name was typed. Matching server-side has no cliff: the whole table is
   * searched and a page of *matches* comes back.
   *
   * A blank term is a legitimate read, not a skipped one: an empty search box
   * asks for a page to browse. It is ordered by name so that page is the same
   * one every time and reads alphabetically, and capped at
   * {@link ISSUER_SEARCH_LIMIT} — the way past a full page is a narrower term.
   */
  searchByName: (term: string) =>
    issuerQueries.list({
      search: term.trim(),
      orderBy: "name",
      limit: ISSUER_SEARCH_LIMIT,
    }),

  /**
   * **The issuers with these ids** — the resolution read.
   *
   * A surface showing rows knows exactly which issuers it needs to name: the
   * distinct `issuerId`s of the rows it is rendering. A page of fifty
   * transactions references at most fifty issuers, so it asks for those rather
   * than reading the issuer table and hoping the ones it needs are on the page
   * it got back. That hope is what failed before: `list` pages by **id**, and an
   * issuer created moments ago sorts last, so the row pointing at it rendered as
   * *unresolved* — the raw counterparty text, and a picker offering to assign an
   * issuer the row already had (#62). Asking by id has no such cliff, whatever
   * the ids are and however many issuers exist.
   *
   * `ids` is normalised — deduped and sorted ascending — before it reaches the
   * key and the request, so a re-render with the same issuers in a different
   * order hits the same cache entry, and `limit` is the size of the set asked
   * for: the response is complete by construction.
   *
   * An **empty** set resolves to an empty page without a request. Zero issuers
   * to name is a real state (a page of entirely unmatched rows), and it is the
   * one case where sending the filter would be dangerous — an omitted `id` param
   * reads as *unfiltered*, so the request that asked for nothing would come back
   * with everything.
   */
  byIds: (ids: Iterable<IssuerId>) => {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    return queryOptions({
      queryKey: issuerKeys.byIds(unique),
      queryFn: ({ signal }): Promise<PagedIssuers> =>
        unique.length === 0
          ? Promise.resolve({ items: [], total: 0 })
          : runQuery(
              Effect.flatMap(Client, (client) =>
                client.issuers.list({
                  urlParams: { id: unique, limit: unique.length, offset: 0 },
                }),
              ),
              signal,
            ),
    });
  },

  list: (params: IssuerListParams = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: issuerKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.issuers.list({ urlParams })),
          signal,
        ),
    });
  },

  getById: (id: IssuerId) =>
    queryOptions({
      queryKey: issuerKeys.detail(id),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.issuers.getById({ path: { id } })),
          signal,
        ),
    }),

  getByName: (name: string) =>
    queryOptions({
      queryKey: issuerKeys.byName(name),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.issuers.getByName({ path: { name } })),
          signal,
        ),
    }),

  getByNameCi: (name: string) =>
    queryOptions({
      queryKey: issuerKeys.byNameCi(name),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.issuers.getByNameCi({ path: { name } })),
          signal,
        ),
    }),

  /**
   * **Logo search** (ADR 0007, amended): proxy one logo.dev name lookup.
   * `q` is the whole query, verbatim — the client pre-fills the issuer's
   * name, the server does not compose anything.
   *
   * The caller owns *when* this runs (`enabled`), because a query spends a
   * rate-limited upstream call and only an explicit submit may spend one. The
   * two options set here are the same budget seen from the other side:
   *
   * - `staleTime`/`gcTime` — a held answer is never re-fetched on its own, so
   *   re-asking the same question is free.
   * - `retry: false` — the app's default retries once, which on a spent quota
   *   or a missing key would buy a second identical refusal at the price of a
   *   query. `LogoSearchFailed` is the only retryable state and offers the
   *   user a button instead.
   */
  logoSearch: (q: string) =>
    queryOptions({
      queryKey: issuerKeys.logoSearch(q),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.issuers.searchLogos({ urlParams: { q } })),
          signal,
        ),
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: LOGO_SEARCH_CACHE_MS,
      retry: false,
    }),
};

/**
 * Mutation functions for the issuers resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation.
 * Invalidate `issuerKeys.all` after a write.
 *
 * `uploadImage` builds the `FormData` internally so web callers pass just a
 * `File` (mirroring the old hand-rolled `uploadImage(id, file)` — the contract
 * types the payload as `FormData` under the field key `file`).
 */
export const issuerMutations = {
  create: (payload: IssuerCreate) =>
    runQuery(Effect.flatMap(Client, (client) => client.issuers.create({ payload }))),

  update: (id: IssuerId, payload: IssuerUpdate) =>
    runQuery(Effect.flatMap(Client, (client) => client.issuers.update({ path: { id }, payload }))),

  remove: (id: IssuerId) =>
    runQuery(Effect.flatMap(Client, (client) => client.issuers.remove({ path: { id } }))),

  uploadImage: (id: IssuerId, file: File) => {
    const payload = new FormData();
    payload.append("file", file);
    return runQuery(
      Effect.flatMap(Client, (client) => client.issuers.uploadImage({ path: { id }, payload })),
    );
  },

  deleteImage: (id: IssuerId) =>
    runQuery(Effect.flatMap(Client, (client) => client.issuers.deleteImage({ path: { id } }))),

  /**
   * Store a **Logo search** result as the issuer's image: the server downloads
   * `url` through the SSRF guards and runs the same normalisation pipeline as
   * an upload, so a searched image and an uploaded one are the same thing on
   * disk (ADR 0007). Refusals surface as `ImageFetchRefused`.
   */
  setImageFromUrl: (id: IssuerId, url: string) =>
    runQuery(
      Effect.flatMap(Client, (client) =>
        client.issuers.setImageFromUrl({ path: { id }, payload: { url } }),
      ),
    ),
};
