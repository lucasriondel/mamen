import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Period } from "../period";
import type { SpendRow } from "../spend-rows";
import { CategoryDeltaChart } from "./category-delta-chart";
import { ChartCard } from "./chart-card";
import { CompositionChart } from "./composition-chart";
import { EarningsTrendChart } from "./earnings-trend-chart";
import { SpendDonut } from "./spend-donut";
import { useRecapTrend } from "./use-recap-trend";

export interface RecapChartsProps {
  period: Period;
  accountIds: readonly number[];
  /** The by-issuer rows, for that donut. */
  byIssuer: readonly SpendRow[];
  /** The by-category rows, for that donut. */
  byCategory: readonly SpendRow[];
}

/**
 * The recap's chart row (issue #113) — the page's visual half, above its lists.
 *
 * Four charts, each answering a question the totals cannot:
 *
 * - two **donuts**, the share of the period's spending by category and by
 *   issuer — the "did one thing dominate?" read;
 * - the **trend**, earnings against spending across the window;
 * - the **composition**, how the spending mix drifted bucket to bucket;
 * - the **movers**, which categories changed since the previous bucket.
 *
 * The donuts read the same rows the lists below them do, so no request is made
 * for them; the three time-based charts share one trend request.
 *
 * A chart failing is not a page failure: the lists carry every figure, so a
 * broken chart row degrades to an inline message rather than taking the recap
 * down with it.
 */
export function RecapCharts({ period, accountIds, byIssuer, byCategory }: RecapChartsProps) {
  const { window, series, composition, deltas, isPending, isError } = useRecapTrend(
    period,
    accountIds,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Share by category" subtitle="Where this period's money went">
          <SpendDonut rows={byCategory} axis="category" period={period} accountIds={accountIds} />
        </ChartCard>
        <ChartCard title="Share by issuer" subtitle="Who this period's money went to">
          <SpendDonut rows={byIssuer} axis="issuer" period={period} accountIds={accountIds} />
        </ChartCard>
      </div>

      {isError ? (
        <Empty
          title="Couldn't load your trends"
          description="The totals above are unaffected. Try again in a moment."
        />
      ) : isPending ? (
        <TrendSkeletons />
      ) : (
        <>
          <ChartCard title="Earnings and spending" subtitle={window.label}>
            <EarningsTrendChart series={series} />
          </ChartCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="What it was spent on" subtitle={window.label}>
              <CompositionChart series={composition} />
            </ChartCard>
            <ChartCard
              title="What changed"
              subtitle={
                deltas ? `${deltas.current} vs ${deltas.previous}` : "Needs two periods to compare"
              }
            >
              {deltas ? (
                <CategoryDeltaChart comparison={deltas} />
              ) : (
                <p className="py-6 text-center text-sm text-gousse-muted">
                  Nothing moved between these periods.
                </p>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

/** The chart row's loading state — the same frames, holding their space. */
function TrendSkeletons() {
  return (
    <div className="flex flex-col gap-6">
      <ChartCard title="Earnings and spending">
        <Skeleton className="h-64 w-full" />
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="What it was spent on">
          <Skeleton className="h-64 w-full" />
        </ChartCard>
        <ChartCard title="What changed">
          <Skeleton className="h-48 w-full" />
        </ChartCard>
      </div>
    </div>
  );
}
