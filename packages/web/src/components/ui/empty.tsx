import { Empty as GousseEmpty } from "@lucasriondel/gousse-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Empty state — a thin adapter over gousse's `Empty` primitive (ADR 0002).
 *
 * gousse owns the look (gradient panel, dashed/solid border, shadow) and the
 * copy slots (`title` / `description` / `action`). mamen's call-sites predate
 * that API: they additionally pass an `icon` above the title and put their
 * action link in `children`, neither of which gousse models. Rather than
 * rewrite the call-sites onto a narrower surface, this wrapper keeps mamen's
 * props and forwards onto the primitive:
 *
 * - `children` → gousse's `action` slot (its own `mt-6` spacing applies);
 * - `icon` is rendered here, above the primitive's title, since gousse has no
 *   icon slot. It sits in the panel's top padding so the primitive's internal
 *   vertical rhythm is left untouched.
 */
export interface EmptyProps {
	/** Optional icon rendered above the title. */
	icon?: React.ReactNode;
	/** The headline (e.g. "No transactions"). */
	title: string;
	/** Optional supporting line under the title. */
	description?: React.ReactNode;
	/** Optional action (button/link) rendered below the copy. */
	children?: React.ReactNode;
	/** Border treatment — `dashed` (default) or `solid`. */
	variant?: "dashed" | "solid";
	className?: string;
}

/** Render a centered empty/error state on gousse's `Empty`. */
export function Empty({
	icon,
	title,
	description,
	children,
	variant,
	className,
}: EmptyProps) {
	if (icon == null) {
		return (
			<GousseEmpty
				title={title}
				description={description}
				action={children}
				variant={variant}
				className={className}
			/>
		);
	}

	return (
		<div className={cn("relative", className)}>
			<span className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center text-gousse-muted">
				{icon}
			</span>
			<GousseEmpty
				title={title}
				description={description}
				action={children}
				variant={variant}
			/>
		</div>
	);
}
