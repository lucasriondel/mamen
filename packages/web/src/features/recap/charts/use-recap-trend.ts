import type { Category } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { indexById, NO_ITEMS } from "@/lib/utils";
import type { Period } from "../period";
import { UNASSIGNED_LABEL } from "../spend-rows";
import { type CategoryDelta, type DeltaComparison, toCategoryDeltas } from "./category-deltas";
import { type CompositionSeries, toCompositionSeries } from "./composition-series";
import { type TrendDatum, toTrendSeries } from "./trend-series";
import { bucketsIn, type TrendWindow, toTrendParams, toTrendWindow } from "./trend-window";

/** What {@link useRecapTrend} hands the charts. */
export interface RecapTrendResult {
  /** The window and grain being charted — the charts state it in their subtitle. */
  window: TrendWindow;
  /** Earnings vs spending per bucket, over the window's full axis. */
  series: TrendDatum[];
  /** Spending composed by category, band per category. */
  composition: CompositionSeries;
  /** What moved between the window's last two buckets, or `null` if nothing did. */
  deltas: DeltaComparison | null;
  isPending: boolean;
  isError: boolean;
}

/** Empty comparison state, so a pending render has a stable shape. */
const NO_COMPOSITION: CompositionSeries = { bands: [], data: [] };

/**
 * Load the recap page's charts (issue #113).
 *
 * One request for all three time-based charts: they are three readings of the
 * same scan — totals per bucket, the same spending cut by category, and the
 * change between the last two buckets — so asking for them separately would
 * scan the same rows three times to draw one row of cards.
 *
 * The window is **not** always the page's period: a single month widens to its
 * trailing year, because one bar is not a trend (see {@link toTrendWindow}). The
 * charts say which window they are showing; the lists above them stay scoped to
 * the period exactly.
 *
 * Category names are resolved here, from the same `categories` read the recap's
 * own breakdown uses, so a band and its list row cannot end up called different
 * things.
 */
export function useRecapTrend(period: Period, accountIds: readonly number[]): RecapTrendResult {
  const window = useMemo(() => toTrendWindow(period), [period]);

  const trendQuery = useQuery(transactionQueries.recapTrend(toTrendParams(window, accountIds)));
  const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));

  const categories = (categoriesQuery.data?.items ?? NO_ITEMS) as readonly Category[];
  const categoriesById = useMemo(() => indexById(categories), [categories]);

  const nameFor = useMemo(
    () => (categoryId: number | null) =>
      (categoryId === null ? undefined : categoriesById.get(categoryId)?.name) ?? UNASSIGNED_LABEL,
    [categoriesById],
  );

  const series = useMemo(
    () => toTrendSeries(trendQuery.data?.points ?? [], window),
    [trendQuery.data, window],
  );

  // The axis the composition and the delta share with the series above — derived
  // from the window where it has bounds, and from the data itself for all time.
  const buckets = useMemo(() => {
    const spanned = bucketsIn(window);
    return spanned.length > 0 ? spanned : series.map((datum) => datum.bucket);
  }, [window, series]);

  const composition = useMemo(
    () =>
      trendQuery.data === undefined
        ? NO_COMPOSITION
        : toCompositionSeries(trendQuery.data.byCategory, buckets, nameFor),
    [trendQuery.data, buckets, nameFor],
  );

  const deltas = useMemo(
    () =>
      trendQuery.data === undefined
        ? null
        : toCategoryDeltas(trendQuery.data.byCategory, buckets, nameFor),
    [trendQuery.data, buckets, nameFor],
  );

  return {
    window,
    series,
    composition,
    deltas,
    isPending: trendQuery.isPending || categoriesQuery.isPending,
    isError: trendQuery.isError || categoriesQuery.isError,
  };
}

export type { CategoryDelta };
