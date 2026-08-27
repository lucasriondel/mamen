import { CalendarRange, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  filterToPeriod,
  matchQuickPick,
  monthOf,
  type Period,
  type PeriodFilterFields,
  periodToFilter,
  QUICK_PICKS,
  resolveQuickPick,
} from "./period-filter";
import { PeriodMonthGrid } from "./period-month-grid";
import { PeriodRangeFields } from "./period-range-fields";

export interface PeriodPickerProps {
  /** The `YYYY-MM` values the data holds, for the grid's enabled cells. */
  months: readonly string[];
  /** The period fields as they stand in the URL. */
  value: PeriodFilterFields;
  /** Apply a new period — every period field is named, so none can go stale. */
  onChange: (fields: PeriodFilterFields) => void;
}

/** Which face of the panel is showing. */
type Mode = "month" | "range";

const MODES = [
  { value: "month", label: "Month" },
  { value: "range", label: "Date range" },
] as const;

/**
 * The **Period** filter — the transactions bar's month picker, grown into the
 * one control for every way of naming a span of time.
 *
 * It replaces a flat `<select>` of every distinct import month, which could say
 * only "one month" or "all months". Two things were wrong with that. The list
 * had no shape and grew with the data, so picking a month was a scan; and the
 * URL's other period — the `startDate`/`endDate` bounds a recap link writes —
 * had no control at all, so a link could pin a period the bar could not show and
 * the user could only undo by clearing every filter.
 *
 * So the panel offers three ways in, ordered by how often they are wanted:
 *
 * 1. **Quick picks** — *This month*, *Last month*, *This year*. Resolved against
 *    the clock at click time (see `resolveQuickPick`) so a bookmark keeps
 *    meaning the period it named rather than drifting with the calendar.
 * 2. **Month** — a year of cells with a pager, months without data disabled.
 * 3. **Date range** — the arbitrary span, writing the same bounds the recap uses.
 *
 * The trigger labels itself from the applied period, so the bar states what it
 * is showing instead of a control name: "March 2026", "This year", "1 Jan – 15 Mar",
 * or "All time" when nothing is applied.
 */
export function PeriodPicker({ months, value, onChange }: PeriodPickerProps) {
  const period = filterToPeriod(value);
  // One `now` per render: the quick picks resolve and match against the same
  // instant, so a pill cannot light against a different day than it applied.
  const now = useMemo(() => new Date(), []);
  const activePick = matchQuickPick(period, now);

  const available = useMemo(() => new Set(months), [months]);
  const maxYear = now.getFullYear();

  const [mode, setMode] = useState<Mode>(period.kind === "range" ? "range" : "month");
  // The year the grid is showing — seeded from the selection so opening the
  // panel on a filtered view lands on the month in force, not on this year.
  const [year, setYear] = useState(() =>
    period.kind === "month" ? Number(period.month.slice(0, 4)) : maxYear,
  );

  const apply = (next: Period) => onChange(periodToFilter(next));

  const selectedMonth = period.kind === "month" ? period.month : undefined;
  const bounds = period.kind === "range" ? period : { startDate: "", endDate: "" };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            aria-label="Filter by period"
            className="h-8 gap-2 border-transparent bg-transparent px-3 hover:bg-gousse-line/40"
          >
            <CalendarRange size={14} className="text-gousse-muted" aria-hidden />
            <span>{periodLabel(period, now)}</span>
            <ChevronDown size={14} className="text-gousse-muted" aria-hidden />
          </Button>
        }
      />

      <PopoverContent className="w-64 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
          <span className="text-[11px] tracking-wider text-gousse-muted uppercase">Period</span>
          {period.kind !== "all" ? (
            <button
              type="button"
              onClick={() => apply({ kind: "all" })}
              className="cursor-pointer rounded-full px-1.5 py-0.5 text-xs text-gousse-accent outline-none hover:bg-gousse-accent/10 focus-visible:ring-2 focus-visible:ring-gousse-accent"
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* Quick picks first: they are what most visits want, and putting them
            above the pickers means the common case costs one click. */}
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {QUICK_PICKS.map((pick) => {
            const active = activePick === pick.id;
            return (
              <button
                key={pick.id}
                type="button"
                aria-pressed={active}
                onClick={() => apply(active ? { kind: "all" } : resolveQuickPick(pick.id, now))}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
                  active
                    ? "border-gousse-accent/45 bg-gousse-accent/10 font-medium text-gousse-ink"
                    : "border-gousse-line bg-gousse-panel text-gousse-muted hover:text-gousse-ink",
                )}
              >
                {pick.label}
              </button>
            );
          })}
        </div>

        <Segmented
          label="How to choose the period"
          options={MODES}
          value={mode}
          onChange={setMode}
          className="mb-2 flex w-full"
        />

        {mode === "month" ? (
          <PeriodMonthGrid
            year={year}
            onYearChange={setYear}
            maxYear={maxYear}
            selected={selectedMonth}
            available={available}
            onSelect={(month) =>
              // Re-picking the month in force clears it, so the grid can undo
              // itself without reaching for Clear.
              apply(month === selectedMonth ? { kind: "all" } : { kind: "month", month })
            }
          />
        ) : (
          <PeriodRangeFields
            startDate={bounds.startDate}
            endDate={bounds.endDate}
            onChange={({ startDate, endDate }) =>
              // Commit only once both ends exist: a half-typed range would
              // otherwise refetch against a bound the user has not finished.
              startDate !== "" && endDate !== ""
                ? apply({ kind: "range", startDate, endDate })
                : undefined
            }
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Format an ISO date as a short, year-less day when it needs no disambiguating. */
function shortDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (year == null || month == null || day == null) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * The trigger's text: what is being shown, not what the control is called.
 *
 * A period that a quick pick names is labelled with that name — "This year"
 * reads faster than "1 Jan – 31 Dec 2026" and is what the user asked for.
 */
export function periodLabel(period: Period, now: Date): string {
  const pick = matchQuickPick(period, now);
  if (pick != null) return QUICK_PICKS.find((p) => p.id === pick)?.label ?? "Period";

  switch (period.kind) {
    case "all":
      return "All time";
    case "month":
      return formatMonth(period.month);
    case "range":
      return `${shortDay(period.startDate)} – ${shortDay(period.endDate)}`;
  }
}

/** Re-exported for the bar's "is anything applied?" check. */
export { monthOf };
