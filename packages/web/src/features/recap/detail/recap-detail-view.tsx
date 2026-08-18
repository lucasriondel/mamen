import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageLayout } from "@/components/page-layout";
import { Empty } from "@/components/ui/empty";
import type { TransactionFilterValues } from "@/features/transactions/transactions-filters";
import {
  composeTransactionFilters,
  TransactionsSection,
} from "@/features/transactions/transactions-section";
import { formatCurrency } from "@/lib/format";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { type RecapSearch, toPeriod } from "../search";
import { BucketGlyph } from "./bucket-glyph";
import { toDetailScope } from "./detail-scope";
import { accountsLabel, periodLabel, targetLabel } from "./scope-labels";
import { type RecapDetailSearch, toDetailTarget } from "./search";
import { useBucketIdentity } from "./use-bucket-identity";

const routeApi = getRouteApi("/recap-detail");

/**
 * The **recap detail** page (issue #86) — one recap line, opened up.
 *
 * The recap answers *how much*, per issuer and per category; this answers *which
 * transactions*. It is the same table, filter bar, sort and pagination every other
 * transactions surface uses ({@link TransactionsSection}), scoped to the line the
 * user clicked over the recap's own period and account selection
 * ({@link toDetailScope}) — so the rows here are the rows that line summed.
 *
 * One kind of line opens it: a **bucket** on either breakdown. The recap's two
 * summary lines — internal transfers and excluded-from-recap — go straight to
 * `/transactions` instead, since neither is a slice of the spend and both are
 * expressible there as ordinary filter values the user can see and widen.
 *
 * The scope is pinned, not editable: period and accounts arrive in the URL from
 * the recap and are stated in the header, because changing them would quietly make
 * this a different row's page. What the user *can* change is everything the
 * transactions view lets them change — including widening the recap-exclusion
 * filter the link seeds at `false`, to see what was held out of the total.
 */
export function RecapDetailView() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // Everything the URL pins — the target, the period, the accounts, and the scope
  // they compose into — derived in ONE memo keyed on `search`. The scope object's
  // identity is a query key downstream (the section memoizes its filters on it),
  // so rebuilding it each render would refetch the table on every render.
  const { target, period, accountIds, scope } = useMemo(() => {
    // `today` drives the current-month/year default, exactly as on the recap.
    const pinnedPeriod = toPeriod(search, new Date());
    const pinnedAccountIds = search.accountIds ?? [];
    const pinnedTarget = toDetailTarget(search);
    return {
      target: pinnedTarget,
      period: pinnedPeriod,
      accountIds: pinnedAccountIds,
      scope:
        pinnedTarget === undefined
          ? undefined
          : toDetailScope(pinnedTarget, pinnedPeriod, pinnedAccountIds),
    };
  }, [search]);

  const identity = useBucketIdentity(target);

  const accountsQuery = useQuery(accountQueries.list());
  const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];

  // The signed net over the whole filtered set — from the `count` response,
  // sharing the section's scope + filters so the two can never disagree about
  // which rows they describe.
  const countFilters = useMemo(
    () => composeTransactionFilters(scope ?? {}, search),
    [scope, search],
  );
  const countQuery = useQuery({
    ...transactionQueries.count(countFilters),
    enabled: scope !== undefined,
  });

  const applyFilters = (patch: TransactionFilterValues) => {
    navigate({
      search: (prev: RecapDetailSearch) => ({ ...prev, ...patch, page: 1 }),
    });
  };

  const toggleSort = () => {
    navigate({
      search: (prev: RecapDetailSearch) => ({
        ...prev,
        direction: prev.direction === "asc" ? "desc" : "asc",
        page: 1,
      }),
    });
  };

  const goToPage = (page: number) => {
    navigate({ search: (prev: RecapDetailSearch) => ({ ...prev, page }) });
  };

  // The URL names no usable bucket — a hand-edited link, or an old `?excluded=true`
  // one from when the excluded summary opened this page. There is nothing to scope
  // by, and querying unscoped would show the whole table under a header claiming
  // to be one line's rows.
  // The way back carries the recap's own search verbatim, so returning lands on
  // the view the user left rather than the current-month default.
  const backToRecap = (
    <RecapBackLink
      search={{
        period: search.period,
        month: search.month,
        year: search.year,
        accountIds: search.accountIds,
      }}
    />
  );

  if (target === undefined || scope === undefined) {
    return (
      // The page is normally titled by the bucket it drills into; with no
      // bucket to name, it is titled by what it is — and still carries the
      // topbar, so a collapsed sidebar can be re-opened from the dead end too.
      <PageLayout title="Recap detail" back={backToRecap}>
        <Empty
          title="Nothing to show"
          description="This link doesn't name an issuer or a category. Open a line from the recap to see its transactions."
        />
      </PageLayout>
    );
  }

  const total = countQuery.data?.total ?? 0;

  return (
    <PageLayout
      back={backToRecap}
      title={
        <>
          <BucketGlyph axis={target.axis} identity={identity} />
          <span className="truncate">{identity.name}</span>
        </>
      }
      // The scope is *stated*, not offered as controls: period and accounts are
      // what make this page this recap line's drill-down, so changing them here
      // would quietly turn it into a different line's page.
      description={
        <span className="text-sm">
          {targetLabel(target)} · {periodLabel(period)} · {accountsLabel(accountIds, accounts)}
        </span>
      }
      // `<output>` (an implicit live region) both carries the label a generic
      // span cannot and announces the total when the filters change it — the
      // computed result of the view's filters, beside the bucket it totals.
      actions={
        <output
          aria-label="Detail total"
          className={cn(
            "shrink-0 font-medium text-xl tabular-nums",
            total < 0 && "text-gousse-high",
            total > 0 && "text-gousse-low",
          )}
        >
          {formatCurrency(total)}
        </output>
      }
    >
      <TransactionsSection
        scope={scope}
        search={search}
        onFiltersChange={applyFilters}
        onToggleSort={toggleSort}
        onPageChange={goToPage}
        emptyDescription="Nothing counted toward this recap row in the period."
      />
    </PageLayout>
  );
}

/** The way back to the recap — the same link on the page and on its dead end. */
function RecapBackLink({ search }: { search: RecapSearch }) {
  return (
    <Link
      to="/recap"
      search={search}
      className="self-start text-gousse-muted text-sm hover:text-gousse-ink"
    >
      ← Recap
    </Link>
  );
}
