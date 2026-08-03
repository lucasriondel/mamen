import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { Empty } from "@/components/ui/empty";
import {
	descendantIds,
	isFolder,
	resolveCategoryColor,
} from "@/lib/category-tree";
import { formatCurrency } from "@/lib/format";
import {
	categoryQueries,
	type TransactionCountParams,
	transactionQueries,
} from "@/lib/sdk";
import { cn } from "@/lib/utils";
import type { TransactionsSearch } from "../transactions/search";
import type { TransactionFilterValues } from "../transactions/transactions-filters";
import {
	composeTransactionFilters,
	TransactionsSection,
} from "../transactions/transactions-section";

const routeApi = getRouteApi("/categories/$categoryId");

/**
 * Resolve which category ids a page filters by. A **Category leaf** (childless)
 * filters by its own id; a **Category folder** (has children, at any depth)
 * merges all of its leaves' ids, so "how much did I spend on Food" is one query
 * rather than mental arithmetic. The folder test is childlessness, not root-ness
 * (ADR 0003 / issue #32), so a *nested* folder page merges its subtree too
 * rather than reading as a leaf and showing its own (empty) rows. A missing id
 * (or a folder with no leaves) yields an empty set — the caller shows an empty
 * state rather than querying, since an empty set over the wire would drop the
 * filter and return everything.
 */
function resolveCategoryIds(
	categories: readonly Category[],
	categoryId: number,
): { category: Category | undefined; ids: CategoryId[] } {
	const category = categories.find((c) => c.id === categoryId);
	if (category === undefined) return { category: undefined, ids: [] };
	const ids = isFolder(categories, category)
		? descendantIds(categories, categoryId)
		: [categoryId as CategoryId];
	return { category, ids };
}

/**
 * A category's transactions page (PRD #19, issue #25). Clicking any node on the
 * categories page opens this: a **Category leaf** shows its own transactions, a
 * **Category folder** shows all of its leaves' transactions merged — each with a
 * **Category total** that follows the view's account/month/search filters and
 * covers the whole filtered set, not the visible page (ADR 0002).
 *
 * It reuses {@link TransactionsSection} wholesale — the same table, filters,
 * sort, and pagination as the global view; only the category scope (a set of
 * ids) and the total header are new. The total comes from the `count` response
 * driven by the same filter object as the list, so the number under the header
 * can never disagree with the rows beneath.
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

	const scope = useMemo<TransactionCountParams>(
		() => ({ categoryId: ids }),
		[ids],
	);

	// The signed net total over the whole filtered set — from the `count`
	// response, sharing the section's scope + filters so the two can never
	// disagree about which rows they describe.
	const countFilters = useMemo(
		() => composeTransactionFilters(scope, search),
		[scope, search],
	);
	const countQuery = useQuery({
		...transactionQueries.count(countFilters),
		enabled: hasSet,
	});
	const categoryTotal = countQuery.data?.total ?? 0;

	const applyFilters = (patch: TransactionFilterValues) => {
		navigate({
			search: (prev: TransactionsSearch) => ({ ...prev, ...patch, page: 1 }),
		});
	};

	const toggleSort = () => {
		navigate({
			search: (prev: TransactionsSearch) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
				page: 1,
			}),
		});
	};

	const goToPage = (page: number) => {
		navigate({ search: (prev: TransactionsSearch) => ({ ...prev, page }) });
	};

	// The tree has loaded but the id names nothing (or a folder with no leaves):
	// there is nothing to show, and querying with an empty set would return the
	// whole table.
	if (!categoriesQuery.isPending && (category === undefined || !hasSet)) {
		return (
			<section className="flex flex-col gap-6">
				<Link
					to="/categories"
					className="text-gousse-muted text-sm hover:text-gousse-ink"
				>
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
			<TransactionsSection
				scope={scope}
				search={search}
				enabled={hasSet}
				onFiltersChange={applyFilters}
				onToggleSort={toggleSort}
				onPageChange={goToPage}
				emptyDescription="No transactions are categorised here yet."
			>
				<CategoryHeader
					category={category}
					categories={categories}
					total={categoryTotal}
				/>
			</TransactionsSection>
		</section>
	);
}

interface CategoryHeaderProps {
	category: Category | undefined;
	/** The whole tree — a nested category's colour is inherited from an ancestor. */
	categories: readonly Category[];
	/** The signed net over the whole filtered set (not just the visible page). */
	total: number;
}

/** The back link, the category's icon + name, and its filter-following total. */
function CategoryHeader({ category, categories, total }: CategoryHeaderProps) {
	return (
		<header className="flex flex-col gap-2">
			<Link
				to="/categories"
				className="text-gousse-muted text-sm hover:text-gousse-ink"
			>
				← Categories
			</Link>
			<div className="flex items-baseline justify-between gap-4">
				<h1 className="flex items-center gap-2 text-balance font-semibold text-2xl text-gousse-ink">
					{category ? (
						<CategoryIcon
							name={category.icon}
							color={resolveCategoryColor(categories, category)}
							size={22}
						/>
					) : null}
					<span>{category?.name ?? "Category"}</span>
				</h1>
				{/* `<output>` (an implicit live region) both carries the label a
				    generic span cannot and announces the total when the filters
				    change it — the computed result of the view's filters. */}
				<output
					aria-label="Category total"
					className={cn(
						"font-medium text-xl tabular-nums",
						total < 0 && "text-gousse-high",
						total > 0 && "text-gousse-low",
					)}
				>
					{formatCurrency(total)}
				</output>
			</div>
		</header>
	);
}
