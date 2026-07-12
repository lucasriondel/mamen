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
			className={cn("fixed inset-0 z-50 bg-black/50", className)}
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
					"fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-panel p-6 text-ink shadow-lg outline-none",
					className,
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close
					className="absolute right-4 top-4 rounded-sm text-muted outline-none transition-colors hover:text-ink"
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
			className={cn("text-lg font-semibold text-ink", className)}
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
			className={cn("text-sm text-muted", className)}
			{...props}
		/>
	);
}
