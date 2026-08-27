import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppMain, AppShell as AppShellFrame } from "@/components/ui/app-shell";
import { SidebarCollapsedProvider } from "@/lib/sidebar-collapsed-context";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";

/**
 * The app's layout row: the sidebar and the content column every route renders
 * into (issue #106), laid out by gousse's vendored `AppShell`/`AppMain` frame.
 *
 * The frame owns the two-tone split — sidebar on the recessed `bg-gousse-bg`,
 * content column on `bg-gousse-panel` behind its own seam hairline — and stops
 * there. The top bar and scroll region under it are per-page: every route
 * renders through {@link PageLayout}, which mounts gousse's `TopBar` and
 * `AppContent` inside the column, so a page names its title, way back and
 * actions and nothing about how the bar is laid out.
 *
 * The collapse is one flag driving three things — the panel's width on desktop,
 * the drawer's slide on mobile, and whether a page's {@link PageLayout} renders
 * a trigger at all. It lives here rather than in the sidebar because the two
 * controls sit on opposite sides of the panel: closing is driven from the
 * header inside it, re-opening from the top bar outside it. A collapsed panel
 * takes `inert`, so a trigger within it would be unreachable — which is the
 * whole reason the open control is not the close control.
 *
 * `AppShell` only owns the flag and hands it down via
 * {@link SidebarCollapsedProvider}, so every page's trigger toggles the same
 * state and the shell's focus handoff (below) still has one ref to aim at
 * regardless of which page mounted it. Since issue #129 every page goes
 * through that layout, so there is always exactly one.
 *
 * `useSidebarCollapsed` persists the flag, so a user who reclaimed the width
 * does not get the panel back on the next navigation or reload.
 *
 * Animation is the primitive's, not this component's: gousse tweens the panel
 * and fades the trigger in over that same 300ms (`.sidebar-toggle-in`), both
 * behind `prefers-reduced-motion`. Nothing here overrides either.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebarCollapsed();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Only a press hands focus on. A collapse restored from storage must not, or
  // the page opens by stealing the first keystroke for a chrome control.
  const handOnFocus = useRef(false);

  const handleToggle = useCallback(() => {
    handOnFocus.current = true;
    toggle();
  }, [toggle]);

  // The control that was pressed is gone by the next paint — the close button
  // into an `inert` panel, the trigger unmounted — so focus would land back on
  // the document body. Hand it to whichever control took over, which is the
  // keyboard's version of the fade-in: one control, moved.
  useEffect(() => {
    if (!handOnFocus.current) return;
    handOnFocus.current = false;
    (collapsed ? triggerRef : closeRef).current?.focus();
  }, [collapsed]);

  return (
    <AppShellFrame>
      <AppSidebar collapsed={collapsed} onToggle={handleToggle} closeRef={closeRef} />
      {/* The panel-surfaced column. Its top bar and scroll region are the
       * page's — `PageLayout` mounts them, off the flag this provider hands
       * down. */}
      <AppMain>
        <SidebarCollapsedProvider value={{ collapsed, toggle: handleToggle, triggerRef }}>
          {children}
        </SidebarCollapsedProvider>
      </AppMain>
    </AppShellFrame>
  );
}
