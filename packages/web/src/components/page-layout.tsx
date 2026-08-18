import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebarCollapsedContext } from "@/lib/sidebar-collapsed-context";
import { cn } from "@/lib/utils";

export interface PageLayoutProps {
  /** The page's name — the topbar's `h1`, and the only required prop. */
  title: ReactNode;
  /**
   * The way *out* of a drill-down — a back link or breadcrumb, above the title
   * row. A page reached from another page has one; a nav destination does not.
   */
  back?: ReactNode;
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
 * trigger, and that page's own actions — above the page's content (issues #125,
 * #129).
 *
 * Before this, each page composed that row itself: an `<h1>` with the same three
 * classes, half of them wrapped in a `PageHeader` for the trigger and half not,
 * plus a `justify-between` header laid out by hand wherever a page had actions.
 * Twelve copies that agreed only by inspection — and the ones that skipped the
 * wrapper stranded anyone who collapsed the sidebar there. This owns the row
 * instead, so a page names what is *in* it and nothing about how it is laid out,
 * and a trigger is a property of being a page rather than of remembering.
 *
 * The trigger is rendered here rather than in a component of its own: with every
 * page going through this layout there is exactly one place that decides when it
 * appears (collapsed only) and one place that hands `AppShell` the ref it
 * focuses — which is what `PageHeader` existed to guarantee across many callers.
 *
 * The collapse flag stays `AppShell`'s. This layout only reads it, through the
 * sidebar-collapsed context, and drives the shell's toggle — which is what keeps
 * the focus handoff working no matter which page mounted the trigger.
 */
export function PageLayout({
  title,
  back,
  description,
  actions,
  className,
  children,
}: PageLayoutProps) {
  const { collapsed, toggle, triggerRef } = useSidebarCollapsedContext();

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-2">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* `min-w-0` so a long title truncates inside the row rather than
           * pushing this page's actions off the end of it. */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {/* Only while the panel is collapsed: an open one is closed from
               * the control inside it, and a collapsed one is `inert`, so this
               * is the only way back. */}
              {collapsed ? <SidebarTrigger ref={triggerRef} onClick={toggle} /> : null}
              {/* A flex row, so a title that carries a glyph — a category's
               * icon, an issuer's avatar — sets it beside the name rather than
               * each page re-deciding the gap. */}
              <h1 className="flex min-w-0 items-center gap-2 text-balance text-2xl font-semibold text-gousse-ink">
                {title}
              </h1>
            </div>
            {description != null ? <p className="mt-1 text-gousse-muted">{description}</p> : null}
          </div>
          {/* Only when a page has any: an empty flex item would still take the
           * `gap` beside the title. */}
          {actions != null ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      {children}
    </section>
  );
}
