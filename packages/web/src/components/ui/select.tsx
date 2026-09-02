import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { FIELD_PILL } from "@/lib/field-chrome";
import { cn } from "@/lib/utils";

/**
 * The shared native-`<select>` primitive. A bare `<select>` renders its own
 * dropdown arrow via UA styling — a reserved box the browser positions on its
 * own, independent of the element's `padding`. Every local `INPUT_CLASS` copy
 * across the app inset its *text* with `px-4` and left the arrow to the
 * browser, so the arrow reads flush against the border while {@link Input}'s
 * matching text inset looks correct — the two ends of the same field disagree.
 * `AccountMultiSelect`'s custom trigger never had this problem: it draws its
 * own `ChevronDown` and pads around it explicitly.
 *
 * This does the same for a real `<select>`: `appearance-none` drops the UA
 * arrow, an absolutely-positioned {@link ChevronDown} replaces it, and the
 * text side gets enough right padding (`pr-9`) to clear the icon instead of
 * running under it.
 *
 * The resting *and* hover chrome are `Button`'s `secondary` variant, verbatim
 * (`bg-gousse-panel` / `hover:bg-gousse-bg`, over `border-gousse-line`). Both
 * kinds of picker sit side by side in a top bar — the recap's period `<select>`
 * next to `AccountMultiSelect`'s button trigger — and read as one control type,
 * so a hover that lands on one and not the other reads as a bug rather than a
 * distinction. A `<select>` has no `secondary` variant to compose with, so the
 * pair is kept honest by matching the class here.
 */
export type SelectProps = React.ComponentProps<"select">;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          FIELD_PILL,
          "h-9 w-full appearance-none border border-gousse-line bg-gousse-panel py-1.5 pr-9 pl-4 text-sm text-gousse-ink",
          "transition-colors hover:bg-gousse-bg",
          "outline-none focus:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gousse-panel",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gousse-muted"
        aria-hidden
      />
    </div>
  );
}
