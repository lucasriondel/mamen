import path from "node:path";
import { APP_BASE_PATH_SLASH } from "@mamen/shared";
import { API_DEV_PORT, API_PORTLESS_ORIGIN, WEB_DEV_PORT } from "@mamen/shared/ports";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

/**
 * Where the dev server forwards `/api` and `/uploads`.
 *
 * Two spellings, because the package has two ways to be run. Behind portless
 * (`portless.json`) the API's port is ephemeral, so its hostname is the only
 * stable address; run directly (`PORTLESS=0 bun dev:app`) the registry's row
 * is. `PORTLESS_URL` is set by portless in every child it spawns, which makes
 * it the signal for which of the two is in play.
 */
const apiProxyTarget = process.env.PORTLESS_URL
  ? {
      target: API_PORTLESS_ORIGIN,
      // Required, not cosmetic: without it the forwarded `Host` header still
      // says `mamen.localhost`, portless routes the request back here, and
      // answers the loop with `508 Loop Detected`.
      changeOrigin: true,
      ws: true,
    }
  : `http://localhost:${API_DEV_PORT}`;

export default defineConfig({
  // The SPA is served under a path prefix (issue #111): emitted asset URLs and
  // the rewritten `index.html` carry it, and the dev server serves the app
  // under it too — a request to `/` is redirected onto the prefix, so dev and
  // the built container behave the same way. The router takes the unslashed
  // spelling of this same constant as its `basepath` (`src/router.ts`).
  //
  // The `server.proxy` entries below stay at the root deliberately: the proxy
  // middleware runs before the base middleware, so `/api` and `/uploads` are
  // reached exactly where the built app reaches them — same-origin, no CORS.
  base: APP_BASE_PATH_SLASH,
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split("T")[0]),
  },
  plugins: [
    TanStackRouterVite({ routeFileIgnorePattern: ".*\\.test\\.[tj]sx?$" }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Portless (`portless.json`) runs the dev servers behind a proxy and hands
    // each child an ephemeral port in `PORT`; the registry's row is what the
    // package binds when it is run directly (`PORTLESS=0 bun dev:app`). Taking
    // `PORT` first is what lets both spellings work off one config — and
    // `strictPort` still holds for the pinned case, so a taken row is a failed
    // boot rather than a silent hop onto the next one.
    port: Number(process.env.PORT ?? WEB_DEV_PORT),
    strictPort: true,
    proxy: {
      "/api": apiProxyTarget,
      "/uploads": apiProxyTarget,
    },
  },
});
