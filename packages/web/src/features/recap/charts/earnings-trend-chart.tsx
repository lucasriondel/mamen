import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMonth } from "@/lib/format";
import { AXIS_COLOR, EARNED_COLOR, GRID_COLOR, SPENT_COLOR } from "./chart-palette";
import { ChartTooltip } from "./chart-tooltip";
import { type TrendDatum, sumTrend } from "./trend-series";

export interface EarningsTrendChartProps {
  series: readonly TrendDatum[];
}

/** Axis ticks are compact — `1.2k` beats `1 200,00 €` on a crowded axis. */
function formatAxisMoney(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return `${Math.round(magnitude / 100) / 10}k`;
  return String(Math.round(magnitude));
}

/**
 * Earnings against spending over time (issue #113) — the recap's one chart of
 * money **in** as well as out.
 *
 * Drawn as a **diverging** pair around a zero baseline: earnings up, spending
 * down. Two deliberate choices there.
 *
 * The first is that it is not a dual-axis chart. Both series are euros, so they
 * share one scale, and a reader comparing a bar above the line to one below it is
 * comparing like with like. (Two y-scales would let the chart invent a
 * relationship that is not in the data — the axis alignment would be arbitrary.)
 *
 * The second is that earnings and spending are not stacked or netted. A net
 * collapses the two facts the chart exists to show into one that hides both: a
 * month of 3000 in / 2900 out and a month of 100 in / 0 out net identically and
 * are nothing alike. The net is still *shown* — as a per-bucket figure in the
 * tooltip and a total in the header — but it is derived from two visible bars
 * rather than replacing them.
 *
 * Bars whose net is negative are marked in the tooltip rather than recoloured:
 * the two hues mean *direction* (in vs out) and must keep meaning only that. A
 * third colour for "overspent" would collide with that reading, and the gousse
 * status ramp is reserved for genuine good/bad besides.
 */
export function EarningsTrendChart({ series }: EarningsTrendChartProps) {
  const totals = useMemo(() => sumTrend(series), [series]);

  if (series.length === 0) {
    return <p className="py-6 text-center text-sm text-gousse-muted">Nothing in this window.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The legend, always present — and doubling as the window's totals, so
          identity is carried by text beside each key rather than by hue alone. */}
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <LegendKey color={EARNED_COLOR} label="Earned" value={totals.earned} />
        <LegendKey color={SPENT_COLOR} label="Spent" value={totals.spent} />
        <li className="text-gousse-muted">
          Net{" "}
          <span className="font-medium tabular-nums text-gousse-ink">
            {formatCurrency(totals.net)}
          </span>
        </li>
      </ul>

      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series as TrendDatum[]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            {/* Horizontal rules only, solid hairlines: vertical gridlines on a
                categorical axis fence the bars without helping anyone read one. */}
            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
            <XAxis
              dataKey="bucket"
              tickFormatter={formatMonth}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              // A long window would collide its own labels; recharts drops
              // every other tick rather than overlapping them.
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              tickFormatter={formatAxisMoney}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              width={44}
            />
            {/* Zero is the chart's spine — the only rule drawn at full strength. */}
            <ReferenceLine y={0} stroke={AXIS_COLOR} strokeWidth={1} />
            <Tooltip cursor={{ fill: GRID_COLOR, opacity: 0.4 }} content={<TrendTooltip />} />
            <Bar
              dataKey="earned"
              fill={EARNED_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
            <Bar
              dataKey="spentAxis"
              fill={SPENT_COLOR}
              radius={[0, 0, 4, 4]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * One bucket's readout: both directions and the net between them, so the
 * pointer never has to land on a specific bar to get a figure. Recharts clones
 * this with the hovered payload, hence the optional props.
 */
function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <ChartTooltip
      title={formatMonth(datum.bucket)}
      entries={[
        { label: "Earned", value: datum.earned, color: EARNED_COLOR },
        { label: "Spent", value: datum.spent, color: SPENT_COLOR },
        {
          // The net is stated, never painted: a third colour would collide with
          // the two that mean direction.
          label: datum.net < 0 ? "Net — overspent" : "Net",
          value: datum.net,
          color: "transparent",
        },
      ]}
    />
  );
}

/** One legend entry: a key, its series name, and that series' window total. */
function LegendKey({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2 text-gousse-muted">
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}{" "}
      <span className="font-medium tabular-nums text-gousse-ink">
        {formatCurrency(value, { signDisplay: false })}
      </span>
    </li>
  );
}
