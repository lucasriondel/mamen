# gousse-ui theming under Tailwind v4

> **Superseded in part (issues #92, #93, #95, #96).** Nothing below arrives
> through the npm package's `exports` map any more. The three stylesheets are
> **vendored source** under `src/styles/gousse/` (#92); the four primitives
> mamen uses — `Button`, `Empty`, `Textarea`, `Checkbox` — are **vendored
> source** under `src/components/ui/` (#93); and `Sidebar` followed the same way
> (#95). All are installed from gousse's shadcn registry (the `@gousse`
> namespace in `components.json`). The token contract and every consequence
> listed here are unchanged — only the distribution channel moved.
> **`@lucasriondel/gousse-ui` is no longer a dependency at all** (#96): it is
> out of the manifest and the lockfile, and with it went the `.npmrc` scope
> configuration, the `NODE_AUTH_TOKEN` the web image took as a build arg, and
> the Vitest `server.deps.inline` workaround. #98 rewrites this ADR around the
> registry.

`@lucasriondel/gousse-ui` is the primary component kit (Base UI under the hood),
but it ships a **Tailwind v3** artifact — a JS `preset.js` consumed via
`presets: [...]`. This web app is **Tailwind v4** (CSS-first `@theme`, no
`presets` config), so the v3 preset cannot be consumed directly.

We resolved this **upstream in gousse-ui** rather than in web: gousse-ui gains an
additive `./theme.css` export (a v4 `@theme` block mapping every `--gousse-*`
token to `--color-gousse-*` / shadow / animation utilities). The existing v3
`preset.js` stays for other consumers — the change is non-breaking. web pins
`@lucasriondel/gousse-ui@^0.4.0` from the GitHub registry and `@import`s
`tokens.css` + `theme.css` + `effects.css`.

Access to the private registry *was* configured by a repo-root `.npmrc`
(`@lucasriondel:registry=https://npm.pkg.github.com`) reading `NODE_AUTH_TOKEN`
from the environment, so the token was never committed. Both files are gone
(#96): every install path now resolves from the public registry alone.

gousse tokens are the theme source of truth; the few shadcn/Radix gap-fill
components (Table, Dialog, Command, Popover — things gousse does not ship) are
restyled onto the same `--gousse-*` tokens so the two primitive systems (Base UI
+ Radix) present one visual language.

## Consequences

- Colour utilities are namespaced `*-gousse-*` (`bg-gousse-panel`,
  `text-gousse-ink`, …) because that is what gousse's published `theme.css`
  declares. The earlier local bridge exposed unprefixed `bg-bg` / `text-ink`
  names; those were renamed across the package (~520 occurrences, 68 files).
- Tokens are **rgb channel triples**, not `oklch()` colours. Anything reading a
  token in raw CSS must wrap it: `rgb(var(--gousse-bg))`. Overrides are written
  as bare channels (see the accent override in `src/index.css`).
- mamen overrides `--gousse-accent` to miel's blue in both ramps rather than
  taking gousse's warm-orange default, so the two apps read as one language.
- Two primitive systems (Base UI via gousse, Radix via shadcn gap-fills)
  coexist. Accepted for velocity; the seam is the token layer.
- `Button`, `Empty`, `Textarea` and `Checkbox` are gousse primitives **vendored
  into `src/components/ui/`** (#93), not wrapped. Three of them used to carry a
  thin local adapter — `Button`'s `size` scale and focus ring, `Empty`'s
  `icon`/`children` slots, `Textarea`'s focus/disabled/invalid states — for one
  reason only: an npm build cannot be edited. Owning the source removed the
  reason, so each concern now lives in the component itself (`size` as a second
  cva axis beside `variant`, `icon` as a real prop). Call-sites were untouched.
  Keep them on the token utilities so a retheme stays a token-level edit.
- `src/components/ui/sidebar.tsx` is **gousse's own source, vendored** from the
  registry (issue #95). The local stand-in is deleted; call sites moved from
  `SidebarNav` / `SidebarNavItem` to `SidebarContent` / `SidebarItem`, and the
  router link is grafted on with TanStack's `createLink`, since `SidebarItem`
  renders the `<a>` itself. Like the vendored stylesheets it is excluded from
  biome, so the next `shadcn add` is not reformatted into a diff — unlike the
  four above, which were edited in place and so stay on the repo's formatting.
- gousse-ui `0.4.0`'s `dist` was `"type": "module"` but used extensionless
  relative imports, which Node's ESM resolver rejects. `vite build` tolerated
  it; Vitest did not, so `vitest.config.ts` inlined the package via
  `server.deps.inline`. That workaround is gone with the package itself (#96) —
  vendored source is bundled like any other file under `src/`, so there is
  nothing left to inline.
