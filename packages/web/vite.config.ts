import path from "node:path";
import { APP_BASE_PATH_SLASH } from "@mamen/shared";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

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
		port: 5070,
		strictPort: true,
		proxy: {
			"/api": "http://localhost:5500",
			"/uploads": "http://localhost:5500",
		},
	},
});
