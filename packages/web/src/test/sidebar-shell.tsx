import type { ReactNode } from "react";
import {
  type SidebarCollapsedContextValue,
  SidebarCollapsedProvider,
} from "@/lib/sidebar-collapsed-context";

/**
 * The shell context a page needs to render outside `AppShell` (issue #129).
 *
 * Every page's topbar is a `PageLayout`, and the layout reads the collapse flag
 * to decide whether it renders the sidebar-reopen trigger. The flag is
 * `AppShell`'s and the hook throws without it — deliberately, so a real page
 * can't render a dead trigger — so a view test mounted on its own supplies a
 * stand-in rather than the whole shell. Each harness used to declare its own;
 * this is the one they share, so a change to the context's shape lands in one
 * place instead of a dozen.
 *
 * The flag is faked here, never driven: what a *page* test asserts is that its
 * topbar offers the trigger at all. Toggling, the focus handoff and persistence
 * are the shell's own contract (`app-shell.test.tsx`), and which controls the
 * layout draws in which state is `page-layout.test.tsx`.
 */
export function shell(
  overrides: Partial<SidebarCollapsedContextValue> = {},
): SidebarCollapsedContextValue {
  return {
    collapsed: false,
    toggle: () => {},
    triggerRef: { current: null },
    ...overrides,
  };
}

/** The panel open — no trigger, the state a page test doesn't care about. */
export const OPEN_SHELL = shell();

/** The panel collapsed — the state in which a page must offer the way back. */
export const COLLAPSED_SHELL = shell({ collapsed: true });

/** Wrap a page in the context `AppShell` puts around it in the app. */
export function withShell(ui: ReactNode, value: SidebarCollapsedContextValue = OPEN_SHELL) {
  return <SidebarCollapsedProvider value={value}>{ui}</SidebarCollapsedProvider>;
}
