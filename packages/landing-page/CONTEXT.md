# landing-page — glossary

The public page served at the **site root** (issue #113). One HTML file and one
stylesheet, prerendered by Vite at build time and served by nginx from its own
image — no framework, no runtime, nothing to hydrate. The whole package is
`index.html` (a stub), `src/page.ts` (the page), `src/prerender.ts` (the Vite
plugin that puts one into the other) and `src/styles.css`.

It shares no domain vocabulary with the app: nothing here knows what a
**transaction**, an **issuer** or a **bundle** is, and nothing should. The one
fact it shares with `@mamen/web` is the **path prefix** the app is served under
(`packages/web/CONTEXT.md`), read from `@mamen/shared/app-base-path` so the link
into the app cannot drift from where nginx puts it.

The copy is provisional — this slice delivered the package, the build, the
container and the routing; the real copy and design are a follow-up. What it may
not do is oversell: mamen is single-user and self-hosted, there is nothing to
sign up for, and a page implying otherwise is worse than no page.

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for the cross-context terms and
[docs/operations/deploy.md](../../docs/operations/deploy.md) for how the two
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
