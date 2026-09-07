import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { About } from "./components/About";
import { Contributing } from "./components/Contributing";
import { Hero } from "./components/Hero";
import { Install } from "./components/Install";
import { SideMenu } from "./components/SideMenu";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { SITE } from "./content";

/**
 * The public page served at the site root: React components on a TanStack
 * router, rendered to finished HTML at build time (issues #145, #148).
 *
 * `renderPage()` is called by `src/prerender.ts` during the build and what it
 * returns *is* `dist/index.html`, so nginx serves a document and the browser
 * runs no JavaScript to read it. React is a **build-time** dependency here and
 * never reaches the image — the half of the package's original zero-dependency
 * decision that survived the port to a framework
 * (`docs/adr/0002-react-renders-the-landing-page-at-build-time.md`).
 *
 * The root route renders the **whole document**, `<html>` down, because that is
 * the artifact: anything the head must carry has to be part of the tree rather
 * than glued on around it. There is one child route — the page — and it is a
 * router rather than a lone component so that a second page can be added
 * without restructuring this one.
 *
 * Nothing here runs in a browser. Components take no props from a loader, hold
 * no state and register no effects; the tree is rendered once, in Node, and the
 * result is static HTML with no script tag. A `useState` in this file would
 * typecheck, ship, and quietly do nothing.
 *
 * Every word comes from `src/content/` (issue #147) — this file and the
 * components under `src/components/` decide elements and class names, and
 * write no sentence of their own. They also escape nothing by hand: React
 * escapes what it renders, which is what retired the string renderer's own
 * `escape()` and the class of bug it existed for.
 *
 * The stylesheet is linked at its source path — Vite's HTML pass rewrites it to
 * the hashed asset in `dist` and the dev server serves the file directly.
 */

const rootRoute = createRootRoute({
  component: Document,
});

function Document() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f9f7f4" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d0d0c" />
        <meta name="description" content={SITE.description} />
        <title>{SITE.title}</title>
        <link rel="stylesheet" href="/src/styles.css" />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

/**
 * The hero runs the full width above the two-column split, because the app
 * screenshots need the room; everything below it sits beside the section menu.
 *
 * The wordmark over the top is the app icon and the product name, as the app's
 * own sidebar pairs them. The `h1` under the screenshot is the headline, which
 * says what mamen is for rather than what it is called — so the mark and the
 * heading carry different words and neither is a repeat of the other.
 */
function LandingPage() {
  return (
    <div className="page">
      <SiteHeader />
      <Hero />
      <div className="layout">
        <SideMenu />
        <main>
          <About />
          <Install />
          <Contributing />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

/** The tree the router is built from. */
const routeTree = rootRoute.addChildren([indexRoute]);

/**
 * The finished HTML document, as the build writes it.
 *
 * The router runs on a **memory history**: there is no browser here, and the
 * one entry it is seeded with is the site root, so the tree resolves the way a
 * request for `/` will.
 *
 * `renderToStaticMarkup`, not `renderToString`: the difference is the hydration
 * markers, and there is nothing to hydrate. Nothing links a client entry into
 * the document, so React stays a build-time dependency of this package.
 *
 * The doctype is prepended rather than rendered: it is not an element, so no
 * React tree can carry it.
 */
export async function renderPage(): Promise<string> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  // The tree is rendered synchronously below, so anything a route resolves on
  // the way in has to be resolved first. Nothing here loads data today; a
  // render that skipped this would start missing content the moment one does.
  await router.load();

  return `<!doctype html>\n${renderToStaticMarkup(<RouterProvider router={router} />)}\n`;
}
