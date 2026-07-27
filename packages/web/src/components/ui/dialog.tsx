import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dialog primitives — a gap-fill over Radix `Dialog`, restyled onto the
 * `--gousse-*` tokens (ADR 0002). Hosts the issuer edit dialog (PRD): editing an
 * issuer is a dialog over the grid, not a route change.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Dimmed backdrop behind the dialog. */
function DialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			className={cn(
				"fixed inset-0 z-50 bg-black/50",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
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
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay />
			<DialogPrimitive.Content
				className={cn(
					"fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-gousse-line bg-gousse-panel p-6 text-gousse-ink shadow-lg outline-none",
					// A modal isn't anchored to a trigger, so it scales from centre
					// (emil-design-eng: the transform-origin exception). Enter uses a
					// gentle scale+fade under the ~300ms budget; exit is quicker.
					"duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150",
					"data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
					className,
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close
					className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-md text-gousse-muted outline-none transition-colors hover:bg-gousse-bg hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
					aria-label="Close"
				>
					<X size={18} />
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

/** Header block: title + optional description, stacked. */
export function DialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/** Footer block: actions, right-aligned on wider screens. */
export function DialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
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
			className={cn(
				"text-lg font-semibold text-balance text-gousse-ink",
				className,
			)}
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
