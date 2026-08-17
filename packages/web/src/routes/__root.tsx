import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";

/**
 * Root route — the app shell every feature route renders inside.
 *
 * Wires the cross-cutting providers the PRD assigns to `__root`: the TanStack
 * Query provider (app defaults), `next-themes` for the light/dark toggle, a
 * `sonner` toaster for mutation-failure surfacing, and the tooltip provider (one
 * at the root, so hovering across a column of tooltips re-opens instantly rather
 * than re-waiting the delay each time).
 *
 * The layout itself — sidebar, top bar, content column — is `AppShell`, which
 * also owns and persists the collapsed flag. It is a component rather than
 * markup here so the collapse can be tested without standing up every provider
 * around it.
 */
function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<TooltipProvider>
					<AppShell>
						<Outlet />
					</AppShell>
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
