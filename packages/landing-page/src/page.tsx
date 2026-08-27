import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACTIONS,
  CONTRIBUTING,
  HERO,
  INSTALL,
  prerequisiteLabel,
  SCREENSHOTS,
  screenshotFigures,
  SITE,
} from "./content";

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
 * Every word comes from `src/content/` (issue #147) — this file decides
 * elements and class names, and writes no sentence of its own. It also escapes
 * nothing by hand: React escapes what it renders, which is what retired the
 * string renderer's own `escape()` and the class of bug it existed for.
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

function LandingPage() {
  return (
    <main>
      <Hero />
      <Screenshots />
      <Install />
      <Contributing />
      <Actions />
    </main>
  );
}

function Hero() {
  return (
    <header className="hero">
      <h1>{HERO.heading}</h1>

      <p className="lead">{HERO.lead}</p>

      <ul className="points">
        {HERO.points.map((point) => (
          <li key={point.term}>
            <strong>{point.term}</strong> {point.detail}
          </li>
        ))}
      </ul>
    </header>
  );
}

/**
 * What the app looks like, above the guide to running it (issue #149).
 *
 * `<picture>` with one `prefers-color-scheme` source is the whole mechanism:
 * the browser fetches the frame matching the reader's scheme and never the
 * other, which is both how the swap happens without a script and why the page
 * weighs half of what it ships. The README does the same thing with the same
 * files, which is what `src/screenshots/sync.test.ts` holds the two to.
 *
 * The intrinsic `width`/`height` come from the generated module rather than
 * from a guess: they are what lets the browser reserve the box before the
 * bytes arrive, so the caption below does not jump when it does. The
 * stylesheet scales them back into the column.
 *
 * `loading="lazy"` because this section is below the hero on every viewport,
 * and these are by far the heaviest thing on the page — a reader who never
 * scrolls should not pay for them.
 */
function Screenshots() {
  return (
    <section className="screenshots">
      <h2>{SCREENSHOTS.heading}</h2>

      <p className="section-lead">{SCREENSHOTS.lead}</p>

      {screenshotFigures().map((figure) => (
        <figure key={figure.name}>
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet={figure.dark.src} />
            <img
              src={figure.light.src}
              alt={figure.alt}
              width={figure.width}
              height={figure.height}
              loading="lazy"
              decoding="async"
            />
          </picture>
          <figcaption>
            <strong>{figure.title}</strong> {figure.caption}
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

function Install() {
  return (
    <section className="install">
      <h2>{INSTALL.heading}</h2>

      <p className="section-lead">{INSTALL.lead}</p>

      <ul className="prerequisites">
        {INSTALL.prerequisites.map((prerequisite) => (
          <li key={prerequisite.name}>
            <a href={prerequisite.url}>{prerequisiteLabel(prerequisite)}</a> {prerequisite.detail}
          </li>
        ))}
      </ul>

      <ol className="steps">
        {INSTALL.steps.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            {/* The commands as one block, newlines and all: `<pre>` is what
                makes them copyable in the shape they are typed, and React
                escapes the angle brackets the key placeholder carries. */}
            <pre>
              <code>{step.commands.join("\n")}</code>
            </pre>
          </li>
        ))}
      </ol>

      <ul className="servers">
        {INSTALL.servers.map((server) => (
          <li key={server.name}>
            {/* Both addresses, because the reader may or may not have portless:
                the name it is fronted at, and the port it binds without it. */}
            <strong>{server.name}</strong> <code>{server.url}</code> <code>{server.directUrl}</code>{" "}
            {server.serves}
          </li>
        ))}
      </ul>

      <ul className="environment">
        {INSTALL.environment.map((variable) => (
          <li key={variable.variable}>
            <code>{variable.variable}</code> {variable.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contributing() {
  return (
    <section className="contributing">
      <h2>{CONTRIBUTING.heading}</h2>

      {CONTRIBUTING.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      <p>
        <a href={CONTRIBUTING.link.href}>{CONTRIBUTING.link.label}</a>
      </p>
    </section>
  );
}

function Actions() {
  return (
    <p className="actions">
      {/* Plain anchors, not the router's `Link`: every destination is outside
          this router — the app under its own prefix, and GitHub — and a
          client-side navigation has nothing to navigate to in a page that
          ships no JavaScript. */}
      {ACTIONS.map((action) => (
        <a
          key={action.href}
          className={action.kind === "primary" ? "cta" : "secondary"}
          href={action.href}
        >
          {action.label}
        </a>
      ))}
    </p>
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
