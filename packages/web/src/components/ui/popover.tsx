import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Popover primitives — a gap-fill over Radix `Popover`, restyled onto the
 * `--gousse-*` tokens (ADR 0003). Anchors the issuer assignment picker to the
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
 * subtree. Under a *Radix* dialog that was fatal: its `react-remove-scroll` lock
 * swallowed the wheel event everywhere but its own subtree, so the popover
 * painted and took clicks — Radix re-enables pointer events on its own content —
 * while any list inside it looked frozen. Portalling into the dialog's node put
 * it back inside the whitelisted subtree. `Dialog` is Base UI now (issue #100),
 * which locks the page in CSS and marks the document outside its portal inert
 * rather than trapping the wheel, so the hatch may no longer be load-bearing;
 * proving that needs a browser, and portalling into the panel is correct under
 * either, so the two call-sites keep passing it. Opt-in rather than the default:
 * portalling to `body` is
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
					// A container, not a control: the box corner, never the kit's pill
					// (issue #97). Pill-shaped rows inside it (`CommandItem`, the column
					// menu) sit correctly against it — a pill has no corner of its own to
					// disagree with the surface's.
					"z-50 w-72 rounded-2xl border border-gousse-line bg-gousse-panel text-gousse-ink shadow-lg outline-none",
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
