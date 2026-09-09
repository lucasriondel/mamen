import {
  Bar,
  BarChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMonth } from "@/lib/format";
import { AXIS_COLOR, EARNED_COLOR, SPENT_COLOR } from "./chart-palette";
import type { CategoryDelta, DeltaComparison } from "./category-deltas";
import { ChartTooltip } from "./chart-tooltip";

export interface CategoryDeltaChartProps {
  comparison: DeltaComparison;
}

/** Row height per mover, so the chart grows with its content rather than scrolling. */
const ROW_HEIGHT = 30;

/**
 * A bar's figure, written just past the end the bar actually reaches.
 *
 * The side has to follow the bar's direction: a fixed side would put a falling
 * category's label back across the zero rule and on top of the axis names.
 * Recharts hands this the bar's own box, so the anchor is derived from the
 * geometry rather than from a second reading of the datum.
 */
function DeltaLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  if (!Number.isFinite(value) || value === 0) return null;

  // `x` is the zero rule and `width` is **signed** — negative for a bar drawn
  // leftward — so `x + width` is the far end whichever way the bar points. That
  // is the anchor: writing the figure at a fixed side would put a falling
  // category's label inside its own fill, where it is unreadable.
  const rising = value > 0;
  const edge = x + width;
  const GAP = 6;

  return (
    <text
      x={rising ? edge + GAP : edge - GAP}
      y={y + height / 2}
      textAnchor={rising ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fill={AXIS_COLOR}
    >
      {formatCurrency(value)}
    </text>
  );
}

/**
 * What changed since the previous bucket, per category (issue #113).
 *
 * A **diverging** bar chart around zero: bars to the right are categories that
 * cost more than last time, bars to the left ones that cost less. This is the
 * page's one genuinely actionable chart — the others describe a period, this one
 * names what moved.
 *
 * Horizontal, because the labels are category names: a vertical version would
 * either truncate them or rotate them, and rotated axis labels are unreadable.
 *
 * The two hues are the same diverging pair the trend chart uses, and they mean
 * the same thing here — direction, not judgement. Spending more on groceries is
 * not a *failure*, and painting it in the gousse "critical" red would say it was.
 * The reader decides which movements they mind.
 */
/**
 * One mover's readout: what it costs now against what it cost before, so the
 * bar's length is backed by the two figures it is the difference of. Recharts
 * clones this with the hovered payload; the bucket names ride as real props.
 */
function DeltaTooltip({
  active,
  payload,
  current,
  previous,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CategoryDelta }>;
  current: string;
  previous: string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <ChartTooltip
      title={datum.name}
      entries={[
        {
          label: formatMonth(current),
          value: datum.current,
          color: datum.delta > 0 ? SPENT_COLOR : EARNED_COLOR,
        },
        { label: formatMonth(previous), value: datum.previous, color: "transparent" },
      ]}
    />
  );
}

export function CategoryDeltaChart({ comparison }: CategoryDeltaChartProps) {
  const { deltas, current, previous } = comparison;
  const height = Math.max(deltas.length * ROW_HEIGHT + 24, 120);

  // A symmetric domain, so a +50 bar and a -50 bar are the same length and the
  // zero rule sits dead centre — an auto domain would make the smaller side
  // look bigger than it is.
  const extent = Math.max(...deltas.map((d) => Math.abs(d.delta)), 1);

  // One row per category, its movement on whichever half matches its direction
  // and `null` on the other, so each bar draws only the rows it owns.
  const rows = deltas.map((d) => ({
    ...d,
    rise: d.delta > 0 ? d.delta : null,
    fall: d.delta < 0 ? d.delta : null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gousse-muted">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: SPENT_COLOR }}
          />
          Spent more
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: EARNED_COLOR }}
          />
          Spent less
        </li>
        <li className="text-gousse-muted">
          vs <span className="text-gousse-ink">{formatMonth(previous)}</span>
        </li>
      </ul>

      {/* `min-w-0` matters: this sits in a flex column, where a `w-full` child
          can still measure 0 while ResponsiveContainer is sizing itself — and a
          zero-width plot draws every bar with an empty path. */}
      <div style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            // Room on both flanks for the direct labels a diverging bar puts
            // outside its own end, whichever way it points.
            margin={{ top: 0, right: 64, bottom: 0, left: 64 }}
          >
            {/* A little past the extreme, so the longest bar's label has
                somewhere to sit instead of being clipped by the plot edge. */}
            <XAxis type="number" domain={[-extent * 1.15, extent * 1.15]} hide />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: AXIS_COLOR, fontSize: 12 }}
              // Wide enough for a two-word category name; longer ones are
              // truncated by recharts rather than overrunning the plot.
              width={128}
            />
            <ReferenceLine x={0} stroke={AXIS_COLOR} strokeWidth={1} />
            <Tooltip
              cursor={{ fill: "rgb(var(--gousse-bg))" }}
              content={<DeltaTooltip current={current} previous={previous} />}
            />
            {/* Two bars over the same rows rather than one bar with per-row
                `Cell` fills: a diverging chart needs each row painted by its
                direction, and recharts drops a bar to an empty "inactive" shape
                when it cannot match `Cell` children to the data — which draws no
                path at all. Splitting the series by sign keeps each half a plain
                bar with one fill, and the `null`s leave the other half's rows
                empty rather than stacking a zero on top of them. */}
            <Bar
              dataKey="rise"
              fill={SPENT_COLOR}
              radius={4}
              maxBarSize={16}
              isAnimationActive={false}
            >
              <LabelList dataKey="rise" content={<DeltaLabel />} />
            </Bar>
            <Bar
              dataKey="fall"
              fill={EARNED_COLOR}
              radius={4}
              maxBarSize={16}
              isAnimationActive={false}
            >
              <LabelList dataKey="fall" content={<DeltaLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
