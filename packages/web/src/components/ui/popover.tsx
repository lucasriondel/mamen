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
					"z-50 w-72 rounded-md border border-line bg-panel text-ink shadow-lg outline-none",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}
