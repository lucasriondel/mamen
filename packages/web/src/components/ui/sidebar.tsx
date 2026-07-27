import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sidebar primitive — placeholder for `@lucasriondel/gousse-ui`'s `Sidebar`.
 *
 * The rebuild's shell is meant to use gousse's `Sidebar` (ADR 0002). That
 * package is un-installable in this environment (private registry), so this is a
 * token-styled local stand-in with a small, compatible surface: a `Sidebar`
 * shell, a `SidebarHeader`, a `SidebarNav`, and `SidebarNavItem` rows. Swap the
 * import for the gousse component once the dependency resolves; call sites use
 * only these names.
 */

/** The sidebar shell — a fixed-width vertical panel. */
export function Sidebar({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<"aside">) {
	return (
		<aside
			className={cn(
				"flex w-60 shrink-0 flex-col gap-4 border-r border-gousse-line bg-gousse-panel p-4",
				className,
			)}
			{...props}
		>
			{children}
		</aside>
	);
}

/** Brand / title area at the top of the sidebar. */
export function SidebarHeader({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<"div">) {
	return (
		<div
			className={cn(
				"px-2 py-1 text-lg font-semibold text-gousse-ink",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

/** The navigation list. */
export function SidebarNav({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<"nav">) {
	return (
		<nav className={cn("flex flex-1 flex-col gap-1", className)} {...props}>
			{children}
		</nav>
	);
}

/**
 * A single nav row. Render-agnostic: pass `asChild`-style children by supplying
 * an anchor/`Link` as `children` and using `SidebarNavItem` purely for styling,
 * or use it as a plain button. Here it renders its children inside a styled
 * wrapper so a router `Link` can be dropped in.
 */
export function SidebarNavItem({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<"div">) {
	return (
		<div className={cn("flex", className)} {...props}>
			{children}
		</div>
	);
}
