import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface YearPagerProps {
  /** The selectable years, **newest first** — `availableYears()`'s order. */
  years: readonly number[];
  /** The year currently shown. */
  value: number;
  onChange: (year: number) => void;
  /** Names the group; also names the arrows ("Previous year"). */
  label?: string;
  className?: string;
}

const ARROW_CLASS =
  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gousse-muted";

/**
 * A pill that renders every page of a short bounded range inline, plus an arrow
 * at each end — the accounts page's year selector (issue #131).
 *
 * It replaces a `<select>` because the range it pages over is
 * `availableYears()`: the earliest imported year through the current one,
 * typically one to three entries. A select hides that list behind a click, so
 * "which years hold data?" costs a gesture; laid out inline it costs nothing and
 * fits in the topbar beside the title. Past ~10 years the track would need to
 * scroll or collapse — not built, because nothing can produce that range yet.
 *
 * **The array is newest-first**, so the arrows are inverted with respect to the
 * index: stepping to an *older* year means moving *forward* through `years`.
 * That is the one thing here worth getting wrong, so both arrows resolve their
 * target through {@link step} rather than by arithmetic at the call site.
 *
 * `role="group"` rather than `tablist` or `radiogroup`: the pages are ordinary
 * buttons that change what the page below shows, and `aria-current` states which
 * one is in force — the same relationship pagination has, which is what this is.
 */
export function YearPager({ years, value, onChange, label = "Year", className }: YearPagerProps) {
  const index = years.indexOf(value);

  /** The year `offset` steps *newer* than the active one, or `undefined`. */
  const step = (offset: number): number | undefined => {
    if (index < 0) return undefined;
    return years[index - offset];
  };

  const older = step(-1);
  const newer = step(1);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a `fieldset` announces a group of form controls; these are pagination buttons that change what the page shows, and a legend inside this pill would have nowhere to sit.
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the same decision as the biome-ignore above, for the other linter
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-gousse-line bg-gousse-panel p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Previous ${label.toLowerCase()}`}
        title={`Previous ${label.toLowerCase()}`}
        disabled={older === undefined}
        onClick={() => older !== undefined && onChange(older)}
        className={ARROW_CLASS}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      {years.map((year) => {
        const active = year === value;
        return (
          <button
            key={year}
            type="button"
            // `aria-current` is a state, not a flag: an inactive page carries no
            // attribute at all rather than `aria-current="false"`.
            aria-current={active ? "true" : undefined}
            onClick={() => onChange(year)}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gousse-accent",
              active
                ? "bg-gousse-accent/15 font-semibold text-gousse-accent"
                : "text-gousse-muted hover:bg-gousse-line/60 hover:text-gousse-ink",
            )}
          >
            {year}
          </button>
        );
      })}

      <button
        type="button"
        aria-label={`Next ${label.toLowerCase()}`}
        title={`Next ${label.toLowerCase()}`}
        disabled={newer === undefined}
        onClick={() => newer !== undefined && onChange(newer)}
        className={ARROW_CLASS}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
