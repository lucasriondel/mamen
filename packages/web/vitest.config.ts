import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
	define: {
		__BUILD_DATE__: JSON.stringify("2026-02-09"),
	},
	plugins: [react()],
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts", "./src/test/query-client-setup.tsx"],
		css: true,
		server: {
			deps: {
				// @lucasriondel/gousse-ui ships `"type": "module"` but its dist uses
				// extensionless relative imports (`from "./utils"`), which Node's ESM
				// resolver rejects — `vite build` tolerates it, Vitest's node-side
				// resolution does not. Inlining routes the package through Vite's
				// bundler resolution instead. Drop this once gousse-ui emits
				// extensioned specifiers.
				inline: ["@lucasriondel/gousse-ui"],
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
