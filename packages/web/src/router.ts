import { APP_BASE_PATH } from "@mamen/shared";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * The app's router.
 *
 * `basepath` is the router's half of serving the SPA under a path prefix
 * (issue #111): route files stay written from `/`, and every href the router
 * builds — and every path it matches against the URL — carries the prefix.
 * It is the same value the Vite build takes as `base`, so the shell, its
 * assets and its links all agree.
 *
 * Built here rather than in `main.tsx` so a test can hold the prefix without
 * mounting the app.
 */
export const router = createRouter({ routeTree, basepath: APP_BASE_PATH });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
