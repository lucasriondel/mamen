import { LANDING_PAGE_DEV_PORT } from "@mamen/shared/ports";
import { defineConfig } from "vite";
import { PREVIEW_ENTRY } from "./src/preview/route";
import { prerender } from "./src/prerender";

// The public site's root (issue #113). Everything here is the opposite of the
// web package's config: `base` stays `/` — this is the one thing on the domain
// that is *not* under the app's prefix — there is no framework plugin, and
// there is no dev proxy, because the landing container talks to no API.
//
// The page itself is built by `prerender()`: `src/page.ts` renders to a string
// at build time and the result is written into `dist/index.html`, so the
// browser downloads a document rather than a shell.
//
// There are two HTML entries while issue #145's expand step runs. The second
// is the React renderer's temporary route, and it is listed here rather than
// discovered: a multi-page build takes its inputs by name, and naming them
// keeps `dist` to the pages this package means to serve. Still no framework
// plugin — React runs in Node at build time, through the prerender hook, and
// nothing of it is bundled for a browser.
export default defineConfig({
  base: "/",
  plugins: [prerender()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        preview: PREVIEW_ENTRY,
      },
    },
  },
  server: {
    // Pinned, and strict: the registry carries a row for this package
    // (`@mamen/shared/ports`), so a silent hop to the next free port would
    // make that row a lie — and would land on whatever the next row owns.
    port: LANDING_PAGE_DEV_PORT,
    strictPort: true,
  },
});
