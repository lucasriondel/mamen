import { Button as GousseButton } from "@lucasriondel/gousse-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared button — a thin adapter over gousse's `Button` primitive (ADR
 * 0002). gousse owns the chassis and the per-variant colour/disabled treatment
 * (`primary` ink-filled, `secondary` line-bordered, `ghost`, `danger`), so
 * mamen's buttons press and hover exactly like miel's.
 *
 * Two things gousse does not model, layered on here:
 *
 * - **`size`.** gousse's button is one fixed height (`px-3 py-1.5`); mamen has
 *   a three-step scale used at ~36 call-sites (`sm` for table toolbars and
 *   inline actions, `md` for the 40px hit-area floor, `icon` for square
 *   icon-only buttons). These override the primitive's own padding via cn().
 * - **a `focus-visible` ring.** Keyboard-only, so a mouse click stays quiet
 *   (the ring is what makes keyboard focus visible at all).
 *
 * `defaultVariants` keeps mamen's `primary` default rather than gousse's
 * `secondary`, so existing call-sites that pass no `variant` are unchanged.
 */
const buttonVariants = cva(
	cn(
		"justify-center",
		"outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-bg",
		"disabled:pointer-events-none",
	),
	{
		variants: {
			size: {
				// Comfortable default — reaches the 40px hit-area floor.
				md: "h-10 px-4",
				// Denser controls (table toolbars, inline actions).
				sm: "h-8 px-3 text-xs",
				// Icon-only: square so the hit area stays ≥ its height.
				icon: "size-9 px-0",
			},
		},
		defaultVariants: { size: "md" },
	},
);

type GousseVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		variant?: GousseVariant;
	};

/** A gousse-styled button with mamen's size scale and focus-visible ring. */
export function Button({
	className,
	variant = "primary",
	size,
	type = "button",
	children,
	...props
}: ButtonProps) {
	return (
		<GousseButton
			type={type}
			variant={variant}
			className={cn(buttonVariants({ size }), className)}
			{...props}
		>
			{children}
		</GousseButton>
	);
}

export { buttonVariants };
