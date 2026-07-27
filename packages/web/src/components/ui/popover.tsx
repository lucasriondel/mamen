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

/** The floating panel; token-styled, with sensible offset + portal. */
export function PopoverContent({
	className,
	align = "start",
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	return (
		<PopoverPrimitive.Portal>
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
