import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMonth } from "@/lib/format";
import { AXIS_COLOR, GRID_COLOR } from "./chart-palette";
import { ChartTooltip } from "./chart-tooltip";
import type { CompositionDatum, CompositionSeries } from "./composition-series";

export interface CompositionChartProps {
  series: CompositionSeries;
}

/** Compact axis money — `1.2k` beats a full currency string on a crowded axis. */
function formatAxisMoney(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return `${Math.round(magnitude / 100) / 10}k`;
  return String(Math.round(magnitude));
}

/**
 * One bucket's readout: every band with spending at that X, biggest first, so
 * the pointer never has to land on a specific band. Recharts clones this with
 * the hovered payload; `bands` is passed as a real prop.
 */
function CompositionTooltip({
  active,
  payload,
  bands,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CompositionDatum }>;
  bands: CompositionSeries["bands"];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const entries = bands
    .map((band) => ({
      label: band.name,
      value: Number(datum[band.key] ?? 0),
      color: band.color,
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <ChartTooltip
      title={`${formatMonth(datum.bucket)} · ${formatCurrency(datum.total, { signDisplay: false })}`}
      entries={entries}
    />
  );
}

/**
 * How a period's spending was **composed**, bucket by bucket (issue #113).
 *
 * The chart the flat totals cannot give you: a month that spent the same as the
 * last one but spent it on something else looks identical in a total and
 * obviously different here. Stacked, because the question is part-to-whole *over
 * time* — each column is one bucket's whole spending, divided.
 *
 * Bands are ranked and coloured over the whole window (see `toCompositionSeries`),
 * so a category keeps one hue and one position across every column; a band that
 * changed places per bucket would make the stack unreadable.
 *
 * Stacked areas rather than stacked bars because the axis is time and the reader
 * is following a *shape* along it. The 2px gap between bands is the panel showing
 * through, so the separator stays correct in both themes.
 */
export function CompositionChart({ series }: CompositionChartProps) {
  const { bands, data } = series;

  if (bands.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gousse-muted">No spending in this window.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Always present for ≥ 2 bands — and the only place a band's identity is
          stated in text, since a stacked area cannot carry direct labels. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gousse-muted">
        {bands.map((band) => (
          <li key={band.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: band.color }}
            />
            <span className="truncate">{band.name}</span>
          </li>
        ))}
      </ul>

      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
            <XAxis
              dataKey="bucket"
              tickFormatter={formatMonth}
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
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
            <Tooltip
              cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
              content={<CompositionTooltip bands={bands} />}
            />
            {bands.map((band) => (
              <Area
                key={band.key}
                // Straight segments, never a spline: a smoothed curve bulges
                // between two sparse points and paints spending into months
                // that had none — it would be drawing data the period does not
                // contain.
                type="linear"
                dataKey={band.key}
                stackId="spend"
                stroke="rgb(var(--gousse-panel))"
                strokeWidth={2}
                fill={band.color}
                fillOpacity={1}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
