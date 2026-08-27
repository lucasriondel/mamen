import { useId } from "react";
import { cn } from "@/lib/utils";

export interface PeriodRangeFieldsProps {
  /** The applied bounds, or empty strings when the period is not a range. */
  startDate: string;
  endDate: string;
  /** Emit a bound change; the picker commits only once both are filled. */
  onChange: (bounds: { startDate: string; endDate: string }) => void;
}

const FIELD_CLASS = cn(
  "h-8 w-full rounded-full border border-gousse-line bg-gousse-bg px-2.5 text-sm text-gousse-ink tabular-nums",
  "outline-none focus:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent",
);

/**
 * The two date inputs behind the period picker's **Date range** tab.
 *
 * These write `startDate`/`endDate` — the bounds on the transaction's own date
 * that the recap's links have always been able to set and the filter bar never
 * could. Until now a link could pin a period the bar could neither show nor
 * adjust, only clear; this is the control that closes that.
 *
 * Native `<input type="date">` rather than a custom calendar: the app has no
 * date-picker primitive, the platform's is keyboard-accessible and localised for
 * free, and the common paths into a range are the quick picks and the month
 * grid — this tab is the escape hatch for an arbitrary span, not the main way in.
 */
export function PeriodRangeFields({ startDate, endDate, onChange }: PeriodRangeFieldsProps) {
  const fromId = useId();
  const toId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={fromId} className="text-[11px] tracking-wide text-gousse-muted uppercase">
            From
          </label>
          <input
            id={fromId}
            type="date"
            value={startDate}
            // The upper bound caps the lower one so the pair cannot be inverted
            // into a range that matches nothing.
            max={endDate !== "" ? endDate : undefined}
            onChange={(event) => onChange({ startDate: event.target.value, endDate })}
            className={FIELD_CLASS}
          />
        </div>

        <span aria-hidden className="pb-1.5 text-gousse-muted">
          –
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={toId} className="text-[11px] tracking-wide text-gousse-muted uppercase">
            To
          </label>
          <input
            id={toId}
            type="date"
            value={endDate}
            min={startDate !== "" ? startDate : undefined}
            onChange={(event) => onChange({ startDate, endDate: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <p className="text-xs text-gousse-muted">Both dates are included in the range.</p>
    </div>
  );
}
