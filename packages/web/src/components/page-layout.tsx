import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export interface PageLayoutProps {
	/** The page's name — the topbar's `h1`, and the only required prop. */
	title: ReactNode;
	/** The sentence under the title, for pages that carry one. */
	description?: ReactNode;
	/** This page's own controls, pinned to the far end of the topbar row. */
	actions?: ReactNode;
	/**
	 * Extra classes for the page column. Tailwind-merged over the default, so a
	 * page can cap its width or re-space itself without restating the column.
	 */
	className?: string;
	/** The page itself, below the topbar. */
	children?: ReactNode;
}

/**
 * The shape every page shares: a **topbar row** — title, the sidebar-reopen
 * trigger, and that page's own actions — above the page's content (issue #125).
 *
 * Before this, each page composed that row itself: an `<h1>` with the same three
 * classes, wrapped in {@link PageHeader} for the trigger, and (on the pages that
 * have actions) a `justify-between` header laid out by hand. Eight copies that
 * agreed only by inspection. This owns the row instead, so a page names what is
 * *in* it and nothing about how it is laid out.
 *
 * The trigger is still {@link PageHeader}'s — composed, not re-implemented, so
 * there is one place that decides when it renders and one place that hands the
 * shell its ref. That is also why the pages not yet migrated are unaffected:
 * they keep calling the same component this one calls.
 *
 * The collapse flag stays `AppShell`'s. This layout only reads it, through the
 * sidebar-collapsed context, and drives the shell's toggle — which is what keeps
 * the focus handoff working no matter which page mounted the trigger.
 */
export function PageLayout({
	title,
	description,
	actions,
	className,
	children,
}: PageLayoutProps) {
	return (
		<section className={cn("flex flex-col gap-6", className)}>
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<PageHeader>
						<h1 className="text-balance text-2xl font-semibold text-gousse-ink">
							{title}
						</h1>
					</PageHeader>
					{description != null ? (
						<p className="mt-1 text-gousse-muted">{description}</p>
					) : null}
				</div>
				{/* Only when a page has any: an empty flex item would still take the
				 * `gap` beside the title. */}
				{actions != null ? (
					<div className="flex items-center gap-2">{actions}</div>
				) : null}
			</header>

			{children}
		</section>
	);
}
