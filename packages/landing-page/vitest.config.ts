import { defineConfig } from "vitest/config";

// No DOM: the page is prerendered to an HTML *string* at build time, so every
// assertion here is about text a build produces, not about a rendered document.
// jsdom would only invite tests that parse what nginx will serve verbatim.
export default defineConfig({
	test: {
		environment: "node",
		globals: false,
	},
});
