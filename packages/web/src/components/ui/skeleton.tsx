import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton primitive — a token-styled placeholder block (ADR 0003: gap-fill for
 * what gousse doesn't ship). Feature-level skeletons compose these into the
 * shape of the content that is loading, so a view's first paint has the same
 * layout as its settled state and nothing jumps when the data lands.
 *
 * Two accessibility rules the call-sites rely on:
 *
 * - a block is `aria-hidden`, because a screen reader has nothing to say about
 *   a grey rectangle. The *container* announces the wait instead — that's what
 *   {@link SkeletonScreen} is for.
 * - the pulse is CSS-only (`animate-pulse`), and Tailwind's `motion-safe`
 *   variant drops it under `prefers-reduced-motion`, matching the policy in
 *   `lib/motion.ts` for the framer-motion side of the app.
 *
 * A block is a **pill** (issue #97). Nearly every call-site is standing in for a
 * line of text or for a control — `h-3.5 w-24`, `h-8 w-28`, `size-7` — and the
 * pill is what makes the placeholder read as the thing it replaces rather than
 * as a grey brick. A block standing in for a panel passes the box corner
 * through `className`, as the round avatars already did.
 */
export function Skeleton({
	className,
	...props
}: React.ComponentPropsWithoutRef<"div">) {
	return (
		<div
			aria-hidden
			className={cn(
				"motion-safe:animate-pulse rounded-full bg-gousse-line",
				className,
			)}
			{...props}
		/>
	);
}

export interface SkeletonScreenProps {
	/**
	 * What is loading, phrased for a screen reader ("Loading transactions…").
	 * Rendered visually hidden — sighted users read the skeleton itself.
	 */
	label: string;
	/** The skeleton blocks making up this screen. */
	children: React.ReactNode;
	className?: string;
}

/**
 * Wrapper announcing a pending region. Its `aria-busy` + implicit live region
 * replace the "Loading…" paragraph the skeletons displace, so the wait is still
 * conveyed to assistive tech even though every block inside is `aria-hidden`.
 *
 * `<output>` rather than a `role="status"` div: it carries the status role
 * implicitly (and the polite live region with it), which is what biome's
 * `useSemanticElements` asks for — the same choice the categories page makes for
 * its live folder totals. `display` comes from `className`, so a flex/grid
 * screen lays out exactly as the settled view does.
 */
export function SkeletonScreen({
	label,
	children,
	className,
}: SkeletonScreenProps) {
	return (
		<output aria-busy="true" className={className}>
			<span className="sr-only">{label}</span>
			{children}
		</output>
	);
}
