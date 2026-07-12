import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Command palette primitives — a gap-fill over `cmdk`, restyled onto the
 * `--gousse-*` tokens (ADR 0002) so it reads as one visual language with the
 * gousse kit. Used by the issuer assignment picker (PRD): fuzzy-search existing
 * issuers, with a "create new issuer" action when nothing matches.
 *
 * cmdk owns filtering/keyboard nav; these wrappers only supply structure and
 * token styling. Keyboard-initiated selection is intentionally un-animated
 * (PRD animation policy).
 */

/** Root list container. */
export function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			className={cn(
				"flex h-full w-full flex-col overflow-hidden rounded-md bg-panel text-ink",
				className,
			)}
			{...props}
		/>
	);
}

/** The search field, with a leading magnifier icon. */
export function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div className="flex items-center gap-2 border-b border-line px-3">
			<Search size={16} className="shrink-0 text-muted" aria-hidden />
			<CommandPrimitive.Input
				className={cn(
					"flex h-10 w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

/** Scrollable results region. */
export function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			className={cn(
				"max-h-64 overflow-y-auto overflow-x-hidden p-1",
				className,
			)}
			{...props}
		/>
	);
}

/** Shown when the query matches nothing. */
export function CommandEmpty(
	props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) {
	return (
		<CommandPrimitive.Empty
			className="py-6 text-center text-sm text-muted"
			{...props}
		/>
	);
}

/** A labelled group of items. */
export function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			className={cn(
				"overflow-hidden p-1 text-ink [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted",
				className,
			)}
			{...props}
		/>
	);
}

/** A selectable row; highlights when active (hover or keyboard). */
export function CommandItem({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			className={cn(
				"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm text-ink outline-none data-[selected=true]:bg-bg data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

/** A thin rule between groups. */
export function CommandSeparator({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			className={cn("-mx-1 my-1 h-px bg-line", className)}
			{...props}
		/>
	);
}
