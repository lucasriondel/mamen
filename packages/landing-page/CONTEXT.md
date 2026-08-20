# landing-page — glossary

The public page served at the **site root** (issue #113). HTML and one
stylesheet, prerendered by Vite at build time and served by nginx from its own
image — no runtime, nothing to hydrate. The package is `index.html` (a stub),
`src/page.ts` (the page), `src/content/` (its words), `src/prerender.ts` (the
Vite plugin that puts one into the other) and `src/styles.css`.

Beside it, at a **preview route**, the same page rendered a second way: React
components on a TanStack router, under `src/preview/` (issue #145). That is the
expand half of an expand–contract; both renderers ship until the contract step
picks one.

It shares no domain vocabulary with the app: nothing here knows what a
**transaction**, an **issuer** or a **bundle** is, and nothing should. The one
fact it shares with `@mamen/web` is the **path prefix** the app is served under
(`packages/web/CONTEXT.md`), read from `@mamen/shared/app-base-path` so the link
into the app cannot drift from where nginx puts it.

The words live in `src/content/` as typed data rather than in markup (issue
#147), which is what lets a test hold the install guide to the README instead of
a reader holding two documents side by side. What the copy may not do is
oversell: mamen is single-user and self-hosted, there is nothing to sign up for,
and a page implying otherwise is worse than no page.

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for the cross-context terms and
[DEPLOY.md](../../DEPLOY.md) for how the two
containers sit behind one domain.

## Language

**Site root**:
The paths this package's container answers — everything the reverse proxy does
not route to the web container, which owns `/app`, `/api` and `/uploads`. The
root is what the app gave up when it moved under its prefix, and owning it is
this package's entire job. An unknown path here is a **404**, not the page: one
static page has no client-side routing to fall back to, unlike the SPA's shell.
_Avoid_: home page (this is the site's root, not the app's landing view — the
app's own first screen is the transactions view).

**Path split**:
Which path prefix the reverse proxy sends to which container, written down once
as data in `src/topology.ts` — the site root here, `/app`, `/api` and `/uploads`
to the web container — and matched by longest prefix, as Traefik matches its
rules. It lives in this package because the site root is what this package owns:
the table is the answer to "what does the landing container serve", read both
ways. It is **not runtime code** — the page ships as HTML with no JavaScript at
all — and nothing may import it; its readers are the tests and `DEPLOY.md`,
whose routing table is asserted against it rather than written by hand. The app's
prefix in it is `APP_BASE_PATH` (`@mamen/shared`), never the literal.
_Avoid_: routing config (nothing reads this at runtime; the reverse proxy and the
two nginx configs are the config, and this is what they are held to).

**Access boundary**:
The paths the Cloudflare Access application covers: exactly the ones the web
container answers, and no more. It is **one** application over three domains, not
three applications — Access issues its cookie per application, so a separately
gated `/api` answers the SPA's same-origin fetch with a login redirect. The site
root sits outside the boundary on purpose: gating the public page defeats the
point of having one, so a logged-out visitor gets the page at `/` and a login
prompt at `/app`. Both directions are one test each (`src/topology.test.ts`),
because a gap on either side is a silent failure — the database open, or the
public page behind a login.
_Avoid_: authentication (the app has none of its own; this is in front of it),
firewall (it is an identity check, not an address one).

**Prerendered page**:
The finished HTML `renderPage()` returns, written into `dist/index.html` at
build time by the `mamen:prerender-landing-page` plugin. Prerendered means the
text is in the bytes nginx sends: the built output contains no `<script>` at
all, so nothing is assembled in the browser. The page lives in TypeScript rather
than in `index.html` so it can read a constant and be asserted by a test; the
HTML entry on disk is a stub the plugin replaces wholesale, and the plugin runs
`pre` so Vite's own HTML pass still rewrites the stylesheet to its hashed asset.
_Avoid_: SSR, static site generation (nothing renders per request, and there is
one page — no generator, no routes, no data).

**Preview route**:
`/preview/`, where the React renderer answers while it stands beside the string
one (issue #145). Temporary by construction: the **expand** step of an
expand–contract adds the new form without taking the old one away, so the site
root keeps serving `src/page.ts` and every test written against it keeps
passing. It is a second HTML entry (`preview/index.html`, another stub) built
to `dist/preview/index.html`, which the existing `try_files … $uri/` and
`index index.html` already resolve — the route needs no nginx block, and so
none has to be taken back out. The contract step moves the React page to `/`
and deletes this prefix, `src/page.ts` and this entry with it.
_Avoid_: staging, beta (nothing is deployed separately or gated — it is one
extra path on the same container).

**Build-time React**:
React and `@tanstack/react-router` are **devDependencies** here, and that is a
statement rather than a technicality: `src/preview/render.tsx` runs the router
on a memory history and `renderToStaticMarkup`s the tree in Node, so what
reaches the image is HTML. No client entry, no hydration, no `<script>` — the
built page is asserted to carry none. A runtime dependency on React would mean
the browser assembling a page this package exists to serve finished.
_Avoid_: SSR (there is no server rendering per request — the render happens once,
at build).

**Content module**:
One section of the page as typed data, under `src/content/` — the site's
metadata, the hero, the install guide, the contributing note and the call to
action, one module each (issue #147). Both renderers read them and neither
writes a sentence of its own: two renderers holding the same words is exactly
the drift expand–contract invites, so `src/preview/copy.test.ts` renders both,
compares the text a reader sees, and bans a package file from restating any of
it. It keeps the contract step a swap of the renderer rather than a rewrite of
the page.
It is **data, not markup**: nothing renders it — no markdown pass, no entities —
so an asterisk meant as emphasis reaches the reader as an asterisk, and a
backticked command reaches them with its backticks. `src/content/prose.test.ts`
is that rule, walked over every string in the structure.
_Avoid_: template, i18n bundle (there is one language and no substitution — a
module is read as the value it is).

**README sync**:
The install guide is the README's install path *structured*, so the two can be
reconciled by a test rather than by reading them side by side
(`src/content/readme-sync.test.ts`): the same commands, in the same order, the
prerequisites at the version the repo pins, the three dev-server URLs and the
one variable with no default. The landing page is the document that goes stale —
nobody re-reads it while changing a port — and structure is what makes the
staleness fail a test run. A **command** therefore lives in its step's
`commands` field, never inside a sentence: prose is compared loosely, a block a
reader copies is compared literally.
_Avoid_: docs generation (the README is not built from this, nor this from it —
they are written separately and held equal).

**Honest copy**:
What the page may claim, which is less than a landing page usually does. mamen
is single-user and self-hosted; there is nothing to sign up for, nothing to join
and no service on offer, so the only call to action it has is the install guide.
The shape came from a sibling project whose content documents a Google OAuth
consent screen, its data sub-processors and an AI vendor's retention policy —
none of which exist here, and carrying them over would describe a product that
does not exist. Both halves are asserted, not just intended
(`src/content/prose.test.ts`).
