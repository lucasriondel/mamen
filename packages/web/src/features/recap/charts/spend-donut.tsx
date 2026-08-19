import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import { toDetailSearch } from "../detail/detail-link";
import type { RecapDetailAxis } from "../detail/search";
import type { Period } from "../period";
import type { SpendRow } from "../spend-rows";
import { ChartTooltip } from "./chart-tooltip";
import { type DonutSlice, toDonutSlices } from "./donut-slices";

export interface SpendDonutProps {
  /** The section's rows — re-ranked by magnitude for the ring (see `toDonutSlices`). */
  rows: readonly SpendRow[];
  /** Which breakdown this is, for the slice links. */
  axis: RecapDetailAxis;
  period: Period;
  accountIds: readonly number[];
}

/** Share as a whole-number percent — `0.almost-nothing` never rounds to `0%`. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

/**
 * The recap's part-to-whole ring (issue #113) — how a period's spending divides
 * between its biggest buckets.
 *
 * A donut is a *glance* chart: it answers "did one thing dominate?" and nothing
 * finer, because comparing two similar arcs by eye is genuinely hard. It is
 * therefore shown **beside** its section's sorted list rather than instead of
 * it — the ring gives the shape, the list gives the figures, and no number here
 * is reachable only by hovering.
 *
 * Everything past the fifth bucket folds into one **Other** arc rather than
 * being dropped or given a generated hue: the arcs still sum to the section's
 * stated total, and the palette's eight validated hues are never cycled.
 *
 * Each named arc links to the same detail page its list row does. **Other**
 * doesn't — it stands for several buckets, so there is no one page it could
 * honestly open.
 */
export function SpendDonut({ rows, axis, period, accountIds }: SpendDonutProps) {
  const slices = useMemo(() => toDonutSlices(rows), [rows]);
  const total = useMemo(() => slices.reduce((sum, slice) => sum + slice.value, 0), [slices]);

  if (slices.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gousse-muted">No spending in this period.</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices as DonutSlice[]}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              // A 2px surface gap between arcs, never a stroke around them: the
              // separator is the panel showing through, so it stays correct in
              // both themes without a border competing with the fill.
              paddingAngle={1.5}
              stroke="rgb(var(--gousse-panel))"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip cursor={false} content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* The hole carries the total — the one figure the ring itself cannot
            show, and the number every arc is a share of. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold tabular-nums text-gousse-ink">
            {formatCurrency(total, { signDisplay: false })}
          </span>
          <span className="text-[11px] text-gousse-muted">total</span>
        </div>
      </div>

      <DonutLegend slices={slices} axis={axis} period={period} accountIds={accountIds} />
    </div>
  );
}

/**
 * The ring's hover readout — one slice, its share and its transaction count.
 * Recharts clones this element with the hovered payload, so it takes those as
 * optional props rather than closing over the chart's state.
 */
function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DonutSlice }>;
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;
  return (
    <ChartTooltip
      title={slice.name}
      entries={[
        {
          label: `${formatShare(slice.share)} of spending`,
          value: slice.value,
          color: slice.color,
          hint: `${slice.count} ${slice.count === 1 ? "transaction" : "transactions"}`,
        },
      ]}
    />
  );
}

type DonutLegendProps = {
  slices: readonly DonutSlice[];
  axis: RecapDetailAxis;
  period: Period;
  accountIds: readonly number[];
};

/**
 * The ring's legend — always present, and carrying each arc's **share as a
 * number**.
 *
 * This is the ring's *relief*: three of the light-mode hues sit below 3:1 against
 * the panel, and a share read off an arc is a guess in any case, so identity and
 * magnitude are both stated in text here rather than left to colour alone.
 */
function DonutLegend({ slices, axis, period, accountIds }: DonutLegendProps) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch">
      {slices.map((slice) => {
        const label = (
          <>
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.name}</span>
            <span className="shrink-0 tabular-nums text-gousse-muted">
              {formatShare(slice.share)}
            </span>
            <span className="w-20 shrink-0 text-right font-medium tabular-nums text-gousse-ink">
              {formatCurrency(slice.value, { signDisplay: false })}
            </span>
          </>
        );

        return (
          <li key={slice.key}>
            {slice.row ? (
              <Link
                to="/recap-detail"
                search={toDetailSearch(axis, slice.row.id, period, accountIds)}
                className="-mx-2 flex items-center gap-2 rounded-full px-2 py-1 text-sm text-gousse-ink transition-colors hover:bg-gousse-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
              >
                {label}
              </Link>
            ) : (
              // "Other" stands for several buckets — nothing to open.
              <span className="-mx-2 flex items-center gap-2 px-2 py-1 text-sm text-gousse-muted">
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
