import type { Plugin } from "vite";
import { renderPage } from "./page";

/**
 * Writes the prerendered page into Vite's HTML entry.
 *
 * `index.html` is a stub — Vite resolves a build from an HTML file, and this
 * package's page lives in TypeScript (`src/page.tsx`) so it can read
 * `APP_BASE_PATH` and be asserted by a test. The hook throws the stub away and
 * returns the rendered document in its place, in dev and in build alike, so
 * the page a developer sees on the dev server is the page the container
 * serves.
 *
 * There is one entry again. Issue #145's expand step added a second one for the
 * React renderer's temporary route and this hook dispatched between the two on
 * `ctx.path`; the contract step (#148) gave React the root and took both the
 * route and the string renderer away, so there is nothing left to dispatch on.
 *
 * `order: "pre"` is load-bearing: Vite's own HTML pass runs *after* the pre
 * hooks and is what turns `/src/styles.css` into the hashed asset in `dist`.
 * Returned `post`, this document would arrive too late and ship a link to a
 * source path no built site has.
 */
export function prerender(): Plugin {
  return {
    name: "mamen:prerender-landing-page",
    transformIndexHtml: {
      order: "pre",
      handler: async () => await renderPage(),
    },
  };
}
