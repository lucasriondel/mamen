# The landing page takes no framework

> **Status: superseded by [ADR 0002](./0002-react-renders-the-landing-page-at-build-time.md).**
> The page is React on a TanStack router now, rendered to HTML in Node at build
> time (issues #145, #148). What survives the reversal is the half ADR 0002
> inherits, and it is the important half: the container still serves a finished
> document with no JavaScript in it, and the app's dependency tree still never
> reaches the image that ships. What changed is that the *build* takes a
> framework, and that "no dependency" narrowed to "no runtime dependency".
>
> The text below is the decision **as taken**, and nothing under this header
> describes this package today. It is a record written at supersession, from
> where the decision was actually written down before it had a record of its
> own: issue #113's acceptance criteria, and the package's own prose — the
> module header of `src/page.ts`, the opening of `src/styles.css`, and the
> `CONTEXT.md` glossary. All of those said the same thing in the same words,
> and `src/page.ts` was deleted by the ticket that wrote this file. Keeping the
> claim somewhere is the point: a reversal that leaves no trace of what it
> reversed reads, later, as though nobody had ever decided anything.

## Context

The app moved under `/app` in issue #111 and the site root came free, so
`packages/landing-page` was added to serve it (issue #113): a Vite package
building to prerendered static HTML, with its own Dockerfile serving the output
through nginx.

Two things about that package were not obvious and had to be chosen.

**Two images, not one.** The landing site and the app are separate containers
behind one reverse proxy. Someone self-hosting mamen builds the app, not the
owner's public site, so the landing content must not ride along in the web
image, and the app's dependency tree must not ride along in the landing one.
The landing image must build for anyone who clones the repo, out of the public
npm registry, with no private registry access at all.

**One page is not an application.** The whole artifact is a single document: a
heading, a paragraph, an install guide, and a link into the app under its
prefix. There is no state, no data, no navigation and no second page.

## Decision

The package takes **no framework**. `src/page.ts` renders a finished HTML
document as a string, `src/prerender.ts` is a Vite plugin that calls it at build
time and writes the result into `dist/index.html`, and `src/styles.css` is one
hand-written stylesheet that Vite emits as a hashed asset. The manifest's
`dependencies` hold exactly one entry — `@mamen/shared`, reached through its
import-free subpaths, for the app's path prefix and the port registry's row.

Nothing is assembled in a browser, because there is nothing to assemble: the
text is in the bytes nginx sends. No runtime, no hydration, no client entry, no
`<script>` in the output at all.

The app's styling is not imported either. No Tailwind, no theme layer, no
component library: one page's worth of CSS is smaller than the tooling that
would generate it, and taking that tooling is the dependency this decision
exists to keep out of the image.

## Consequences

- **Escaping is the renderer's job.** Building a document by concatenation
  means content written through raw reaches the browser as markup. The install
  guide is what makes that load-bearing rather than theoretical: a step's
  command carries angle brackets, and unescaped they are a tag the browser
  silently swallows.
- **The page is a string, so its tests read a string.** There is no DOM to
  query and no component to mount; the artifact *is* the text, and every
  assertion in the package is made against it.
- **A second page would cost more than the first.** There is no router and no
  layout, so the second page is where this shape starts to hurt.
- **The colours are a copy.** With the app's theme layer out of reach, the
  landing page restates the ramp by hand, and a test reads the app's sheets to
  hold the two copies together.
