import { LANDING_PAGE_DEV_PORT } from "@mamen/shared/ports";
import { defineConfig } from "vite";
import { prerender } from "./src/prerender";

// The public site's root (issue #113). Everything here is the opposite of the
// web package's config: `base` stays `/` — this is the one thing on the domain
// that is *not* under the app's prefix — there is no framework plugin, and
// there is no dev proxy, because the landing container talks to no API.
//
// The page itself is built by `prerender()`: `src/page.tsx` renders the React
// tree to a string at build time and the result is written into
// `dist/index.html`, so the browser downloads a document rather than a shell.
//
// **No framework plugin, with React in the package** (issues #145, #148). The
// plugin's job would be to serve React to a browser — a client entry, a refresh
// runtime, a bundle — and none of that exists here: React runs in Node, through
// the prerender hook, and nothing of it is bundled. One entry again, so the
// build needs no `rollupOptions.input`: the expand step's second, temporary one
// went with the string renderer it stood beside.
export default defineConfig({
  base: "/",
  // Not a single-page app, and the dev server should say so. Vite's default
  // falls every unknown path back to `index.html`; nginx answers `=404`
  // (`nginx.conf`), because one static page has no client-side routing to fall
  // back to. `mpa` is the dev server telling the same truth the container does
  // — and is how a deleted route (issue #148's) is seen to be deleted.
  appType: "mpa",
  plugins: [prerender()],
  server: {
    // Pinned, and strict: the registry carries a row for this package
    // (`@mamen/shared/ports`), so a silent hop to the next free port would
    // make that row a lie — and would land on whatever the next row owns.
    port: LANDING_PAGE_DEV_PORT,
    strictPort: true,
  },
});
