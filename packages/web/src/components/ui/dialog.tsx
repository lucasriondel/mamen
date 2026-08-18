import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dialog primitives — the second of mamen's own components to render on
 * **Base UI** (issue #100, after the tooltip's #99), restyled onto the
 * `--gousse-*` tokens (ADR 0003). `Popover` is the last one still on Radix.
 * Hosts the issuer edit dialog (PRD): editing an issuer is a dialog over the
 * grid, not a route change.
 *
 * Base UI's parts don't line up one-to-one with Radix's: the overlay is a
 * `Backdrop`, the panel a `Popup`, and open/closed is spelled `data-open` and
 * `data-ending-style` rather than `data-state="open"` / `"closed"`. Everything
 * the two systems agree on is kept as it was — the same class strings, the same
 * centred `fixed` panel, the same close affordance — so this is a swap of the
 * internals and nothing else. What Base UI adds for free is what Radix also
 * gave: the panel is `role="dialog"`, labelled by {@link DialogTitle} and
 * described by {@link DialogDescription} through generated ids, focus is trapped
 * while it is open and returned to the opener when it closes, the page behind it
 * stops scrolling, and Escape or a click on the backdrop dismisses it.
 *
 * The panel is a **container, not a control**, so it takes the box corner
 * (`rounded-2xl`) rather than the kit's pill (issue #97). Its close button is
 * the opposite case — an icon-only control — and is a pill, which is also why
 * nothing has to be said about concentric radii here: a pill has no corner to
 * disagree with the panel's.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Dimmed backdrop behind the dialog. Base UI ships it unstyled and unpositioned,
 * so the fixed layer is ours — as it was under Radix, and with the same classes.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/50",
        "data-[open]:animate-in data-[ending-style]:animate-out data-[open]:fade-in-0 data-[ending-style]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/** Centered panel with a built-in close affordance. */
export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      {/* Base UI offers a `Viewport` to centre the popup in; the panel keeps
          centring itself instead, so the one element consumers hold a ref to
          (for the pickers that portal inside it) stays the panel itself. */}
      <DialogPrimitive.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-gousse-ink shadow-lg outline-none",
          // A modal isn't anchored to a trigger, so it scales from centre
          // (emil-design-eng: the transform-origin exception). Enter uses a
          // gentle scale+fade under the ~300ms budget; exit is quicker.
          "duration-200 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:duration-150",
          "data-[open]:fade-in-0 data-[ending-style]:fade-out-0 data-[open]:zoom-in-95 data-[ending-style]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-bg hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
          aria-label="Close"
        >
          <X size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/** Header block: title + optional description, stacked. */
export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/** Footer block: actions, right-aligned on wider screens. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-balance text-gousse-ink", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-gousse-muted", className)}
      {...props}
    />
  );
}
