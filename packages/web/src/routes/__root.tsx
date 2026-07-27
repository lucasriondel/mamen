import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { queryClient } from "@/lib/query-client";

/**
 * Root route — the app shell every feature route renders inside.
 *
 * Wires the cross-cutting providers the PRD assigns to `__root`: the TanStack
 * Query provider (app defaults), `next-themes` for the light/dark toggle, the
 * gousse `Sidebar`, and a `sonner` toaster for mutation-failure surfacing.
 */
function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<div className="flex h-screen w-full bg-gousse-bg text-gousse-ink">
					<AppSidebar />
					<main className="flex-1 overflow-auto p-8">
						<Outlet />
					</main>
				</div>
				<Toaster position="bottom-right" richColors closeButton />
				<ReactQueryDevtools initialIsOpen={false} />
			</ThemeProvider>
		</QueryClientProvider>
	);
}

export const Route = createRootRoute({
	component: RootLayout,
});
