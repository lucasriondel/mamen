import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/ui/empty";
import { resolveCategoryColors } from "@/lib/category-tree";
import { categoryQueries, issuerQueries, transactionQueries } from "@/lib/sdk";
import { filterIssuers } from "./issuer-filter";
import {
	type IssuerMetrics,
	type IssuerSort,
	issuerMetrics,
	sortIssuers,
} from "./issuer-sort";
import { IssuersFilterInput } from "./issuers-filter-input";
import { IssuersTable } from "./issuers-table";
import { IssuersTableSkeleton } from "./issuers-table-skeleton";
import { type IssuersSearch, toIssuerSort } from "./search";

const routeApi = getRouteApi("/issuers/");

/**
 * How many of an issuer's transactions to scan when deriving its € totals. Per-
 * issuer counts are small (PRD), so one wide page covers them; the `count`
 * itself comes from the server total, not this page's length.
 */
const ISSUER_TXN_SCAN_LIMIT = 1000;

/**
 * How many issuers to read. The table sorts and filters client-side, so it needs
 * the whole list in memory: a server page would make "sort by total moved" rank
 * only the first page, and the filter miss issuers that exist. One wide page
 * covers a personal-finance issuer list.
 */
const ISSUER_SCAN_LIMIT = 500;

/**
 * How many categories to read for the Category column. Matches the limit the
 * other surfaces pass — `IssuerAvatar` included — so the query key, and
 * therefore the cache entry, is shared: the whole table costs one tree read.
 */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * Issuers view (PRD) — a table of the entities the user has created, one row per
 * issuer showing avatar, name, transaction count, total money moved, and net €.
 * Clicking a row navigates to the issuer detail page (`/issuers/$issuerId`).
 *
 * The table can be sorted by name, transaction count, or total value moved
 * (issue #41) by clicking a column header, and narrowed by a free-text name
 * filter. Both live in the route's URL search params, so a sorted/filtered view
 * is bookmarkable and survives a refresh. Because count and value are derived
 * client-side, the view fetches every issuer's transactions here (one query
 * each, via `useQueries`), computes the metrics once, then filters and sorts.
 * Per the PRD, a read failure shows an inline error state.
 */
export function IssuersView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	const sort = toIssuerSort(search);
	const query = search.q ?? "";

	// Always fetch the issuers alphabetically; the client re-sorts to the chosen
	// key/direction so switching sorts never triggers a list refetch.
	const issuersQuery = useQuery(
		issuerQueries.list({ orderBy: "name", limit: ISSUER_SCAN_LIMIT }),
	);
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	// The category tree, read once for the whole table: a row shows its issuer's
	// **issuer default category**, and an inheriting leaf's colour lives on an
	// ancestor, so the colours must be resolved against the full tree, not per row.
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const categoriesById = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);
	const categoryColorById = useMemo(
		() => resolveCategoryColors(categories),
		[categories],
	);

	const txnQueries = useQueries({
		queries: issuers.map((issuer) => ({
			...transactionQueries.list({
				issuerId: issuer.id,
				limit: ISSUER_TXN_SCAN_LIMIT,
			}),
		})),
	});

	// Filter before sorting: both are pure passes over the same in-memory list,
	// and narrowing first means the sort only orders what will be shown.
	const rows = useMemo<IssuerMetrics[]>(
		() =>
			sortIssuers(
				filterIssuers(
					issuers.map((issuer, i) => {
						const q = txnQueries[i];
						const items = (q?.data?.items ?? []) as readonly Transaction[];
						return issuerMetrics(issuer, items, q?.data?.total ?? 0);
					}),
					query,
				),
				sort,
			),
		[issuers, txnQueries, sort, query],
	);

	const onSortChange = (next: IssuerSort) =>
		navigate({
			search: (prev: IssuersSearch) => ({
				...prev,
				sort: next.key,
				direction: next.direction,
			}),
			replace: true,
		});

	const onQueryChange = (next: string | undefined) =>
		navigate({
			search: (prev: IssuersSearch) => ({ ...prev, q: next }),
			replace: true,
		});

	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<PageHeader>
						<h1 className="text-balance text-2xl font-semibold text-gousse-ink">
							Issuers
						</h1>
					</PageHeader>
					<p className="mt-1 text-gousse-muted">
						The places your money comes from and goes to.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{issuers.length > 0 ? (
						<IssuersFilterInput value={search.q} onChange={onQueryChange} />
					) : null}
					<Link
						to="/issuers/new"
						className="flex items-center gap-1.5 rounded-full bg-gousse-accent px-4 py-1.5 text-sm font-medium text-gousse-bg"
					>
						<Plus size={16} aria-hidden />
						Create issuer
					</Link>
				</div>
			</header>

			{issuersQuery.isError ? (
				<Empty
					title="Couldn't load issuers"
					description="Something went wrong reading your issuers. Try again in a moment."
				/>
			) : issuersQuery.isPending ? (
				<IssuersTableSkeleton />
			) : issuers.length === 0 ? (
				<Empty
					title="No issuers yet"
					description="Create one here to pre-seed its default category, or resolve a transaction's counterparty to mint one on the fly."
				>
					<Link
						to="/issuers/new"
						className="mt-2 flex items-center gap-1.5 rounded-full bg-gousse-accent px-4 py-1.5 text-sm font-medium text-gousse-bg"
					>
						<Plus size={16} aria-hidden />
						Create your first issuer
					</Link>
				</Empty>
			) : rows.length === 0 ? (
				// Issuers exist but none match the filter — a distinct state from the
				// empty account above, so the copy points at the filter, not at
				// creating an issuer.
				<Empty
					title="No matching issuers"
					description={`No issuer's name matches “${query}”. Try a shorter term.`}
				/>
			) : (
				<IssuersTable
					metrics={rows}
					sort={sort}
					onSortChange={onSortChange}
					categoriesById={categoriesById}
					categoryColorById={categoryColorById}
				/>
			)}
		</section>
	);
}
