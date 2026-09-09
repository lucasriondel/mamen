import type { Transaction, TransactionId } from "@mamen/shared/contract";
import { getRouteApi } from "@tanstack/react-router";
import { PageLayout } from "@/components/page-layout";
import { useMediaQuery } from "@/lib/use-media-query";
import { ColumnsToggle } from "./columns-toggle";
import { TransactionDetailPanel } from "./transaction-detail-panel";
import type { TransactionFilterValues } from "./transactions-filters";
import { TransactionsSection } from "./transactions-section";
import { useColumnVisibility } from "./use-column-visibility";

const routeApi = getRouteApi("/transactions");

/** Stable identity for the unscoped view, so the filter memo doesn't rerun. */
const EMPTY_SCOPE = {};

/**
 * The width at which there is room for a **detail panel** beside the table:
 * Tailwind's `xl` (1280px). Below it the table has the page to itself and a row
 * click goes to the standalone detail page instead (issue #154) — which is why
 * this is a media *query* and not just a CSS class: the click handler has to
 * know which of the two it is doing.
 */
const PANEL_FITS = "(min-width: 1280px)";

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
 * It is also the only view with a **detail panel** (issue #154): a row opens
 * beside the table rather than in place of the whole page, so curating a list is
 * a loop within one screen. The open row is `selected` in the URL — the panel is
 * a place, so it is linkable, reloadable and something back navigates out of —
 * and it is deliberately *not* a filter: it enters no query key and resets no
 * page, so opening, swapping and closing the panel leave the list exactly as it
 * was.
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

  const panelFits = useMediaQuery(PANEL_FITS);
  // A panel needs both a row to show and the room to show it in. A `selected`
  // that outlives a resize — or arrives in a link opened on a phone — draws no
  // panel and is left in the URL untouched, so widening the window brings it
  // back rather than having quietly dropped it.
  const selectedId = panelFits ? search.selected : undefined;

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

  // Opening a row writes one search param and touches nothing else: same path,
  // same filters, same page, so the list is neither unmounted nor refetched.
  const openInPanel = (transaction: Transaction) => {
    navigate({ search: (prev) => ({ ...prev, selected: transaction.id }) });
  };

  const closePanel = () => {
    navigate({ search: ({ selected: _closed, ...rest }) => rest });
  };

  return (
    <PageLayout title="Transactions">
      {/* The table and the panel side by side. `items-start` so the panel is as
          tall as its own content and can stick, rather than stretching to the
          height of a fifty-row table. */}
      <div className="flex items-start gap-6">
        {/* `min-w-0`: without it the table's horizontal scroller refuses to
            shrink and pushes the panel off the end of the page. */}
        <div className="min-w-0 flex-1">
          <TransactionsSection
            scope={EMPTY_SCOPE}
            search={search}
            onFiltersChange={applyFilters}
            onToggleSort={toggleSort}
            onPageChange={goToPage}
            emptyDescription="Import a bank statement to see your transactions here."
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            // Withheld where no panel fits, which is what makes the table fall
            // back to navigating to `/transactions/$transactionId` there.
            onOpenTransaction={panelFits ? openInPanel : undefined}
            selectedId={selectedId}
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
        </div>
        {selectedId != null ? (
          <TransactionDetailPanel
            // Keyed by the row: moving to the next one starts the panel's own
            // state fresh (a half-typed note, an open picker) rather than
            // carrying it onto a different transaction. The table is untouched
            // either way — only this column remounts.
            key={selectedId}
            transactionId={selectedId as TransactionId}
            onClose={closePanel}
          />
        ) : null}
      </div>
    </PageLayout>
  );
}
