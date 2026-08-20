# landing-page — glossary

The public page served at the **site root** (issue #113). HTML and one
stylesheet, prerendered by Vite at build time and served by nginx from its own
image — no runtime, nothing to hydrate. The package is `index.html` (a stub),
`src/page.tsx` (the page), `src/content/` (its words), `src/prerender.ts` (the
Vite plugin that puts one into the other) and `src/styles.css`. One thing in the
build is not made from those: `public/screenshots/`, the copies of the README's
images the page shows (**shipped screenshots**, below), written by a command
from `src/screenshots/`.

The page is React components on a TanStack router, rendered once in Node
(**build-time React**, below). It was a hand-written string until issue #148,
and the reversal of the decision that made it one is recorded rather than
assumed: [ADR 0001](docs/adr/0001-the-landing-page-takes-no-framework.md) is the
no-framework decision as taken, superseded by
[ADR 0002](docs/adr/0002-react-renders-the-landing-page-at-build-time.md), which
states what changed and — more usefully — what did not.

It shares no domain vocabulary with the app: nothing here knows what a
**transaction**, an **issuer** or a **bundle** is, and nothing should. The one
fact it shares with `@mamen/web` is the **path prefix** the app is served under
(`packages/web/CONTEXT.md`), read from `@mamen/shared/app-base-path` so the link
into the app cannot drift from where nginx puts it.

The words live in `src/content/` as typed data rather than in markup (issue
#147), which is what lets a test hold the install guide to the README instead of
a reader holding two documents side by side; the colours caught up with the
app's in issue #146 (**restated palette**, below). What the copy may not do is
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
`nginx.conf` says so with `try_files … =404`, and the dev server says the same
thing with `appType: "mpa"`: under Vite's default it would answer `index.html`
to every unknown path, which is production's answer to none of them.
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

**Build-time React**:
React and `@tanstack/react-router` are **devDependencies** here, and that is a
statement rather than a technicality: `src/page.tsx` runs the router on a memory
history and `renderToStaticMarkup`s the tree in Node, so what reaches the image
is HTML. No client entry, no hydration, no `<script>` — the built page is
asserted to carry none, and there is no framework plugin in `vite.config.ts`,
because a framework plugin's job is serving React to a browser. A runtime
dependency on React would mean the browser assembling a page this package exists
to serve finished. That line is where the superseding decision draws itself
([ADR 0002](docs/adr/0002-react-renders-the-landing-page-at-build-time.md)): the
package took a framework, not a runtime.
_Avoid_: SSR (there is no server rendering per request — the render happens once,
at build).

**Expand–contract**:
How the page changed renderer without a commit that broke the package. The
**expand** step (issue #145) built the React page beside the string one and
served it at a temporary `/preview/` route, a second HTML entry, removing
nothing; two more issues moved the words into `src/content/` (#147) and the
palette onto the app's ramp (#146) with both renderers reading them; the
**contract** step (#148) gave React the root and deleted the route, the second
entry, the string renderer and its tests. What made the swap a swap rather than a
rewrite is that the words were shared and compared across both renderers while
they stood side by side — the surviving half of that guard is `src/copy.test.ts`.
Nothing about the route reached nginx, so nothing had to be taken back out of it.
_Avoid_: migration (nothing was converted — the two forms existed at once, and
the old one was deleted, not upgraded), staging (the temporary route was one
extra path on the same container, not a separate deployment).

**Restated palette**:
The app's colour ramp, written out again in `src/styles.css` (issue #146): the
warm-tinted `--gousse-*` neutrals — red down to blue, never a pure grey — with
mamen's blue accent over them. **Restated, not imported**: this package takes
none of the app's Tailwind, theme layer or component library, so the values are
a second copy, and `src/styles.test.ts` is what stops the two from drifting —
it reads the app's sheets at test time and holds these against them. Two
deliberate differences from a straight copy: the light scheme's muted step is
darkened until it clears 4.5:1, because this page sets paragraphs in it where
the app sets labels; and dark is a `prefers-color-scheme` media query rather
than the app's `.dark` class, because there is no script here to resolve a
stored choice with. The accent is a **highlight** — link colour, focus ring —
and never a fill: the call to action is an ink-filled pill, exactly as the app's
primary button is.
_Avoid_: theme (there is nothing to switch — the reader's preference is the
whole input), design tokens (these are six custom properties, not a contract
anything else consumes).

**Content module**:
One section of the page as typed data, under `src/content/` — the site's
metadata, the hero, the install guide, the contributing note and the call to
action, one module each (issue #147). The renderer reads them and writes no
sentence of its own: it was written that way because two renderers holding the
same words is exactly the drift **expand–contract** invites, and
`src/copy.test.ts` — which compared both pages while both existed — is what kept
the contract step a swap of the renderer rather than a rewrite of the page. It
still bans a package file from restating any of the copy, which is the rule that
outlives the second renderer.
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

**Shipped screenshots**:
The four `.webp` frames the page shows — a light and a dark of Transactions and
of Recap — as **copies** under `public/screenshots/` (issue #149). The originals
are captured for the README once, into `docs/screenshots/`
(`.claude/skills/demo-screenshots/SKILL.md`), and the README points straight at
them; the page cannot, because this image is built from a context that excludes
`docs/` and is served from a different origin than the repository host. So the
copies are **generated, never hand-placed**: `bun run landing:screenshots`
rewrites the directory and writes `src/content/screenshots.gen.ts` — the URLs,
the intrinsic sizes, the digests — which is the page's only knowledge of the
images, and `src/screenshots/sync.test.ts` renders that module again from the
sources and fails on any difference. What the generator cannot write lives beside
it in `src/content/screenshots.ts`: the heading, a sentence per surface, and the
alt text, which is the README's word for word and held equal to it — the same
rule as **README sync**, for the same reason.
The weight is **capped, not watched** (`src/screenshots/manifest.ts`): 600 kB
across every frame, 300 kB per scheme, since `<picture>` fetches one of each pair
and never both. Screenshots are the heaviest thing here by an order of magnitude
and a denser or more legible screenshot is a *larger* file, so the command
refuses to write over the ceiling rather than letting the page grow inside an
image diff. Raising it is a trade to make in a commit that says why.
_Avoid_: assets (Vite hashes and bundles those; these are copied in verbatim,
because the URLs in the generated module are the URLs nginx answers), thumbnails
(they are full-resolution frames — at twice the widest size the page shows them,
which is what `src/styles.test.ts` holds).

**Honest copy**:
What the page may claim, which is less than a landing page usually does. mamen
is single-user and self-hosted; there is nothing to sign up for, nothing to join
and no service on offer, so the only call to action it has is the install guide.
The shape came from a sibling project whose content documents a Google OAuth
consent screen, its data sub-processors and an AI vendor's retention policy —
none of which exist here, and carrying them over would describe a product that
does not exist. Both halves are asserted, not just intended
(`src/content/prose.test.ts`).
