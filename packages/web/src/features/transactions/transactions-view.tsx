import { getRouteApi } from "@tanstack/react-router";
import { PageLayout } from "@/components/page-layout";
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
 *
 * The columns toggle is handed to the section, not to {@link PageLayout}'s
 * actions slot, even though it is this page's only page-level control: it sits
 * on the filter bar because it *is* one of them — it narrows what the table
 * shows, beside the filters that narrow which rows it shows. Issue #125 asked
 * for the title row to move and for the page to look exactly as it did, and
 * lifting the toggle into the topbar is neither.
 */
export function TransactionsView() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const { columnVisibility, setColumnVisibility, reset: showAllColumns } = useColumnVisibility();

  const applyFilters = (patch: TransactionFilterValues) => {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  };

  const toggleSort = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        direction: prev.direction === "asc" ? "desc" : "asc",
        page: 1,
      }),
    });
  };

  const goToPage = (page: number) => {
    navigate({ search: (prev) => ({ ...prev, page }) });
  };

  return (
    <PageLayout title="Transactions">
      <TransactionsSection
        scope={EMPTY_SCOPE}
        search={search}
        onFiltersChange={applyFilters}
        onToggleSort={toggleSort}
        onPageChange={goToPage}
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
      />
    </PageLayout>
  );
}
