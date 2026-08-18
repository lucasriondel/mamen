import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The app's styled button — gousse's `Button`, vendored from the registry
 * (issue #93) and owned here. gousse's own chassis and per-variant
 * colour/disabled treatment are untouched (`primary` ink-filled, `secondary`
 * line-bordered, `ghost`, `danger`), so mamen's buttons press and hover exactly
 * like miel's.
 *
 * The chassis is a **pill**. gousse leans round: a control that could be
 * `rounded-md` or `rounded-full` takes the rounder option, and a pill sits
 * correctly inside any parent radius because it has no corner to disagree with.
 * The inset is `px-4` rather than the `px-3` a square button carried — a pill
 * eats its own horizontal padding at the ends, so rounding means widening.
 *
 * Three things are mamen's, folded in here from the adapter this file replaced:
 *
 * - **`size`.** gousse's button is one fixed height; mamen has a three-step
 *   scale used at ~36 call-sites (`sm` for table toolbars and inline actions,
 *   `md` for the 40px hit-area floor, `icon` for square icon-only buttons). It
 *   is a second cva axis rather than a `className` layered on top, so the height
 *   and the padding are resolved once, in the same place as the colour.
 * - **a `focus-visible` ring.** Keyboard-only, so a mouse click stays quiet (the
 *   ring is what makes keyboard focus visible at all). Matches {@link Input}'s.
 * - **`primary` as the default variant**, not gousse's `secondary`: mamen's
 *   call-sites that pass no `variant` mean the affirmative button.
 *
 * Two chassis classes the adapter used to pass through `className` are in the
 * chassis string itself now, for the same reason: `justify-center` (an
 * icon-only or fixed-width button centres its content) and
 * `disabled:pointer-events-none`, which stops a disabled button swallowing the
 * hover of whatever sits under it.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-[transform,colors] active:scale-[0.96]",
    "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
    "disabled:pointer-events-none",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-gousse-ink text-gousse-bg hover:bg-gousse-ink/90 disabled:bg-gousse-muted disabled:cursor-not-allowed",
        secondary:
          "bg-gousse-panel border border-gousse-line text-gousse-ink hover:bg-gousse-bg disabled:opacity-50 disabled:cursor-not-allowed",
        ghost:
          "bg-transparent text-gousse-ink hover:bg-gousse-line/60 disabled:opacity-50 disabled:cursor-not-allowed",
        danger:
          "bg-gousse-high text-white hover:bg-gousse-high/85 disabled:opacity-50 disabled:cursor-not-allowed",
      },
      size: {
        // Comfortable default — reaches the 40px hit-area floor.
        md: "h-10 px-4",
        // Denser controls (table toolbars, inline actions).
        sm: "h-8 px-3 text-xs",
        // Icon-only: square so the hit area stays ≥ its height.
        icon: "size-9 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

/** A gousse-styled button with mamen's size scale and focus-visible ring. */
export function Button({
  className,
  variant,
  size,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}
