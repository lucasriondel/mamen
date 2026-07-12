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
		setupFiles: [
			"./src/test/setup.ts",
			"./src/test/query-client-setup.tsx",
		],
		css: true,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
