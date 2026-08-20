import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { PREVIEW_ROUTE } from "./route";
import { routeTree } from "./routes";

/**
 * The preview page, rendered to finished HTML at build time (issue #145).
 *
 * The router runs on a **memory history**: there is no browser here, and the
 * one entry it is seeded with is the route the build writes the result to, so
 * the tree resolves the same way a request for `/preview/` will. `basepath` is
 * that prefix too — the page is a child of it, not of `/`, and without it the
 * router would look for a route named `preview`.
 *
 * `renderToStaticMarkup`, not `renderToString`: the difference is the hydration
 * markers, and there is nothing to hydrate. Nothing links a client entry into
 * the document, so React is a build-time dependency of this package and never
 * reaches the image — which is the property the whole package is built around,
 * and the one the contract step must not spend.
 *
 * The doctype is prepended rather than rendered: it is not an element, so no
 * React tree can carry it.
 */
export async function renderPreviewPage(): Promise<string> {
  const router = createRouter({
    routeTree,
    basepath: PREVIEW_ROUTE,
    history: createMemoryHistory({ initialEntries: [PREVIEW_ROUTE] }),
  });

  // The tree is rendered synchronously below, so anything a route resolves on
  // the way in has to be resolved first. Nothing here loads data today; a
  // render that skipped this would start missing content the moment one does.
  await router.load();

  return `<!doctype html>\n${renderToStaticMarkup(<RouterProvider router={router} />)}\n`;
}
