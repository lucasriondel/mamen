import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";

/**
 * Root route — the app shell every feature route renders inside.
 *
 * Wires the cross-cutting providers the PRD assigns to `__root`: the TanStack
 * Query provider (app defaults), `next-themes` for the light/dark toggle, the
 * gousse `SidebarShell`, a `sonner` toaster for mutation-failure surfacing, and
 * the tooltip provider (one at the root, so hovering across a column of
 * tooltips re-opens instantly rather than re-waiting the delay each time).
 *
 * The sidebar's collapsed flag lives here because the shell reflows the row this
 * layout draws, and because the trigger that re-opens it belongs in a top bar
 * outside the panel. It is plain, ephemeral state for now: it exists so the
 * mobile scrim has something to dismiss. Persisting it, and the two controls
 * that drive it, are issue #106.
 */
function RootLayout() {
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<TooltipProvider>
					<div className="flex h-screen w-full bg-gousse-bg text-gousse-ink">
						<AppSidebar
							collapsed={sidebarCollapsed}
							onToggle={() => setSidebarCollapsed((current) => !current)}
						/>
						<main className="flex-1 overflow-auto p-8">
							<Outlet />
						</main>
					</div>
					<Toaster position="bottom-right" richColors closeButton />
					<ReactQueryDevtools initialIsOpen={false} />
				</TooltipProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}

export const Route = createRootRoute({
	component: RootLayout,
});
