import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Table primitive — a shadcn-style `<table>` set restyled onto the gousse
 * `--gousse-*` tokens (ADR 0002: gap-fill for what gousse doesn't ship). Used to
 * render TanStack Table cells so the data grid reads in the same visual language
 * as the gousse kit. Thin wrappers over the native table elements; all styling
 * flows through `bg-*`/`text-*`/`border-*` token utilities.
 */

/** Scroll container + the `<table>` element. */
export function Table({
	className,
	...props
}: React.ComponentPropsWithoutRef<"table">) {
	return (
		<div className="w-full overflow-x-auto">
			<table
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
		</div>
	);
}

/** `<thead>` — the header row group. */
export function TableHeader({
	className,
	...props
}: React.ComponentPropsWithoutRef<"thead">) {
	return (
		<thead
			className={cn("[&_tr]:border-b [&_tr]:border-line", className)}
			{...props}
		/>
	);
}

/** `<tbody>` — the data row group. */
export function TableBody({
	className,
	...props
}: React.ComponentPropsWithoutRef<"tbody">) {
	return (
		<tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
	);
}

/** `<tr>` — a row; hover-highlighted via the `bg` token. */
export function TableRow({
	className,
	...props
}: React.ComponentPropsWithoutRef<"tr">) {
	return (
		<tr
			className={cn(
				"border-b border-line transition-colors hover:bg-bg data-[state=selected]:bg-bg",
				className,
			)}
			{...props}
		/>
	);
}

/** `<th>` — a header cell (muted, left-aligned by default). */
export function TableHead({
	className,
	...props
}: React.ComponentPropsWithoutRef<"th">) {
	return (
		<th
			className={cn(
				"h-10 px-3 text-left align-middle font-medium text-muted",
				className,
			)}
			{...props}
		/>
	);
}

/** `<td>` — a data cell. */
export function TableCell({
	className,
	...props
}: React.ComponentPropsWithoutRef<"td">) {
	return (
		<td
			className={cn("px-3 py-2.5 align-middle text-ink", className)}
			{...props}
		/>
	);
}
