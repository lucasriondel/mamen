import type { ReactNode } from "react";

export interface ChartCardProps {
  /** The chart's heading — what question it answers. */
  title: string;
  /** The span or grain it is drawn over, e.g. "2026, by month". */
  subtitle?: string;
  /** A control belonging to this chart (an axis toggle), shown beside the title. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every recap chart sits in (issue #113) — the same panel, radius and
 * padding as {@link SpendSection}, so a chart and a list read as two views of one
 * page rather than two widgets.
 *
 * The title carries the *question*; the subtitle carries the **span**, which a
 * chart must always state — the recap's period selector scopes the lists exactly,
 * but a trend deliberately widens a single month to its trailing year, and a
 * chart that shows more than the page's period without saying so is a chart the
 * reader will misread as the period's own numbers.
 */
export function ChartCard({ title, subtitle, action, children }: ChartCardProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gousse-ink text-balance">{title}</h2>
          {subtitle ? <p className="text-sm text-gousse-muted">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
