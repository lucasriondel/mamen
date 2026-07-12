import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Empty state — a centered icon/title/description block. Local gap-fill standing
 * in for gousse's `Empty` (ADR 0002); the rebuild uses it for the two inline
 * read-failure / zero-rows states the PRD calls for (query failure and a
 * successful-but-empty list), never a Router error boundary.
 */
export interface EmptyProps extends React.ComponentPropsWithoutRef<"div"> {
	/** Optional icon rendered above the title. */
	icon?: React.ReactNode;
	/** The headline (e.g. "No transactions"). */
	title: string;
	/** Optional supporting line under the title. */
	description?: React.ReactNode;
}

/** Render a centered empty/error state. */
export function Empty({
	icon,
	title,
	description,
	className,
	children,
	...props
}: EmptyProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 rounded-lg border border-line border-dashed bg-panel px-6 py-16 text-center",
				className,
			)}
			{...props}
		>
			{icon ? <div className="text-muted">{icon}</div> : null}
			<p className="font-medium text-ink">{title}</p>
			{description ? (
				<p className="max-w-sm text-sm text-muted">{description}</p>
			) : null}
			{children}
		</div>
	);
}
