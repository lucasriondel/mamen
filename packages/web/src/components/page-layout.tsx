import { type ReactNode, useCallback, useState } from "react";
import { AppContent, TopBar, TopBarEnd, TopBarStart, TopBarTitle } from "@/components/ui/app-shell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebarCollapsedContext } from "@/lib/sidebar-collapsed-context";
import { cn } from "@/lib/utils";

export interface PageLayoutProps {
  /** The page's name — the top bar's `h1`, and the only required prop. */
  title: ReactNode;
  /**
   * The way *out* of a drill-down — a back link or breadcrumb, leading the bar.
   * A page reached from another page has one; a nav destination does not.
   */
  back?: ReactNode;
  /** The sentence under the bar, for pages that carry one. */
  description?: ReactNode;
  /** This page's own controls, pinned to the far end of the top bar. */
  actions?: ReactNode;
  /**
   * Extra classes for the content region. Tailwind-merged over the default, so
   * a page can cap its width or re-space itself without restating the column.
   */
  className?: string;
  /** The page itself, in the scroll region below the bar. */
  children?: ReactNode;
}

/**
 * The shape every page shares: gousse's **top bar** — title, the
 * sidebar-reopen trigger, the way back, and that page's own actions — over the
 * shell's scrolling content region (issues #125, #129).
 *
 * Before the vendored app-shell, this layout drew the row itself: an `<h1>`
 * and a hand-laid `justify-between` header at the top of the page column. The
 * bar is now the registry's `TopBar`, rendered per page rather than once in
 * the shell, because its contents — the title, the way back, the actions —
 * are the page's to name. The shell's `AppMain` is a flex column, so the bar
 * and the `AppContent` under it land exactly where a shell-owned pair would.
 *
 * The trigger is this layout's own child rather than `TopBar`'s `collapsed`
 * prop: the bar would mount an unref'd button, and `AppShell`'s focus handoff
 * needs to reach the element. Rendered in the same leading position, it keeps
 * the bar's `data-scrolled` contract — the trigger takes a panel surface once
 * content scrolls under it, driven by the content node this layout wires in.
 *
 * The collapse flag stays `AppShell`'s. This layout only reads it, through the
 * sidebar-collapsed context, and drives the shell's toggle — which is what
 * keeps the focus handoff working no matter which page mounted the trigger.
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

  // A callback ref, as in gousse's own `useAppShell`: the bar renders before
  // the content region below it, so a ref object would still be empty on the
  // bar's first pass and nothing would re-render it once it filled. Routing
  // the node through state re-renders the bar the moment there is something
  // to watch.
  const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
  const contentRef = useCallback((node: HTMLDivElement | null) => setContentNode(node), []);

  return (
    <>
      <TopBar scrollNode={contentNode}>
        {/* Only while the panel is collapsed: an open one is closed from the
         * control inside it, and a collapsed one is `inert`, so this is the
         * only way back. */}
        {collapsed ? <SidebarTrigger ref={triggerRef} onClick={toggle} /> : null}
        {back != null ? <TopBarStart>{back}</TopBarStart> : null}
        {/* A flex row, so a title that carries a glyph — a category's icon, an
         * issuer's avatar — sets it beside the name rather than each page
         * re-deciding the gap. */}
        <TopBarTitle className="flex items-center gap-2">{title}</TopBarTitle>
        {actions != null ? <TopBarEnd>{actions}</TopBarEnd> : null}
      </TopBar>
      <AppContent ref={contentRef} className={cn("flex flex-col gap-6", className)}>
        {description != null ? (
          <p className="max-w-prose text-sm text-gousse-muted">{description}</p>
        ) : null}
        {children}
      </AppContent>
    </>
  );
}
