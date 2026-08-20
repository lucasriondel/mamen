import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router";
import {
  DESCRIPTION,
  HEADING,
  LEAD,
  OPEN_APP,
  POINTS,
  SOURCE,
  SOURCE_URL,
  TITLE,
} from "../copy";

/**
 * The landing page as React components on a TanStack router (issue #145).
 *
 * The root route renders the **whole document**, `<html>` down, because that is
 * the artifact: `src/preview/render.tsx` turns this tree into the finished HTML
 * a build writes, so anything the head must carry has to be part of the tree
 * rather than glued on around it. There is one child route — the page — and it
 * is a router rather than a lone component so that the shape the contract step
 * inherits is the one a second page can be added to.
 *
 * Nothing here runs in a browser. Components take no props from a loader, hold
 * no state and register no effects; the tree is rendered once, in Node, and the
 * result is static HTML with no script tag. A `useState` in this file would
 * typecheck, ship, and quietly do nothing.
 *
 * The stylesheet is linked at its source path — Vite's HTML pass rewrites it to
 * the hashed asset, exactly as it does for the root entry.
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
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="description" content={DESCRIPTION} />
        <title>{TITLE}</title>
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

function LandingPage() {
  return (
    <main>
      <h1>{HEADING}</h1>

      <p className="lead">{LEAD}</p>

      <ul className="points">
        {POINTS.map((point) => (
          <li key={point.term}>
            <strong>{point.term}</strong> {point.detail}
          </li>
        ))}
      </ul>

      <p className="actions">
        {/* Plain anchors, not the router's `Link`: both destinations are
            outside this router — the app under its own prefix, and GitHub —
            and a client-side navigation has nothing to navigate to in a page
            that ships no JavaScript. */}
        <a className="cta" href={APP_BASE_PATH_SLASH}>
          {OPEN_APP}
        </a>
        <a className="secondary" href={SOURCE_URL}>
          {SOURCE}
        </a>
      </p>
    </main>
  );
}

/** The tree the preview router is built from. */
export const routeTree = rootRoute.addChildren([indexRoute]);
