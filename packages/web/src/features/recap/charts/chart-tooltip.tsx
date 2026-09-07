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
  /**
   * The title's own colour, when the tooltip stands for exactly one series —
   * the donut's arcs. Charts whose readout spans several series leave this
   * unset and the title stays plain ink.
   */
  titleColor?: string;
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
 * A single-series readout carries its colour on the **title** rather than on a
 * swatch beside the value: the name is already the thing the colour identifies,
 * so tinting it keys the tooltip to its arc without spending a second element
 * on the job. Colour is never the only carrier — the name is still written out.
 * Names arrive from the API (issuer and category names the user typed), so they
 * are rendered as React children — text nodes, never interpolated markup.
 */
export function ChartTooltip({ title, titleColor, entries }: ChartTooltipProps) {
  return (
    <div className="min-w-40 rounded-xl border border-gousse-line bg-gousse-panel p-3 shadow-gousse-lg">
      <p
        className="mb-2 text-xs font-medium text-gousse-ink"
        style={titleColor ? { color: titleColor } : undefined}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-baseline justify-between gap-4">
            {/* One line, never wrapped: a row label is a short fixed phrase
                ("12% of spending", "Earned"), so the row reads as a single
                sentence against its figure. The series name — the part that can
                be arbitrarily long — is the title, which wraps freely. */}
            <span className="flex min-w-0 items-center gap-2">
              {/* A stroke only where it still has a job: multi-series readouts
                  key each row by colour. A single-series tooltip carries its
                  colour on the title instead, so a swatch here would be a
                  second element saying what the title already says. */}
              {titleColor ? null : (
                <span
                  aria-hidden
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
              )}
              <span className="whitespace-nowrap text-xs text-gousse-muted">{entry.label}</span>
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
