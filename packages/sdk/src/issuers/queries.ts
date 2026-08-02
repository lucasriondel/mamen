import type {
	IssuerCreate,
	IssuerId,
	IssuerUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `orderBy` optional, mirroring the contract. */
export type IssuerListParams = {
	limit?: number;
	offset?: number;
	orderBy?: "name";
};

/** Query-key factory for the issuers resource. */
export const issuerKeys = {
	all: ["issuers"] as const,
	lists: () => [...issuerKeys.all, "list"] as const,
	list: (params: IssuerListParams) => [...issuerKeys.lists(), params] as const,
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
 * The page size {@link issuerQueries.all} asks for — high enough to hold a
 * single user's whole issuer set in one response.
 *
 * The number exists because a *resolution* read has no business being
 * paginated: a caller indexing issuers by id to name a transaction's issuer
 * needs every issuer, and a short page silently resolves the ones it happens to
 * contain. The contract's `list` defaults to 50 ordered by **id**, so with more
 * than 50 issuers the newest ones fall off page 1 and rows pointing at them
 * render as unresolved — a rule that matched correctly looks broken.
 *
 * A cap this far above a realistic issuer count is a stopgap, not a fix: it
 * moves the cliff rather than removing it. Resolving by the ids actually on
 * screen is the real answer (see the linked issue).
 */
export const ISSUER_SCAN_LIMIT = 1000;

/** tanstack-query read options for the issuers resource. */
export const issuerQueries = {
	/**
	 * **Every issuer**, in one query — the shared read for lookup-by-id.
	 *
	 * The single source of truth for "give me all the issuers so I can resolve
	 * one": the transactions table, the pickers, the recap, and the rules UI all
	 * call this rather than each passing its own `limit` to {@link
	 * issuerQueries.list}. That drift is what broke issuer resolution once — most
	 * call sites took the default 50 while the rules pages asked for 1000 — so
	 * the limit lives here, in one place, where it cannot be forgotten.
	 *
	 * `list` stays for genuinely paginated/ordered reads (the issuers grid).
	 */
	all: () => issuerQueries.list({ limit: ISSUER_SCAN_LIMIT }),

	list: (params: IssuerListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: issuerKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.list({ urlParams }),
					),
					signal,
				),
		});
	},

	getById: (id: IssuerId) =>
		queryOptions({
			queryKey: issuerKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getById({ path: { id } }),
					),
					signal,
				),
		}),

	getByName: (name: string) =>
		queryOptions({
			queryKey: issuerKeys.byName(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getByName({ path: { name } }),
					),
					signal,
				),
		}),

	getByNameCi: (name: string) =>
		queryOptions({
			queryKey: issuerKeys.byNameCi(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getByNameCi({ path: { name } }),
					),
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
					Effect.flatMap(Client, (client) =>
						client.issuers.searchLogos({ urlParams: { q } }),
					),
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
		runQuery(
			Effect.flatMap(Client, (client) => client.issuers.create({ payload })),
		),

	update: (id: IssuerId, payload: IssuerUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.update({ path: { id }, payload }),
			),
		),

	remove: (id: IssuerId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.remove({ path: { id } }),
			),
		),

	uploadImage: (id: IssuerId, file: File) => {
		const payload = new FormData();
		payload.append("file", file);
		return runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.uploadImage({ path: { id }, payload }),
			),
		);
	},

	deleteImage: (id: IssuerId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.deleteImage({ path: { id } }),
			),
		),

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
