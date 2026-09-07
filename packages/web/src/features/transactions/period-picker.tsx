import { CalendarRange, ChevronDown, ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { PeriodRangeCalendar } from "./period-range-calendar";

export interface PeriodPickerProps {
  /** The `YYYY-MM` values the data holds, for the grid's enabled cells. */
  months: readonly string[];
  /** The period fields as they stand in the URL. */
  value: PeriodFilterFields;
  /** Apply a new period — every period field is named, so none can go stale. */
  onChange: (fields: PeriodFilterFields) => void;
}

/**
 * Which face of the panel is showing. `menu` is the resting one; the other two
 * are pushed onto it by the last two menu items.
 */
type View = "menu" | "month" | "range";

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
 * **The panel is a menu, not a form.** It used to open onto everything at once:
 * a row of quick-pick pills, a mode toggle, and whichever picker that toggle
 * selected — three kinds of control stacked in one small popover, so the two
 * rare paths (a specific month, an arbitrary span) were permanently occupying
 * the space and the attention of the three common ones. Now the panel opens as
 * five items in a {@link Command} list:
 *
 * 1. **This year** · 2. **This month** · 3. **Last month** — resolved against
 *    the clock at click time (see `resolveQuickPick`) so a bookmark keeps
 *    meaning the period it named rather than drifting with the calendar. These
 *    apply and close.
 * 4. **Pick month** — pushes the year-of-cells grid onto the panel.
 * 5. **Pick date range** — widens the panel and pushes two months of days onto
 *    it, for the arbitrary span.
 *
 * The last two *navigate* rather than apply, which is why they carry a chevron
 * and the first three do not: one glance says which items cost a click and
 * which open a room. Each sub-view has a back affordance in its header, so the
 * menu is never a one-way door.
 *
 * A `Command` list rather than hand-rolled buttons: it brings type-ahead and
 * arrow-key navigation for free, and it is the same list surface as the issuer
 * and category pickers — the bar's popovers all behave alike.
 *
 * The trigger labels itself from the applied period, so the bar states what it
 * is showing instead of a control name: "March 2026", "This year", "1 Jan – 15 Mar",
 * or "All time" when nothing is applied.
 */
export function PeriodPicker({ months, value, onChange }: PeriodPickerProps) {
  const period = filterToPeriod(value);
  // One `now` per render: the quick picks resolve and match against the same
  // instant, so an item cannot tick against a different day than it applied.
  const now = useMemo(() => new Date(), []);
  const activePick = matchQuickPick(period, now);

  const available = useMemo(() => new Set(months), [months]);
  const maxYear = now.getFullYear();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  // The year the grid is showing — seeded from the selection so opening the
  // panel on a filtered view lands on the month in force, not on this year.
  const [year, setYear] = useState(() =>
    period.kind === "month" ? Number(period.month.slice(0, 4)) : maxYear,
  );

  const apply = (next: Period) => onChange(periodToFilter(next));

  /** Apply and dismiss — for the three items that settle the period outright. */
  const applyAndClose = (next: Period) => {
    apply(next);
    setOpen(false);
  };

  const selectedMonth = period.kind === "month" ? period.month : undefined;
  const bounds = period.kind === "range" ? period : { startDate: "", endDate: "" };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopening always lands on the menu: the sub-view you left is a step
        // in a finished errand, not a preference to be restored.
        if (!next) setView("menu");
      }}
    >
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

      {/* The range view needs room for two months abreast; the other two are the
          narrow panel the bar's other filters use. */}
      <PopoverContent className={cn("p-0", view === "range" ? "w-auto" : "w-60")}>
        {view === "menu" ? (
          <PeriodMenu
            activePick={activePick}
            period={period}
            onPick={(id) => applyAndClose(resolveQuickPick(id, now))}
            onClear={() => applyAndClose({ kind: "all" })}
            onOpenView={setView}
          />
        ) : (
          <div className="p-2">
            <SubViewHeader
              title={view === "month" ? "Pick month" : "Pick date range"}
              onBack={() => setView("menu")}
            />

            {view === "month" ? (
              <PeriodMonthGrid
                year={year}
                onYearChange={setYear}
                maxYear={maxYear}
                selected={selectedMonth}
                available={available}
                onSelect={(month) =>
                  // Re-picking the month in force clears it, so the grid can undo
                  // itself without reaching for Clear.
                  applyAndClose(
                    month === selectedMonth ? { kind: "all" } : { kind: "month", month },
                  )
                }
              />
            ) : (
              <PeriodRangeCalendar
                startDate={bounds.startDate}
                endDate={bounds.endDate}
                onChange={({ startDate, endDate }) => apply({ kind: "range", startDate, endDate })}
              />
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The ids of the quick picks, in the order the menu offers them. */
const MENU_PICKS = ["this-year", "this-month", "last-month"] as const;

/** The two items that open a sub-view rather than applying a period. */
const MENU_VIEWS = [
  { view: "month", label: "Pick month" },
  { view: "range", label: "Pick date range" },
] as const;

interface PeriodMenuProps {
  /** Which quick pick the applied period *is*, when it is one of them. */
  activePick: ReturnType<typeof matchQuickPick>;
  period: Period;
  onPick: (id: (typeof MENU_PICKS)[number]) => void;
  onClear: () => void;
  onOpenView: (view: Exclude<View, "menu">) => void;
}

/** The five items the panel rests on, plus the header that can undo them. */
function PeriodMenu({ activePick, period, onPick, onClear, onOpenView }: PeriodMenuProps) {
  return (
    <Command>
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
        <span className="text-[11px] text-gousse-muted uppercase tracking-wider">Period</span>
        {period.kind !== "all" ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded-full px-1.5 py-0.5 text-gousse-accent text-xs outline-none hover:bg-gousse-accent/10 focus-visible:ring-2 focus-visible:ring-gousse-accent"
          >
            Clear
          </button>
        ) : null}
      </div>

      <CommandList className="max-h-none">
        {MENU_PICKS.map((id) => {
          const pick = QUICK_PICKS.find((p) => p.id === id);
          if (pick == null) return null;
          const active = activePick === id;
          return (
            <CommandItem
              key={id}
              value={pick.label}
              onSelect={() => onPick(id)}
              className={cn("justify-between", active && "font-medium text-gousse-accent")}
            >
              <span>{pick.label}</span>
              {/* The tick states which period is applied without spending a
                  colour the accent already owns elsewhere in the list. */}
              {active ? <span aria-hidden>✓</span> : null}
            </CommandItem>
          );
        })}

        {MENU_VIEWS.map(({ view, label }) => (
          <CommandItem
            key={view}
            value={label}
            onSelect={() => onOpenView(view)}
            className="justify-between"
          >
            <span>{label}</span>
            {/* A right-pointing chevron is the menu convention for "opens a
                further step", which is exactly what these two do. */}
            <ChevronLeft size={14} className="rotate-180 text-gousse-muted" aria-hidden />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/** A sub-view's title bar, with the way back to the menu. */
function SubViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 pb-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to period menu"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span className="text-[11px] text-gousse-muted uppercase tracking-wider">{title}</span>
    </div>
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
