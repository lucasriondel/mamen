import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "@base-ui-components/react/tabs";
import { cn } from "@/lib/utils";

/**
 * shadcn-flavoured wrappers over Base UI's `Tabs`, restyled onto the gousse
 * tokens — an underlined tab strip over the panel it switches.
 *
 * Base UI owns what a hand-rolled strip of buttons always gets wrong: the
 * roving `tabIndex` (one stop for the whole strip, arrows to move inside it),
 * `role="tablist"`/`tab`/`tabpanel` with the `aria-controls` wiring between
 * them, and Home/End. Only the look lives here.
 *
 * The underline is a real element ({@link TabsIndicator}) rather than a border
 * on the active tab, so it *slides* between tabs: Base UI publishes the active
 * tab's geometry as `--active-tab-left`/`--active-tab-width` on the indicator,
 * which the transition below animates. Drop the indicator and the strip still
 * works — it simply cuts rather than travels.
 *
 * Controlled or not, like the primitive: pass `value` + `onValueChange` for a
 * strip whose tab lives in the URL, or `defaultValue` to let it hold its own.
 */

export const Tabs = TabsPrimitive.Root;

/**
 * The strip itself. `relative` anchors the absolutely-positioned indicator, and
 * the bottom rule runs the full width so the inactive tabs sit *on* a line
 * rather than floating above the panel.
 */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("relative flex items-center gap-1 border-b border-gousse-line", className)}
      {...props}
    />
  );
}

/**
 * One tab. Muted at rest and inked when active — the weight stays put across
 * both states (no `font-semibold` on active) so the label doesn't reflow the
 * strip as the selection moves.
 *
 * `-mb-px` pulls each tab down onto the list's bottom rule, so the indicator
 * covers that rule instead of stacking a second line under it.
 */
export function TabsTab({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "-mb-px flex cursor-default select-none items-center gap-2 whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium text-gousse-muted outline-hidden transition-colors",
        "hover:text-gousse-ink",
        "focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-0",
        "data-[selected]:text-gousse-ink",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The sliding underline. Positioned off the CSS variables Base UI writes for
 * the active tab, so it needs no measurement of its own.
 *
 * `motion-reduce` drops the travel rather than the mark: the indicator still
 * moves, it just arrives without the tween.
 */
export function TabsIndicator({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Indicator>) {
  return (
    <TabsPrimitive.Indicator
      className={cn(
        "absolute bottom-0 left-0 z-[1] h-0.5 rounded-full bg-gousse-accent",
        "w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
        "transition-[translate,width] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One tab's content. `outline-hidden` on the panel itself because Base UI makes
 * it focusable (so keyboard users land in the content after Tab-ing out of the
 * strip) — the ring would otherwise draw around the whole page section.
 */
export function TabsPanel({ className, ...props }: ComponentProps<typeof TabsPrimitive.Panel>) {
  return <TabsPrimitive.Panel className={cn("outline-hidden", className)} {...props} />;
}
