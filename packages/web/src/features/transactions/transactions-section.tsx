import type {
	Account,
	AccountId,
	Category,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import {
	accountQueries,
	categoryQueries,
	type TransactionCountParams,
	type TransactionListParams,
	transactionQueries,
} from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import {
	pageToOffset,
	TRANSACTIONS_PAGE_SIZE,
	type TransactionsSearch,
} from "./search";
import {
	type TransactionFilterValues,
	TransactionsFilters,
} from "./transactions-filters";
import { TransactionsPagination } from "./transactions-pagination";
import { TransactionsTable } from "./transactions-table";
import { TransactionsTableSkeleton } from "./transactions-table-skeleton";

/** How many transactions to scan when deriving the distinct-month filter options. */
const MONTH_SCAN_LIMIT = 1000;

/**
 * AND-compose a page's `scope` (the identity filter it is *about*) with the
 * user's account/month/search filters from the URL — the exact set the rows
 * describe. Exported so a page's total header can query `count` with the very
 * same object the list uses, and can never disagree with the rows beneath it.
 */
export function composeTransactionFilters(
	scope: TransactionCountParams,
	search: TransactionsSearch,
): TransactionCountParams {
	return {
		...scope,
		...(search.accountId != null
			? { accountId: search.accountId as AccountId }
			: {}),
		...(search.importMonth != null ? { importMonth: search.importMonth } : {}),
		...(search.search != null ? { search: search.search } : {}),
		...(search.uncurated ? { uncurated: true } : {}),
		// Both halves of the recap-exclusion filter reach the query (issue #67), so
		// `false` — the rows that count — must survive this fold, not be read as
		// "no filter" the way the uncurated toggle's off state is.
		...(search.excludedFromRecap != null
			? { excludedFromRecap: search.excludedFromRecap }
			: {}),
	};
}

export interface TransactionsSectionProps {
	/**
	 * The scope this section is pinned to — the owning page's identity filter
	 * (`{ categoryId: [...] }`, `{ issuerId }`), AND-composed with the user's
	 * account/month/search filters. An empty object is the unscoped view.
	 */
	scope: TransactionCountParams;
	/** The route's typed search params (filters, sort, page). */
	search: TransactionsSearch;
	/** Apply a filter patch; the caller writes it to the URL and resets `page`. */
	onFiltersChange: (patch: TransactionFilterValues) => void;
	/** Toggle the date sort order (asc ⇄ desc). */
	onToggleSort: () => void;
	/** Jump to a new 1-based page. */
	onPageChange: (page: number) => void;
	/**
	 * Whether the section may query at all. A scope that isn't resolved yet (a
	 * category page whose id set is still empty) passes `false` — querying with a
	 * dropped filter would return the *whole* table rather than nothing.
	 */
	enabled?: boolean;
	/** Rendered above the filter bar — a page's own header/total lives here. */
	children?: React.ReactNode;
	/** Description for the empty state when no filter is active. */
	emptyDescription?: string;
	/** Extra controls rendered beside the filter bar (e.g. the columns toggle). */
	actions?: React.ReactNode;
	/** Controlled column visibility; omitted means every column shows. */
	columnVisibility?: React.ComponentProps<
		typeof TransactionsTable
	>["columnVisibility"];
	onColumnVisibilityChange?: React.ComponentProps<
		typeof TransactionsTable
	>["onColumnVisibilityChange"];
}

/**
 * The shared transactions surface — filter bar, table, and pagination — used by
 * every page that lists transactions: the global view, a category's drill-down,
 * and an issuer's detail page. Each caller supplies only its `scope` (the
 * identity filter that page is *about*) and the URL plumbing; everything else —
 * the account/month/search filters, server-driven date sort, offset pagination,
 * and the loading/error/empty states — is identical by construction, so the
 * three pages can't drift apart.
 *
 * The user's filters are AND-composed onto `scope` into one object shared by the
 * list query and the month scan, so the rows and the filter options always
 * describe the same set.
 */
export function TransactionsSection({
	scope,
	search,
	onFiltersChange,
	onToggleSort,
	onPageChange,
	enabled = true,
	children,
	emptyDescription,
	actions,
	columnVisibility,
	onColumnVisibilityChange,
}: TransactionsSectionProps) {
	// The scope + the user's filters — the exact set the rows describe.
	const filters = useMemo<TransactionCountParams>(
		() => composeTransactionFilters(scope, search),
		[scope, search],
	);

	// The URL carries a 1-based page; the SDK list is offset-paginated, so the
	// multiplication happens here — once, for every page that lists transactions.
	const page = search.page ?? 1;

	const listParams = useMemo<TransactionListParams>(
		() => ({
			limit: TRANSACTIONS_PAGE_SIZE,
			offset: pageToOffset(page, TRANSACTIONS_PAGE_SIZE),
			orderBy: "date",
			direction: search.direction ?? "desc",
			...filters,
		}),
		[filters, page, search.direction],
	);

	const transactionsQuery = useQuery({
		...transactionQueries.list(listParams),
		enabled,
	});
	const accountsQuery = useQuery(accountQueries.list());
	// The whole (small) category tree, for the derived-category column's name
	// lookup. Wide limit — a single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));
	// Distinct months come from a scope-scoped scan (minus the month filter
	// itself), so the picker offers only months this page actually spans and
	// doesn't collapse to the one already selected.
	const monthsQuery = useQuery({
		...transactionQueries.list({
			limit: MONTH_SCAN_LIMIT,
			offset: 0,
			...scope,
		}),
		enabled,
	});

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const transactions = (transactionsQuery.data?.items ??
		[]) as readonly Transaction[];
	const total = transactionsQuery.data?.total ?? 0;

	// The issuers *this page* names — its rows' ids, not the issuer table. Reading
	// a page of that table instead is what once rendered a correctly-matched row
	// as unresolved, once the ids outgrew the page (#62).
	const {
		issuersById,
		isPending: issuersPending,
		isError: issuersError,
	} = useIssuerLookup(transactions.map((t) => t.issuerId));

	const accountsById = useMemo(() => indexById(accounts), [accounts]);
	const categoriesById = useMemo(() => indexById(categories), [categories]);

	const months = useMemo(() => {
		const items = (monthsQuery.data?.items ?? []) as readonly Transaction[];
		return [...new Set(items.map((t) => t.importMonth))].sort().reverse();
	}, [monthsQuery.data]);

	const hasFilters =
		search.accountId != null ||
		search.importMonth != null ||
		search.search != null ||
		search.uncurated === true ||
		search.excludedFromRecap != null;

	return (
		<>
			{children}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<TransactionsFilters
					accounts={accounts}
					months={months}
					value={{
						accountId: search.accountId,
						importMonth: search.importMonth,
						search: search.search,
						uncurated: search.uncurated,
						excludedFromRecap: search.excludedFromRecap,
					}}
					onChange={onFiltersChange}
				/>
				{actions}
			</div>

			{transactionsQuery.isError || issuersError ? (
				<Empty
					title="Couldn't load transactions"
					description="Something went wrong reading these transactions. Try again in a moment."
				/>
			) : /* The issuer lookup reads the ids of the rows, so it lands a beat
			      after them. Hold the skeleton until it does: a row rendered before
			      its issuer arrives is a row rendered as *unresolved*, which is the
			      state this whole read exists to prevent. */
			enabled && (transactionsQuery.isPending || issuersPending) ? (
				<TransactionsTableSkeleton />
			) : transactions.length === 0 ? (
				<Empty
					title="No transactions"
					description={
						hasFilters
							? "No transactions match the current filters."
							: (emptyDescription ??
								"There are no transactions to show here yet.")
					}
				/>
			) : (
				<>
					<TransactionsPagination
						position="top"
						page={page}
						pageSize={TRANSACTIONS_PAGE_SIZE}
						total={total}
						onPageChange={onPageChange}
					/>
					<TransactionsTable
						transactions={transactions}
						accountsById={accountsById}
						issuersById={issuersById}
						categoriesById={categoriesById}
						direction={search.direction ?? "desc"}
						onToggleSort={onToggleSort}
						columnVisibility={columnVisibility}
						onColumnVisibilityChange={onColumnVisibilityChange}
					/>
					<TransactionsPagination
						page={page}
						pageSize={TRANSACTIONS_PAGE_SIZE}
						total={total}
						onPageChange={onPageChange}
					/>
				</>
			)}
		</>
	);
}
