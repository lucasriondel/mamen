import { YearPager } from "@/components/ui/year-pager";
import { cn } from "@/lib/utils";

/** Short month names for the grid, index 0 = January. */
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface PeriodMonthGridProps {
  /** The year on show. */
  year: number;
  onYearChange: (year: number) => void;
  /** The newest year worth paging to — the pager stops here. */
  maxYear: number;
  /** The selected `YYYY-MM`, when the selection falls in a month at all. */
  selected: string | undefined;
  /** The `YYYY-MM` values the data actually holds; others render disabled. */
  available: ReadonlySet<string>;
  onSelect: (month: string) => void;
}

/**
 * A year of months as a 3×4 grid, with the year pager above it.
 *
 * A grid rather than the flat `<select>` of every distinct month this replaced:
 * the list grew with the data and had no shape, so finding March 2025 in it was
 * a scan. Twelve cells in a fixed arrangement are a *place* — the same month
 * sits in the same spot every year, so picking one becomes aim rather than read.
 *
 * **Months with no transactions are disabled, not omitted.** Dropping them would
 * reflow the grid and let a gap read as a missing month rather than as an empty
 * one; keeping them in place makes "nothing here" a legible answer and holds the
 * geometry that makes the grid worth having.
 *
 * `YearPager` is the accounts page's own (issues #131, #159) — same open past,
 * same capped future, so the two year steppers in the app behave identically.
 */
export function PeriodMonthGrid({
  year,
  onYearChange,
  maxYear,
  selected,
  available,
  onSelect,
}: PeriodMonthGridProps) {
  return (
    <div className="flex flex-col gap-2">
      <YearPager
        value={year}
        maxYear={maxYear}
        onChange={onYearChange}
        label="Year"
        className="justify-center"
      />

      <div
        className="grid grid-cols-3 gap-1"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a `fieldset` announces a group of form controls; these are buttons that change what the list below shows, and its legend would break the twelve-cell grid this control is
        role="group"
        aria-label="Month"
      >
        {MONTH_LABELS.map((label, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          const enabled = available.has(month);
          const active = month === selected;
          return (
            <button
              key={month}
              type="button"
              aria-pressed={active}
              disabled={!enabled}
              onClick={() => onSelect(month)}
              className={cn(
                "cursor-pointer rounded-full border border-transparent px-0 py-2 text-center text-sm transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
                active
                  ? "bg-gousse-accent font-medium text-white"
                  : "text-gousse-ink hover:bg-gousse-line/40",
                // Disabled months keep their cell and read as empty rather than
                // absent, which is the whole point of not omitting them.
                !enabled && "cursor-not-allowed text-gousse-muted opacity-45 hover:bg-transparent",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
