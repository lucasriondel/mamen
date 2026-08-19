import { formatCurrency } from "@/lib/format";

/** One line of a chart tooltip: a series, its colour, and its value. */
export type TooltipEntry = {
  label: string;
  value: number;
  color: string;
  /** An optional aside under the value, e.g. a transaction count or a share. */
  hint?: string;
};

export interface ChartTooltipProps {
  /** What the hovered position is — a bucket key, a category name. */
  title: string;
  entries: readonly TooltipEntry[];
}

/**
 * The readout every recap chart shows on hover and on keyboard focus (issue
 * #113).
 *
 * Two rules it exists to keep:
 *
 * - **Values lead, labels follow.** The number is the high-contrast element and
 *   the series name is secondary — the legend's hierarchy inverted, because by
 *   the time a reader is hovering they have the series and want the figure.
 * - **A tooltip enhances, it never gates.** Everything here is also reachable
 *   without hovering: the recap's own sorted lists carry each bucket's exact
 *   total, and the charts carry legends and direct labels. Nothing is knowable
 *   *only* by pointing at it — which is what keeps the charts usable on a
 *   touchscreen and to a screen reader.
 *
 * Series are keyed with a short **stroke** rather than a filled box: at tooltip
 * density a solid swatch is data-weight ink doing a label's job. Names arrive
 * from the API (issuer and category names the user typed), so they are rendered
 * as React children — text nodes, never interpolated markup.
 */
export function ChartTooltip({ title, entries }: ChartTooltipProps) {
  return (
    <div className="min-w-40 rounded-xl border border-gousse-line bg-gousse-panel p-3 shadow-gousse-lg">
      <p className="mb-2 text-xs font-medium text-gousse-muted">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-baseline justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate text-xs text-gousse-muted">{entry.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-medium tabular-nums text-gousse-ink">
                {formatCurrency(entry.value, { signDisplay: false })}
              </span>
              {entry.hint ? (
                <span className="block text-[11px] tabular-nums text-gousse-muted">
                  {entry.hint}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
