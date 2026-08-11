import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip primitives — a gap-fill over Radix `Tooltip`, restyled onto the
 * `--gousse-*` tokens (ADR 0003), same as {@link Popover}.
 *
 * Unlike the popover this is a *read* surface: it reveals text the row couldn't
 * fit (an issuer's note on the transactions table) and is never the only way to
 * reach that text — the issuer's page always shows the note in full. A tooltip
 * can't be opened by touch and is skipped by some assistive tech, so nothing
 * that is only available here may be load-bearing.
 */

/**
 * Wraps a subtree that contains tooltips. Radix requires a provider above every
 * `Tooltip`; mounting it once at the app root is what makes the *group* delay
 * work — after one tooltip has opened, moving to a sibling opens it instantly
 * instead of re-waiting the full `delayDuration`, which is what makes scanning a
 * column of them feel responsive rather than sticky.
 */
export function TooltipProvider({
	delayDuration = 300,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * The floating label; token-styled and portalled so it clears the table's
 * `overflow` and stacking contexts.
 *
 * `z-50` matches the popover: a tooltip and a popover are never open on the same
 * trigger at once (opening the popover dismisses the tooltip), so they don't
 * compete. Width is capped by the caller — the content here is free-text and
 * must be allowed to wrap.
 */
export function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				sideOffset={sideOffset}
				className={cn(
					// The box corner the other overlays take (issue #97). On a label this
					// short the radius all but meets in the middle, which is the intent:
					// where a shape is in doubt the kit takes the rounder option.
					"z-50 rounded-2xl border border-gousse-line bg-gousse-panel px-2.5 py-1.5 text-gousse-ink text-xs shadow-lg",
					// Origin-aware entrance, matching the popover's.
					"origin-(--radix-tooltip-content-transform-origin)",
					"duration-150 data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
					"data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95",
					className,
				)}
				{...props}
			>
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}
