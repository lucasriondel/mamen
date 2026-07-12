import type {
	Account,
	AccountId,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import {
	accountQueries,
	issuerQueries,
	type TransactionListParams,
	transactionQueries,
} from "@/lib/sdk";
import { TRANSACTIONS_PAGE_SIZE, type TransactionsSearch } from "./search";
import {
	type TransactionFilterValues,
	TransactionsFilters,
} from "./transactions-filters";
import { TransactionsPagination } from "./transactions-pagination";
import { TransactionsTable } from "./transactions-table";

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
	};
}

/** Index a list of `{ id }` entities by their numeric id for O(1) cell lookups. */
function indexById<T extends { id: number }>(
	items: readonly T[],
): Map<number, T> {
	return new Map(items.map((item) => [item.id, item]));
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

	const transactionsQuery = useQuery(transactionQueries.list(listParams));
	const accountsQuery = useQuery(accountQueries.list());
	const issuersQuery = useQuery(issuerQueries.list());
	// Distinct months come from a wide unfiltered scan — the contract has no
	// distinct-month endpoint and a single user's history is small (PRD).
	const monthsQuery = useQuery(
		transactionQueries.list({ limit: MONTH_SCAN_LIMIT, offset: 0 }),
	);

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];
	const transactions = (transactionsQuery.data?.items ??
		[]) as readonly Transaction[];
	const total = transactionsQuery.data?.total ?? 0;

	const accountsById = useMemo(() => indexById(accounts), [accounts]);
	const issuersById = useMemo(() => indexById(issuers), [issuers]);

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
				<h1 className="text-2xl font-semibold text-ink">Transactions</h1>
			</header>

			<TransactionsFilters
				accounts={accounts}
				months={months}
				value={{ accountId: search.accountId, importMonth: search.importMonth }}
				onChange={applyFilters}
			/>

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
						search.accountId != null || search.importMonth != null
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
						direction={search.direction ?? "desc"}
						onToggleSort={toggleSort}
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
