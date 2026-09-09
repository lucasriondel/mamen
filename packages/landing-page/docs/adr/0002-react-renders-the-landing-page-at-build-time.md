# React renders the landing page, at build time

**Status**: accepted (issues #145, #148).
**Supersedes**: [ADR 0001](./0001-the-landing-page-takes-no-framework.md) — the
no-framework decision. Half of it carries over unchanged and is restated below
as the constraint on this one; what is reversed is the ban on the framework
itself.

The page is **React components on a TanStack router**, rendered once in Node by
`renderToStaticMarkup` and written into `dist/index.html` by the same prerender
plugin that wrote the string renderer's output (`src/page.tsx`,
`src/prerender.ts`). `src/page.ts`, the string renderer, is deleted.

## What is reversed

ADR 0001 said the package takes no framework, and its `dependencies` held one
entry. React and `@tanstack/react-router` are now installed here, and the build
stage of `packages/landing-page/Dockerfile` installs them.

The reason is that "no framework" was the wrong shape for the constraint. What
the constraint was protecting is what the *image* carries: a public page that a
browser reads without executing anything, built out of the public registry, with
none of the app's tree in it. A framework that runs in Node at build time and
emits HTML costs the image nothing. The rule was stricter than its own reason,
and the sibling project this page's shape is taken from — the same author's,
whose landing page is React on TanStack Router with typed content modules —
demonstrates the version that keeps the reason and drops the excess.

Two things the string renderer got wrong made that worth acting on rather than
noting:

- **Escaping was hand-written.** Building a document by concatenation put
  `escape()` in the renderer, and an author who forgot it shipped content the
  browser parsed as markup. React escapes what it renders; the function and its
  whole class of bug are gone.
- **Markup was a template literal.** Nothing typechecked the document, an
  unclosed tag was a runtime surprise, and the structure was indented into a
  string. Components are checked, and the head is part of the tree rather than
  glued on around it.

## What does not change

This is the half inherited from ADR 0001, and it is the half the port was not
allowed to spend.

- **React is a `devDependency`, and stays one.** It runs in Node, at build
  time. Moving it to `dependencies` would be the statement that a browser needs
  it. `src/packaging.test.ts` holds the manifest to sharing nothing with the app
  but `@mamen/shared`.
- **The built page carries no JavaScript at all.** No client entry, no
  hydration, no `<script>` — `renderToStaticMarkup` rather than
  `renderToString` because there is nothing to hydrate. `src/build.test.ts`
  asserts it against a real Vite build: the output has one HTML file, no
  JavaScript chunk, and the content in its bytes.
- **The page's own contract is the string renderer's, unchanged.** One `h1`, a
  document rather than a fragment, the app's prefix read from the constant, no
  link at a path this container does not own, no script tag: `src/page.test.ts`
  is the old suite with the React renderer's folded into it, which is what makes
  the swap checkable rather than merely claimed.
- **No framework plugin.** A framework plugin's job is to serve React to a
  browser; this build has no browser to serve it to. `src/vite-config.test.ts`
  pins the plugin list to the prerenderer alone.
- **Two images, not one**, and the landing image still builds with no registry
  credential. The build stage installs React and is then thrown away; the nginx
  stage copies `dist` out of it.
- **The stylesheet is still hand-written**, and still a restatement of the app's
  ramp rather than an import of its theme layer (issue #146). Taking React did
  not license taking Tailwind: the guard in `src/styles.test.ts` is unchanged.

## How it landed

As an **expand–contract**, because swapping the renderer in one move breaks
every test in the package at once — several of them assert the prerendered
output and the packaging contract, and the package is roughly a thousand lines
including its tests.

- **Expand** (#145): the React renderer was built beside the string one and
  served at a temporary route, `/preview/`, as a second HTML entry. Nothing was
  removed and no existing test changed.
- **In between** (#146, #147): the words moved into typed content modules under
  `src/content/`, read by both renderers, and the palette caught up with the
  app's. `src/copy.test.ts` rendered both pages and compared the text a reader
  sees, which is what made the swap a swap rather than a rewrite — a sentence
  pasted back into either renderer failed there. That guard survives, aimed at
  the one renderer left.
- **Contract** (#148): React took the site root, and the temporary route, the
  second HTML entry, the string renderer and its tests were deleted.

The deployed container is unaffected by all three: it serves `dist` at the
nginx root, exactly as it did.

## Consequences

- **A second page is now cheap.** The router is already there, and the page is
  a route on it. That was the expensive case under ADR 0001.
- **The dev server no longer falls back to the page.** `appType: "mpa"` makes
  Vite answer an unknown path with a 404, which is what `nginx.conf` does. Under
  the default it answered `index.html`, and a deleted route would have looked
  like it still worked.
- **The package's tests still read strings.** The artifact is the document, so
  nothing here mounts a component or queries a DOM, and `vitest.config.ts` still
  has no jsdom in it.
- **The build is slower and the tree is bigger.** React, the router and their
  types are installed for one page. Paid knowingly: the install runs in a
  throwaway stage and nothing of it is in the image.
- **A `useState` in `src/page.tsx` would typecheck, ship, and do nothing.** The
  tree renders once, in Node. That is the trap this shape introduces, and the
  reason the module says so in its header.
