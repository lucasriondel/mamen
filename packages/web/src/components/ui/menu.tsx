import { Menu as MenuPrimitive } from "@base-ui-components/react/menu";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Menu primitives — mamen's own, on **Base UI**, styled onto the `--gousse-*`
 * tokens like every other primitive here.
 *
 * A menu is not a popover with buttons in it. The difference is the roving focus
 * and the typeahead: a menu owns arrow-key navigation between its items, closes
 * on select, and returns focus to its trigger — behaviour {@link Popover} does
 * not provide and that a hand-rolled list of `<button>`s would have to
 * re-implement per call site. The categories tree collapses four per-row buttons
 * into one of these, so the row's occasional actions stop competing with the
 * data (issue #58 follow-up).
 *
 * Positioning defaults match {@link PopoverContent}'s, for the same reason they
 * were pinned there: panels in this app hang off dense rows, where a changed
 * side or offset is immediately visible.
 */

export const Menu = MenuPrimitive.Root;

/**
 * The element the menu hangs off. Renders a `<button>`; call sites substitute
 * their own with `render={<El />}` — Base UI's spelling of Radix's `asChild`.
 */
export const MenuTrigger = MenuPrimitive.Trigger;

/** A non-interactive heading over a run of related items. */
export function MenuGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel>) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-2 pt-1.5 pb-1 text-[10px] text-gousse-muted uppercase tracking-wider",
        className,
      )}
      {...props}
    />
  );
}

export const MenuGroup = MenuPrimitive.Group;

/** A hairline between runs of items. */
export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator className={cn("my-1 h-px bg-gousse-line", className)} {...props} />
  );
}

/**
 * One action. `danger` tints it with `--gousse-high` — reserved for the
 * destructive item, which also sits last, so a mis-aimed click lands on nothing
 * or on a separator rather than on Delete.
 *
 * A disabled item stays *rendered*: the categories tree disables Delete when the
 * API would refuse it (`CategoryInUse`) and puts the reason underneath, which is
 * only useful if the item is still there to carry it.
 */
export function MenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex w-full cursor-default select-none items-center gap-2.5 rounded-full px-2.5 py-2 text-sm outline-none",
        "data-[highlighted]:bg-gousse-line/60",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        danger ? "text-gousse-high" : "text-gousse-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Radix's collision middleware in Base UI's vocabulary — see `PopoverContent`. */
const RADIX_COLLISION_AVOIDANCE = {
  side: "flip",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

/**
 * The floating panel. As with the popover, Base UI splits Radix's single
 * `Content` into a `Portal`, a `Positioner` that carries the anchoring, and a
 * `Popup` that carries the look — so everything about *where* goes on the
 * positioner (including `z-50`, the element in the fixed layer) and everything
 * about *what it looks like* goes on the popup.
 *
 * `align="end"` rather than the popover's `start`: this hangs off an icon button
 * pinned to the right edge of a row, so aligning to the trigger's start would
 * push the panel off the card.
 */
export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  side,
  alignOffset,
  collisionBoundary,
  collisionPadding = 8,
  portalContainer,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof MenuPrimitive.Positioner>,
    "align" | "side" | "sideOffset" | "alignOffset" | "collisionBoundary" | "collisionPadding"
  > & {
    /** Render the portal here instead of `document.body`. */
    portalContainer?: HTMLElement | null;
  }) {
  return (
    <MenuPrimitive.Portal container={portalContainer ?? undefined}>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        positionMethod="fixed"
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        collisionAvoidance={RADIX_COLLISION_AVOIDANCE}
        className="z-50"
      >
        <MenuPrimitive.Popup
          className={cn(
            // A container, not a control: the box corner, never the kit's pill.
            "min-w-48 rounded-2xl border border-gousse-line bg-gousse-panel p-1.5 text-gousse-ink shadow-lg outline-none",
            "origin-(--transform-origin)",
            "duration-150 data-[open]:animate-in data-[ending-style]:animate-out",
            "data-[open]:fade-in-0 data-[ending-style]:fade-out-0 data-[open]:zoom-in-95 data-[ending-style]:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}
