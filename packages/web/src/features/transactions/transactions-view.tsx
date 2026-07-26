import type {
	Account,
	AccountId,
	Category,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import {
	accountQueries,
	categoryQueries,
	issuerQueries,
	type TransactionListParams,
	transactionQueries,
} from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { ColumnsToggle } from "./columns-toggle";
import { TRANSACTIONS_PAGE_SIZE, type TransactionsSearch } from "./search";
import {
	type TransactionFilterValues,
	TransactionsFilters,
} from "./transactions-filters";
import { TransactionsPagination } from "./transactions-pagination";
import { TransactionsTable } from "./transactions-table";
import { useColumnVisibility } from "./use-column-visibility";

const routeApi = getRouteApi("/transactions");

/** How many transactions to scan when deriving the distinct-month filter options. */
const MONTH_SCAN_LIMIT = 1000;

/** Build the SDK `list` filter object from the route's typed search params. */
function toListParams(search: TransactionsSearch): TransactionListParams {
	return {
		limit: TRANSACTIONS_PAGE_SIZE,
		offset: search.offset ?? 0,
		orderBy: "date",
		direction: search.direction ?? "desc",
		...(search.accountId != null
			? { accountId: search.accountId as AccountId }
			: {}),
		...(search.importMonth != null ? { importMonth: search.importMonth } : {}),
		...(search.search != null ? { search: search.search } : {}),
	};
}

/**
 * Transactions view — the app's landing surface (PRD #4).
 *
 * A paginated, account/month-filterable, date-sortable table read from the SDK
 * `list` query. Filters and sort live in the route's typed URL search params, so
 * the view is bookmarkable and survives a refresh; changing any of them changes
 * the query key and refetches. This slice loads via the component's own queries
 * (not a Router loader) so a read failure shows an inline `Empty` state.
 */
export function TransactionsView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const listParams = useMemo(() => toListParams(search), [search]);

	const {
		columnVisibility,
		setColumnVisibility,
		reset: showAllColumns,
	} = useColumnVisibility();

	const transactionsQuery = useQuery(transactionQueries.list(listParams));
	const accountsQuery = useQuery(accountQueries.list());
	const issuersQuery = useQuery(issuerQueries.list());
	// The whole (small) category tree, for the derived-category column's name
	// lookup. Wide limit — a single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));
	// Distinct months come from a wide unfiltered scan — the contract has no
	// distinct-month endpoint and a single user's history is small (PRD).
	const monthsQuery = useQuery(
		transactionQueries.list({ limit: MONTH_SCAN_LIMIT, offset: 0 }),
	);

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const transactions = (transactionsQuery.data?.items ??
		[]) as readonly Transaction[];
	const total = transactionsQuery.data?.total ?? 0;

	const accountsById = useMemo(() => indexById(accounts), [accounts]);
	const issuersById = useMemo(() => indexById(issuers), [issuers]);
	const categoriesById = useMemo(() => indexById(categories), [categories]);

	const months = useMemo(() => {
		const items = (monthsQuery.data?.items ?? []) as readonly Transaction[];
		return [...new Set(items.map((t) => t.importMonth))].sort().reverse();
	}, [monthsQuery.data]);

	const applyFilters = (patch: TransactionFilterValues) => {
		navigate({
			search: (prev) => ({ ...prev, ...patch, offset: 0 }),
		});
	};

	const toggleSort = () => {
		navigate({
			search: (prev) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
				offset: 0,
			}),
		});
	};

	const goToOffset = (offset: number) => {
		navigate({ search: (prev) => ({ ...prev, offset }) });
	};

	return (
		<section className="flex flex-col gap-6">
			<header>
				<h1 className="text-balance text-2xl font-semibold text-ink">
					Transactions
				</h1>
			</header>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<TransactionsFilters
					accounts={accounts}
					months={months}
					value={{
						accountId: search.accountId,
						importMonth: search.importMonth,
						search: search.search,
					}}
					onChange={applyFilters}
				/>
				<ColumnsToggle
					columnVisibility={columnVisibility}
					onToggle={(columnId, visible) =>
						setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }))
					}
					onReset={showAllColumns}
				/>
			</div>

			{transactionsQuery.isError ? (
				<Empty
					title="Couldn't load transactions"
					description="Something went wrong reading your transactions. Try again in a moment."
				/>
			) : transactionsQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading transactions…</p>
			) : transactions.length === 0 ? (
				<Empty
					title="No transactions"
					description={
						search.accountId != null ||
						search.importMonth != null ||
						search.search != null
							? "No transactions match the current filters."
							: "Import a bank statement to see your transactions here."
					}
				/>
			) : (
				<>
					<TransactionsTable
						transactions={transactions}
						accountsById={accountsById}
						issuersById={issuersById}
						categoriesById={categoriesById}
						direction={search.direction ?? "desc"}
						onToggleSort={toggleSort}
						columnVisibility={columnVisibility}
						onColumnVisibilityChange={setColumnVisibility}
					/>
					<TransactionsPagination
						offset={search.offset ?? 0}
						pageSize={TRANSACTIONS_PAGE_SIZE}
						total={total}
						onOffsetChange={goToOffset}
					/>
				</>
			)}
		</section>
	);
}
