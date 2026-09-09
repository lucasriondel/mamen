import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface YearPagerProps {
  /** The year currently shown. */
  value: number;
  /** The newest selectable year — the pager never steps past it. */
  maxYear: number;
  onChange: (year: number) => void;
  /** Names the group; also names the arrows ("Previous year"). */
  label?: string;
  className?: string;
}

const ARROW_CLASS =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gousse-muted";

/**
 * A pill holding the year in force, an arrow at each end, and a way back to the
 * present — the accounts page's year selector (issues #131, #159).
 *
 * The past is **unbounded**: a statement can be as old as the account, and the
 * pager used to stop at the earliest year that already held an import, which is
 * exactly backwards — you page back to a year *in order to* import into it, so
 * refusing to go there until something is there is a lock with the key inside.
 * Stepping back is therefore always allowed.
 *
 * The future is not. `maxYear` is the newest year worth showing (the current
 * one): months after today aren't over, so their statements don't exist yet and
 * a year of them would be twelve dead cells.
 *
 * Because the range is open-ended it can no longer be laid out inline — an
 * arbitrary number of pages doesn't fit a topbar pill. So the pill shows the
 * active year alone, and {@link ThisYearButton} appears beside it once you have
 * wandered off `maxYear`, which is the only jump a one-at-a-time stepper is slow
 * at: getting home from far away costs one click instead of N.
 *
 * `role="group"` rather than `tablist` or `radiogroup`: the arrows are ordinary
 * buttons that change what the page below shows — the same relationship
 * pagination has, which is what this is.
 */
export function YearPager({ value, maxYear, onChange, label = "Year", className }: YearPagerProps) {
  const atMax = value >= maxYear;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a `fieldset` announces a group of form controls; these are pagination buttons that change what the page shows, and a legend inside this pill would have nowhere to sit
        role="group"
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-full border border-gousse-line bg-gousse-panel p-1"
      >
        <button
          type="button"
          aria-label={`Previous ${label.toLowerCase()}`}
          title={`Previous ${label.toLowerCase()}`}
          onClick={() => onChange(value - 1)}
          className={ARROW_CLASS}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>

        {/* The year is the label of the state the arrows move through, not an
            action or a selection — so it reads as plain ink like the rest of the
            chrome, rather than wearing the accent a chosen option would. */}
        <output
          aria-live="polite"
          className="px-2 text-center font-medium text-gousse-ink text-sm tabular-nums"
        >
          {value}
        </output>

        <button
          type="button"
          aria-label={`Next ${label.toLowerCase()}`}
          title={`Next ${label.toLowerCase()}`}
          disabled={atMax}
          onClick={() => !atMax && onChange(value + 1)}
          className={ARROW_CLASS}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      {/* Only worth a control when it would do something: on the current year it
          would be a button that does nothing to a state you are already in. */}
      {atMax ? null : <ThisYearButton onClick={() => onChange(maxYear)} />}
    </div>
  );
}

/** The one-click way back to `maxYear`, shown only while away from it. */
function ThisYearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full border border-gousse-line bg-gousse-panel px-3 py-1.5 text-gousse-muted text-sm outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
    >
      This year
    </button>
  );
}
