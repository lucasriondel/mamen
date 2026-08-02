import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Popover primitives — a gap-fill over Radix `Popover`, restyled onto the
 * `--gousse-*` tokens (ADR 0002). Anchors the issuer assignment picker to the
 * clicked transaction cell (PRD).
 */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * The floating panel; token-styled, with sensible offset + portal.
 *
 * `portalContainer` is the escape hatch for a popover **inside a modal dialog**.
 * The portal defaults to `document.body`, which is outside the dialog's DOM
 * subtree — and a Radix modal locks scrolling everywhere *but* that subtree
 * (`react-remove-scroll`). The popover still paints and still takes clicks, since
 * Radix re-enables pointer events on its own content, but the wheel event is
 * swallowed by the lock, so any list inside it looks frozen. Portalling into the
 * dialog's own node puts the popover back inside the whitelisted subtree and the
 * scroll works again. Left opt-in rather than defaulted: portalling to `body` is
 * what keeps a popover clear of ancestor `overflow`/stacking contexts everywhere
 * else, and that is the common case.
 */
export function PopoverContent({
	className,
	align = "start",
	sideOffset = 4,
	portalContainer,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
	/** Render the portal here instead of `document.body` — see above. */
	portalContainer?: HTMLElement | null;
}) {
	return (
		<PopoverPrimitive.Portal container={portalContainer ?? undefined}>
			<PopoverPrimitive.Content
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-50 w-72 rounded-md border border-gousse-line bg-gousse-panel text-gousse-ink shadow-lg outline-none",
					// Origin-aware entrance: scale in from the trigger, not the centre
					// (emil-design-eng). Radix sets the transform-origin var per side.
					"origin-(--radix-popover-content-transform-origin)",
					"duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out",
					"data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}
