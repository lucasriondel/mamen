import type { Plugin } from "vite";
import { renderPage } from "./page";
import { isPreviewPath } from "./preview/route";

/**
 * Writes the prerendered page into Vite's HTML entries.
 *
 * `index.html` is a stub — Vite resolves a build from an HTML file, and this
 * package's page lives in TypeScript (`src/page.ts`) so it can read
 * `APP_BASE_PATH` and be asserted by a test. The hook throws the stub away and
 * returns the rendered document in its place, in dev and in build alike, so
 * the page a developer sees on the dev server is the page the container
 * serves.
 *
 * There are two entries while issue #145's expand step runs, and the hook is
 * called once per entry: the site root still gets `renderPage()`, and the
 * temporary preview route gets the React renderer instead. The dispatch is on
 * `ctx.path` — the request path — matched by **prefix**: a browser may ask for
 * `/preview/` or `/preview/index.html`, and while Vite happens to normalise the
 * first into the second before this hook runs, that is its business and not a
 * thing this package should depend on knowing.
 *
 * The React renderer is reached through a dynamic import so that the root's
 * path — and `vite.config.ts`, which loads this module — never pulls React in.
 * That the old form still costs nothing is the point of expanding before
 * contracting.
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
      handler: async (_html, ctx) => {
        if (isPreviewPath(ctx.path)) {
          const { renderPreviewPage } = await import("./preview/render");
          return await renderPreviewPage();
        }

        return renderPage();
      },
    },
  };
}
