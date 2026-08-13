import { Popover as PopoverPrimitive } from "@base-ui-components/react/popover";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Popover primitives — mamen's own, rendered on **Base UI** (issue #101) and
 * restyled onto the `--gousse-*` tokens (ADR 0003). The second and widest of the
 * three Radix conversions: twelve call sites across transactions, issuers,
 * categories, accounts and the shared colour/icon pickers all share this one
 * surface. `Dialog` is the last primitive still on Radix.
 *
 * Anchors the issuer assignment picker to the clicked transaction cell (PRD),
 * which is why the positioning defaults below are held to Radix's rather than
 * Base UI's: several of these panels hang off a table cell where a changed side
 * or offset is immediately visible.
 */

export const Popover = PopoverPrimitive.Root;

/**
 * The element the popover hangs off. Renders a `<button>`; every call site
 * substitutes its own with `render={<El />}` — Base UI's spelling of Radix's
 * `asChild`. The difference that matters: `asChild` merged the trigger's props
 * into a child, `render` substitutes the caller's element *for* the trigger, so
 * the caller passes an element rather than wrapping one.
 *
 * There is no `PopoverAnchor`. Radix exposed anchoring as its own part; Base UI
 * models it as the positioner's `anchor` prop (an element, ref or getter). No
 * consumer here anchored to anything but its trigger, so nothing is re-exported
 * to stand in for a part that has no users — {@link PopoverContent} takes
 * `anchor` straight through if one ever appears.
 */
export const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Radix's collision middleware, in Base UI's vocabulary: flip to the opposite
 * side when the preferred one doesn't fit, shift along the align axis to stay in
 * view, and never fall back to the perpendicular axis (a panel that wants to be
 * below its trigger must not end up beside it).
 */
const RADIX_COLLISION_AVOIDANCE = {
	side: "flip",
	align: "shift",
	fallbackAxisSide: "none",
} as const;

/**
 * The floating panel; token-styled, with sensible offset + portal.
 *
 * Base UI splits Radix's single `Content` in three: a `Portal`, a `Positioner`
 * that carries the anchoring, and a `Popup` that carries the look. Everything
 * about *where* goes on the positioner — including `z-50`, since that is the
 * element in the fixed layer and a `z-index` on the popup, statically positioned
 * inside it, would do nothing. Everything about *what it looks like* goes on the
 * popup, which is where `className` lands too: it is the box a caller is sizing
 * and padding when it passes `w-80 p-3`.
 *
 * The four positioning props below are Radix's defaults restated, not Base UI's,
 * so the twelve panels land exactly where they used to:
 *
 * - **`align="start"` / `sideOffset={4}`** were already this wrapper's own
 *   choices; Base UI's are `center` and `0`.
 * - **`positionMethod="fixed"`.** Radix's popper defaults to the fixed strategy
 *   ("so users don't have to pick, and we avoid focus scroll issues"); Base UI
 *   defaults to absolute. It is load-bearing for the two pickers that portal
 *   into a scrolling dialog rather than into `body`.
 * - **`collisionPadding={0}`.** Radix keeps no gap from the collision boundary;
 *   Base UI reserves 5px.
 * - **`collisionAvoidance`.** Radix runs `shift` on the align axis and `flip` on
 *   the side axis, with no fallback to the perpendicular axis; Base UI's default
 *   flips on both axes and falls back to the perpendicular one. Spelled out so a
 *   panel that used to flip top/bottom cannot start appearing beside its trigger.
 *
 * `portalContainer` is the escape hatch for a popover **inside a modal dialog**.
 * The portal defaults to `document.body`, which is outside the dialog's DOM
 * subtree — and a Radix modal locks scrolling everywhere *but* that subtree
 * (`react-remove-scroll`). The popover still paints and still takes clicks, since
 * pointer events are re-enabled on the popup itself, but the wheel event is
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
	side,
	alignOffset,
	anchor,
	collisionBoundary,
	collisionPadding = 0,
	portalContainer,
	children,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof PopoverPrimitive.Positioner>,
		| "align"
		| "side"
		| "sideOffset"
		| "alignOffset"
		| "anchor"
		| "collisionBoundary"
		| "collisionPadding"
	> & {
		/** Render the portal here instead of `document.body` — see above. */
		portalContainer?: HTMLElement | null;
	}) {
	return (
		<PopoverPrimitive.Portal container={portalContainer ?? undefined}>
			<PopoverPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				anchor={anchor}
				positionMethod="fixed"
				collisionBoundary={collisionBoundary}
				collisionPadding={collisionPadding}
				collisionAvoidance={RADIX_COLLISION_AVOIDANCE}
				className="z-50"
			>
				<PopoverPrimitive.Popup
					className={cn(
						// A container, not a control: the box corner, never the kit's pill
						// (issue #97). Pill-shaped rows inside it (`CommandItem`, the column
						// menu) sit correctly against it — a pill has no corner of its own to
						// disagree with the surface's.
						"w-72 rounded-2xl border border-gousse-line bg-gousse-panel text-gousse-ink shadow-lg outline-none",
						// Origin-aware entrance: scale in from the trigger, not the centre
						// (emil-design-eng). Base UI sets `--transform-origin` per side on
						// the positioner; custom properties inherit, so the popup reads it.
						"origin-(--transform-origin)",
						// Ungated, unlike the tooltip's. Base UI marks a keyboard-opened or
						// Escape/programmatically-closed popover `data-instant`, but Radix's
						// popover had no such split — it animated every open and every close,
						// and a picker that closes on a pick closes programmatically, so
						// honouring the signal would drop the fade from the commonest path.
						"duration-150 data-[open]:animate-in data-[ending-style]:animate-out",
						"data-[open]:fade-in-0 data-[ending-style]:fade-out-0 data-[open]:zoom-in-95 data-[ending-style]:zoom-out-95",
						className,
					)}
					{...props}
				>
					{children}
				</PopoverPrimitive.Popup>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}
