import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { isoDate } from "./period-filter";

export interface PeriodRangeCalendarProps {
  /** The applied bounds as `YYYY-MM-DD`, or empty strings when none is applied. */
  startDate: string;
  endDate: string;
  /** Emit a completed span; the caller writes it to the URL. */
  onChange: (bounds: { startDate: string; endDate: string }) => void;
}

/**
 * The period picker's **date range** face: two months side by side, drag or
 * click a start day and an end day.
 *
 * This replaces a pair of native `<input type="date">` fields. Those were
 * chosen when the app had no date-picker primitive and the range tab was the
 * escape hatch behind a month grid — but a range is a *span*, and two spinners
 * make you hold both ends in your head while typing digits into them. A
 * calendar shows the span: you see how long it is, which weekends it covers and
 * where the month boundary falls, which is the question a range is usually
 * asked in order to answer.
 *
 * **Two months, not one.** The spans people pick here cross a boundary more
 * often than not — a statement period, a trip, "since mid-March" — and with a
 * single month each of those costs a page-forward in the middle of the
 * gesture, which loses the start day off-screen exactly when it is being aimed
 * from.
 *
 * The commit rule is unchanged from the fields it replaces: nothing is applied
 * until **both** ends have been named. That is deliberately not the same test as
 * "is `to` set?" — `react-day-picker` reports the *first* click as the complete
 * one-day range `{ from: d, to: d }`, so trusting `to` would refetch the moment
 * a start day was aimed at, against a span the user is still in the middle of
 * drawing. Which end the next click lands on is not yet decided at that point,
 * and a one-day filter is almost never what someone opening a range picker
 * wants.
 *
 * So the pending selection is held here as local state and a click is counted:
 * only the second one — the one that says where the span *ends* — is applied.
 * A one-day range remains expressible; it just costs clicking the same day
 * twice, which is the price of not guessing after the first.
 */
export function PeriodRangeCalendar({ startDate, endDate, onChange }: PeriodRangeCalendarProps) {
  // Seeded from the applied bounds so re-opening the panel on a filtered view
  // shows the span in force rather than an empty calendar.
  const [range, setRange] = useState<DateRange | undefined>(() => appliedRange(startDate, endDate));
  // Whether a span is mid-gesture: a start day has been clicked and the click
  // that names the end has not landed yet. An applied range arrives finished,
  // so it starts `false`.
  const [drawing, setDrawing] = useState(false);

  const selected = range;
  // Open on the start of the span when there is one, so the pair of months
  // brackets the selection instead of always sitting on today.
  const defaultMonth = selected?.from;

  return (
    <div className="flex flex-col gap-2">
      <Calendar
        mode="range"
        numberOfMonths={2}
        defaultMonth={defaultMonth}
        selected={selected}
        onSelect={(next) => {
          setRange(next);
          if (next?.from == null || next.to == null) {
            // Cleared, or a start whose end the library is leaving open.
            setDrawing(next?.from != null);
            return;
          }
          if (!drawing) {
            // The opening click of a gesture. The library hands it back as the
            // one-day range `{ from: d, to: d }`, which is not yet a claim
            // about where the span ends — so it is drawn and nothing is applied.
            setDrawing(true);
            return;
          }
          // The closing click: the span is now named at both ends.
          setDrawing(false);
          onChange({ startDate: isoDate(next.from), endDate: isoDate(next.to) });
        }}
      />

      <p className="px-2 pb-1 text-gousse-muted text-xs">
        {drawing ? "Pick the end of the range." : "Both dates are included in the range."}
      </p>
    </div>
  );
}

/** Read the applied `YYYY-MM-DD` bounds back into a calendar selection. */
function appliedRange(startDate: string, endDate: string): DateRange | undefined {
  const from = parseIsoDate(startDate);
  const to = parseIsoDate(endDate);
  if (from == null) return undefined;
  return { from, to };
}

/**
 * `YYYY-MM-DD` to a **local** midnight `Date` — parsed by parts rather than
 * handed to `new Date(iso)`, which reads a bare date as UTC and so lands on the
 * previous day for anyone west of Greenwich.
 */
function parseIsoDate(iso: string): Date | undefined {
  const [year, month, day] = iso.split("-").map(Number);
  if (year == null || month == null || day == null || Number.isNaN(year)) return undefined;
  return new Date(year, month - 1, day);
}
