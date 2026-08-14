import { defineConfig } from "vite";
import { prerender } from "./src/prerender";

// The public site's root (issue #113). Everything here is the opposite of the
// web package's config: `base` stays `/` — this is the one thing on the domain
// that is *not* under the app's prefix — there is no framework plugin, and
// there is no dev proxy, because the landing container talks to no API.
//
// The page itself is built by `prerender()`: `src/page.ts` renders to a string
// at build time and the result is written into `dist/index.html`, so the
// browser downloads a document rather than a shell.
export default defineConfig({
	base: "/",
	plugins: [prerender()],
	server: {
		// Pinned, and strict: PORTS.md carries 5100 for this package, so a
		// silent hop to the next free port would make that row a lie.
		port: 5100,
		strictPort: true,
	},
});
