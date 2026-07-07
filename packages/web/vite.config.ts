import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
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
		proxy: {
			"/api": "http://localhost:3000",
			"/uploads": "http://localhost:3000",
		},
	},
});
