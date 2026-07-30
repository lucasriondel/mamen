import { getRouteApi } from "@tanstack/react-router";
import { ColumnsToggle } from "./columns-toggle";
import type { TransactionFilterValues } from "./transactions-filters";
import { TransactionsSection } from "./transactions-section";
import { useColumnVisibility } from "./use-column-visibility";

const routeApi = getRouteApi("/transactions");

/** Stable identity for the unscoped view, so the filter memo doesn't rerun. */
const EMPTY_SCOPE = {};

/**
 * Transactions view — the app's landing surface (PRD #4).
 *
 * A paginated, account/month/text-filterable, date-sortable table. Filters and
 * sort live in the route's typed URL search params, so the view is bookmarkable
 * and survives a refresh; changing any of them changes the query key and
 * refetches. The table, filters, and pagination come from
 * {@link TransactionsSection}, shared with the category and issuer drill-downs —
 * this view is the *unscoped* one, so it passes an empty scope and adds the
 * columns toggle no scoped page offers.
 */
export function TransactionsView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const {
		columnVisibility,
		setColumnVisibility,
		reset: showAllColumns,
	} = useColumnVisibility();

	const applyFilters = (patch: TransactionFilterValues) => {
		navigate({ search: (prev) => ({ ...prev, ...patch, offset: 0 }) });
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
			<TransactionsSection
				scope={EMPTY_SCOPE}
				search={search}
				onFiltersChange={applyFilters}
				onToggleSort={toggleSort}
				onOffsetChange={goToOffset}
				emptyDescription="Import a bank statement to see your transactions here."
				columnVisibility={columnVisibility}
				onColumnVisibilityChange={setColumnVisibility}
				actions={
					<ColumnsToggle
						columnVisibility={columnVisibility}
						onToggle={(columnId, visible) =>
							setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }))
						}
						onReset={showAllColumns}
					/>
				}
			>
				<header>
					<h1 className="text-balance text-2xl font-semibold text-gousse-ink">
						Transactions
					</h1>
				</header>
			</TransactionsSection>
		</section>
	);
}
