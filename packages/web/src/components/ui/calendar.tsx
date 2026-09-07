import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ChevronProps, DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * The day calendar — `react-day-picker` restyled onto the `--gousse-*` tokens
 * (ADR 0003), so a month of days reads as the same surface as the popovers and
 * command lists it sits inside.
 *
 * The dependency was already in the manifest and unused; this is the component
 * that finally spends it. It exists for the period picker's **date range**
 * face, which shows two months side by side (`numberOfMonths={2}`) so a span
 * that crosses a month boundary — the common case for a statement period — can
 * be drawn without paging in between.
 *
 * Everything is expressed through `classNames` rather than the library's
 * stylesheet: importing `react-day-picker/style.css` would bring a second,
 * unlayered palette into a kit that already owns its colours, and every rule in
 * it would then need overriding. Naming the parts directly is fewer moving
 * pieces than fighting a sheet.
 *
 * The range styling leans on the fact that a middle day and an end day are
 * different elements, not the same one shaded differently: `range_start` and
 * `range_end` take the accent as a filled pill, `range_middle` takes a flat
 * tint with square sides so a run of days reads as one continuous bar rather
 * than a row of separate chips.
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("relative p-1", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-2",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "font-medium text-gousse-ink text-sm",

        // The nav is absolutely placed over the *root*, not inside a month, so
        // that with two months on show there is one pair of arrows spanning the
        // pair — stepping the window — rather than a pair per month. Each month
        // name then stays optically centred on the grid beneath it.
        nav: "absolute inset-x-0 top-1 flex h-7 items-center justify-between px-1",
        button_previous: NAV_BUTTON_CLASS,
        button_next: NAV_BUTTON_CLASS,

        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-[11px] font-normal text-gousse-muted",
        weeks: "",
        week: "mt-0.5 flex w-full",

        day: "relative size-8 p-0 text-center text-sm",
        day_button: cn(
          "size-8 cursor-pointer rounded-full text-gousse-ink tabular-nums transition-colors",
          "outline-none hover:bg-gousse-line/60 focus-visible:ring-2 focus-visible:ring-gousse-accent",
        ),

        // The tint goes on the **cell**, the accent pill on the button inside
        // it. The cell is what sits flush against its neighbours, so tinting it
        // makes a run of days read as one continuous bar; the button is inset
        // by its own radius, so the same tint there would leave a gap between
        // every pair of days.
        //
        // These three are the only hook available for it. `react-day-picker`
        // marks a cell in a range with `data-selected` alone — there is no
        // `data-range-start`/`-middle`/`-end` attribute to select on — so the
        // start/middle/end distinction exists *only* as these class names, and
        // an attribute selector written against the DOM finds nothing.
        range_start: cn(
          "rounded-l-full bg-gousse-accent/10",
          "[&_button]:bg-gousse-accent [&_button]:font-medium [&_button]:text-white [&_button]:hover:bg-gousse-accent",
        ),
        range_end: cn(
          "rounded-r-full bg-gousse-accent/10",
          "[&_button]:bg-gousse-accent [&_button]:font-medium [&_button]:text-white [&_button]:hover:bg-gousse-accent",
        ),
        range_middle: cn(
          "bg-gousse-accent/10",
          // `!` because `selected` is applied to every cell in the range, this
          // one included, and would otherwise paint the interior days in the
          // endpoints' white-on-accent — white text on the pale bar.
          "[&_button]:!bg-transparent [&_button]:!text-gousse-ink [&_button]:!font-normal",
        ),
        // Every cell of a range carries this too, so it may only say what is
        // true of an endpoint and of a lone day alike; `range_middle` above
        // takes the interior back.
        selected: "[&_button]:bg-gousse-accent [&_button]:font-medium [&_button]:text-white",

        // Today is marked by weight alone. A ring or a fill would compete with
        // the accent the selection already owns, and there can be a `today`
        // that is also a `range_middle`.
        today: "[&_button]:font-semibold [&_button]:text-gousse-accent",
        outside: "[&_button]:text-gousse-muted [&_button]:opacity-40",
        disabled:
          "[&_button]:cursor-not-allowed [&_button]:opacity-30 [&_button]:hover:bg-transparent",
        hidden: "invisible",
        ...classNames,
      }}
      components={CALENDAR_COMPONENTS}
      {...props}
    />
  );
}

/**
 * The library's chevron, swapped for the kit's icon set at the size the nav
 * buttons are drawn for. Defined at module scope rather than inline: a
 * component identity minted on every render would remount the whole nav each
 * time a month changes.
 */
function CalendarChevron({ orientation, ...props }: ChevronProps) {
  return orientation === "left" ? (
    <ChevronLeft className="size-4" {...props} />
  ) : (
    <ChevronRight className="size-4" {...props} />
  );
}

const CALENDAR_COMPONENTS = { Chevron: CalendarChevron } as const;

const NAV_BUTTON_CLASS = cn(
  "flex size-7 cursor-pointer items-center justify-center rounded-full text-gousse-muted transition-colors",
  "outline-none hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent",
  "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
);
