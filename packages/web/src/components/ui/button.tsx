import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared button primitive. Before this existed the app had ~50 inline
 * `<button>`s repeating the same `rounded-md bg-accent px-4 py-2 …` strings, none
 * of which had press feedback or a visible focus ring. Centralising them here
 * gives every button, in one place:
 *
 * - `active:scale-[0.97]` press feedback over `transition-transform` — the tactile
 *   "the UI heard you" cue (emil-design-eng: buttons must feel responsive);
 * - a `focus-visible` ring (keyboard-only, so a mouse click stays quiet) —
 *   the app previously stripped the native outline with `outline-none` and never
 *   replaced it, leaving keyboard focus invisible;
 * - a ≥40px hit area on the default size (make-interfaces-feel-better #16).
 *
 * Variants map onto the pre-existing visual language (accent primary, line-bordered
 * secondary, `--high` destructive) so swapping call-sites is a like-for-like change.
 */
const buttonVariants = cva(
	cn(
		"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium",
		"transition-[transform,background-color,border-color,color] duration-150",
		"outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
		"active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
	),
	{
		variants: {
			variant: {
				primary: "bg-accent text-bg hover:bg-accent/90",
				secondary: "border border-line text-ink hover:bg-panel",
				ghost: "text-muted hover:bg-panel hover:text-ink",
				danger: "border border-high text-high hover:bg-high/10",
			},
			size: {
				// Comfortable default — reaches the 40px hit-area floor.
				md: "h-10 px-4",
				// Denser controls (table toolbars, inline actions).
				sm: "h-8 px-3 text-xs",
				// Icon-only: square so the hit area stays ≥ its height.
				icon: "size-9",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants>;

/** A token-styled button with built-in press feedback and focus-visible ring. */
export function Button({
	className,
	variant,
	size,
	type = "button",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { buttonVariants };
