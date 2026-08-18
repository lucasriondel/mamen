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
 * Query provider (app defaults), `next-themes` for the colour scheme, a
 * `sonner` toaster for mutation-failure surfacing, and the tooltip provider (one
 * at the root, so hovering across a column of tooltips re-opens instantly rather
 * than re-waiting the delay each time).
 *
 * The scheme is a choice of three (issue #143): `light`, `dark`, or `system` —
 * the default, resolved against `prefers-color-scheme`, so an app nobody has
 * expressed an opinion about matches the machine it is on. `attribute="class"`
 * is what the `--gousse-*` dark ramp keys off. The provider applies all of this
 * in an effect, one frame after the shell paints, so `index.html` runs the same
 * resolution synchronously before it — see the note there. `settings-view.test.tsx`
 * reads these props as text, so the row's options cannot outgrow them.
 *
 * The layout itself — sidebar, top bar, content column — is `AppShell`, which
 * also owns and persists the collapsed flag. It is a component rather than
 * markup here so the collapse can be tested without standing up every provider
 * around it.
 */
function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
