import type {
	Account,
	AccountId,
	Category,
	CategoryId,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/format";
import {
	accountQueries,
	categoryQueries,
	issuerQueries,
	type TransactionListParams,
	transactionQueries,
} from "@/lib/sdk";
import { cn, indexById } from "@/lib/utils";
import {
	TRANSACTIONS_PAGE_SIZE,
	type TransactionsSearch,
} from "../transactions/search";
import {
	type TransactionFilterValues,
	TransactionsFilters,
} from "../transactions/transactions-filters";
import { TransactionsPagination } from "../transactions/transactions-pagination";
import { TransactionsTable } from "../transactions/transactions-table";

const routeApi = getRouteApi("/categories/$categoryId");

/** How many transactions to scan when deriving the distinct-month filter options. */
const MONTH_SCAN_LIMIT = 1000;

/**
 * Resolve which category ids a page filters by. A **Category leaf** (has a
 * parent) filters by its own id; a **Category folder** (no parent) merges all of
 * its leaves' ids, so "how much did I spend on Food" is one query rather than
 * mental arithmetic. A missing id (or a folder with no leaves) yields an empty
 * set — the caller shows an empty state rather than querying, since an empty set
 * over the wire would drop the filter and return everything.
 */
function resolveCategoryIds(
	categories: readonly Category[],
	categoryId: number,
): { category: Category | undefined; ids: CategoryId[] } {
	const category = categories.find((c) => c.id === categoryId);
	if (category === undefined) return { category: undefined, ids: [] };
	const ids =
		category.parentId === null
			? categories
					.filter((c) => c.parentId === categoryId)
					.map((c) => c.id as CategoryId)
			: [categoryId as CategoryId];
	return { category, ids };
}

/**
 * A category's transactions page (PRD #19, issue #25). Clicking any node on the
 * categories page opens this: a **Category leaf** shows its own transactions, a
 * **Category folder** shows all of its leaves' transactions merged — each with a
 * **Category total** that follows the view's account/month filters and covers
 * the whole filtered set, not the visible page (ADR 0002).
 *
 * It reuses the transactions table, filters, sort, and pagination wholesale;
 * only the category filter (a set of ids) and the total header are new. The
 * total comes from the `count` response, driven by the same filter object as the
 * list, so the number under the header can never disagree with the rows beneath.
 */
export function CategoryTransactionsView() {
	const { categoryId } = routeApi.useParams();
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const id = Number(categoryId);

	const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const { category, ids } = useMemo(
		() => resolveCategoryIds(categories, id),
		[categories, id],
	);
	const hasSet = ids.length > 0;

	const listParams = useMemo<TransactionListParams>(
		() => ({
			limit: TRANSACTIONS_PAGE_SIZE,
			offset: search.offset ?? 0,
			orderBy: "date",
			direction: search.direction ?? "desc",
			categoryId: ids,
			...(search.accountId != null
				? { accountId: search.accountId as AccountId }
				: {}),
			...(search.importMonth != null
				? { importMonth: search.importMonth }
				: {}),
		}),
		[
			ids,
			search.offset,
			search.direction,
			search.accountId,
			search.importMonth,
		],
	);

	const countParams = useMemo(
		() => ({
			categoryId: ids,
			...(search.accountId != null
				? { accountId: search.accountId as AccountId }
				: {}),
			...(search.importMonth != null
				? { importMonth: search.importMonth }
				: {}),
		}),
		[ids, search.accountId, search.importMonth],
	);

	const transactionsQuery = useQuery({
		...transactionQueries.list(listParams),
		enabled: hasSet,
	});
	// The signed net total over the whole filtered set — from the `count`
	// response, sharing the list's filter object so the two can never disagree.
	const countQuery = useQuery({
		...transactionQueries.count(countParams),
		enabled: hasSet,
	});
	const accountsQuery = useQuery(accountQueries.list());
	const issuersQuery = useQuery(issuerQueries.list());
	// Distinct months come from a category-scoped scan so the month filter offers
	// only months this category actually spans.
	const monthsQuery = useQuery({
		...transactionQueries.list({
			limit: MONTH_SCAN_LIMIT,
			offset: 0,
			categoryId: ids,
		}),
		enabled: hasSet,
	});

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];
	const transactions = (transactionsQuery.data?.items ??
		[]) as readonly Transaction[];
	const total = transactionsQuery.data?.total ?? 0;
	const categoryTotal = countQuery.data?.total ?? 0;

	const accountsById = useMemo(() => indexById(accounts), [accounts]);
	const issuersById = useMemo(() => indexById(issuers), [issuers]);
	const categoriesById = useMemo(() => indexById(categories), [categories]);

	const months = useMemo(() => {
		const items = (monthsQuery.data?.items ?? []) as readonly Transaction[];
		return [...new Set(items.map((t) => t.importMonth))].sort().reverse();
	}, [monthsQuery.data]);

	const applyFilters = (patch: TransactionFilterValues) => {
		navigate({
			search: (prev: TransactionsSearch) => ({ ...prev, ...patch, offset: 0 }),
		});
	};

	const toggleSort = () => {
		navigate({
			search: (prev: TransactionsSearch) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
				offset: 0,
			}),
		});
	};

	const goToOffset = (offset: number) => {
		navigate({ search: (prev: TransactionsSearch) => ({ ...prev, offset }) });
	};

	// The tree has loaded but the id names nothing (or a folder with no leaves):
	// there is nothing to show, and querying with an empty set would return the
	// whole table.
	if (!categoriesQuery.isPending && (category === undefined || !hasSet)) {
		return (
			<section className="flex flex-col gap-6">
				<Link to="/categories" className="text-muted text-sm hover:text-ink">
					← Categories
				</Link>
				<Empty
					title="Category not found"
					description="This category has no transactions to show. It may have been removed."
				/>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-col gap-2">
				<Link to="/categories" className="text-muted text-sm hover:text-ink">
					← Categories
				</Link>
				<div className="flex items-baseline justify-between gap-4">
					<h1 className="flex items-center gap-2 font-semibold text-2xl text-ink">
						{category?.icon ? <span aria-hidden>{category.icon}</span> : null}
						<span>{category?.name ?? "Category"}</span>
					</h1>
					{/* `<output>` (an implicit live region) both carries the label a
					    generic span cannot and announces the total when the filters
					    change it — the computed result of the view's filters. */}
					<output
						aria-label="Category total"
						className={cn(
							"font-medium text-xl tabular-nums",
							categoryTotal < 0 && "text-high",
							categoryTotal > 0 && "text-low",
						)}
					>
						{formatCurrency(categoryTotal)}
					</output>
				</div>
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
					description="Something went wrong reading this category's transactions. Try again in a moment."
				/>
			) : transactionsQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading transactions…</p>
			) : transactions.length === 0 ? (
				<Empty
					title="No transactions"
					description="No transactions match the current filters."
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
