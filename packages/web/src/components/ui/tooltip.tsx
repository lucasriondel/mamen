import { Tooltip as TooltipPrimitive } from "@base-ui-components/react/tooltip";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip primitives — the first of mamen's own components to render on
 * **Base UI** (issue #99), restyled onto the `--gousse-*` tokens (ADR 0003).
 * gousse's vendored kit is already Base UI underneath, so this narrows the seam
 * ADR 0003 describes rather than widening it; `Dialog` followed (issue #100) and
 * `Popover` is the last gap-fill still on Radix.
 *
 * Unlike the popover this is a *read* surface: it reveals text the row couldn't
 * fit (an issuer's note on the transactions table) and is never the only way to
 * reach that text — the issuer's page always shows the note in full. A tooltip
 * can't be opened by touch and is skipped by some assistive tech, so nothing
 * that is only available here may be load-bearing. Base UI sharpens that rule:
 * where Radix mirrored the label into a visually hidden node and pointed the
 * trigger's `aria-describedby` at it, Base UI (1.0.0-rc.0) wires no ARIA at all.
 * `role="tooltip"` is restored below — the description *link* is not, since
 * nothing in Base UI's surface exposes the popup's id to the trigger — so the
 * label is now an affordance a screen reader will not announce.
 */

/**
 * Wraps a subtree that contains tooltips. Optional in Base UI — a `Tooltip`
 * works without one — but mounting it once at the app root is what makes the
 * *group* delay work: after one tooltip has opened, moving to a sibling opens it
 * instantly instead of re-waiting the full `delay`, which is what makes scanning
 * a column of them feel responsive rather than sticky.
 *
 * `delay` is Base UI's name for what Radix called `delayDuration`, and 300ms is
 * the value mamen has always used — Base UI's own default is twice that.
 */
export function TooltipProvider({
	delay = 300,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;

/**
 * The element the tooltip is attached to. Renders a `<button>`; a caller
 * substitutes its own element with `render={<El />}` — Base UI's spelling of
 * Radix's `asChild` — and Base UI merges the wiring into it.
 */
export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * The floating label; token-styled and portalled so it clears the table's
 * `overflow` and stacking contexts.
 *
 * Base UI splits Radix's single `Content` in two: a `Positioner` that carries
 * the anchoring and a `Popup` that carries the look. The offset and `z-50` go on
 * the positioner because that is the element in the fixed layer — a `z-index` on
 * the popup, statically positioned inside it, would do nothing. `z-50` matches
 * the popover: a tooltip and a popover are never open on the same trigger at
 * once (opening the popover dismisses the tooltip), so they don't compete. Width
 * is capped by the caller — the content here is free-text and must be allowed to
 * wrap.
 */
export function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> & {
	/** Distance from the trigger in px — passed through to the positioner. */
	sideOffset?: number;
}) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-50">
				<TooltipPrimitive.Popup
					// Base UI gives the popup no role of its own. Radix's did, and the
					// app's tests read the surface through it; restated here so the
					// swap costs no semantics that a single prop can keep.
					role="tooltip"
					className={cn(
						// The box corner the other overlays take (issue #97). On a label this
						// short the radius all but meets in the middle, which is the intent:
						// where a shape is in doubt the kit takes the rounder option.
						"rounded-2xl border border-gousse-line bg-gousse-panel px-2.5 py-1.5 text-gousse-ink text-xs shadow-lg",
						// Origin-aware entrance, matching the popover's. Base UI sets
						// `--transform-origin` per side on the positioner; custom properties
						// inherit, so the popup can read it.
						"origin-(--transform-origin)",
						// `data-instant` is Base UI's own signal that the animation should be
						// skipped — a group re-open, a focus, a dismiss — so it gates both
						// directions instead of being fought with a shorter duration. It is
						// what Radix expressed as its `instant-open` / `delayed-open` split.
						"duration-150",
						"not-data-[instant]:data-[open]:animate-in not-data-[instant]:data-[open]:fade-in-0 not-data-[instant]:data-[open]:zoom-in-95",
						"not-data-[instant]:data-[ending-style]:animate-out not-data-[instant]:data-[ending-style]:fade-out-0 not-data-[instant]:data-[ending-style]:zoom-out-95",
						className,
					)}
					{...props}
				>
					{children}
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}
