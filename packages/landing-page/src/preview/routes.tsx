import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router";
import { ACTIONS, CONTRIBUTING, HERO, INSTALL, prerequisiteLabel, SITE } from "../content";

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
 * Every word comes from `src/content/` (issue #147) — this file decides
 * elements and class names, and writes no sentence of its own.
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
            <strong>{server.name}</strong> <code>{server.url}</code> {server.serves}
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

/** The tree the preview router is built from. */
export const routeTree = rootRoute.addChildren([indexRoute]);
