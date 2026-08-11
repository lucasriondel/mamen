# gousse-ui theming under Tailwind v4

> **Superseded in part (issues #92, #95).** The three stylesheets below are no
> longer read out of the npm package's `exports` map: they are **vendored
> source** under `src/styles/gousse/`, installed from gousse's shadcn registry
> (the `@gousse` namespace in `components.json`). The token contract and every
> consequence listed here are unchanged — only the distribution channel moved.
> `Sidebar` followed the same way (#95); every other primitive still comes from
> npm. Issue #98 rewrites this ADR around the registry once they all have.

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

Access to the private registry is configured by a repo-root `.npmrc`
(`@lucasriondel:registry=https://npm.pkg.github.com`) reading `NODE_AUTH_TOKEN`
from the environment, so the token is never committed.

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
- `Button` and `Empty` are gousse primitives wrapped by thin local adapters in
  `src/components/ui/`. gousse's `Button` has no `size` prop and gousse's `Empty`
  has no `icon`/`children` slots, both of which mamen's call-sites use; the
  adapters keep mamen's surface and delegate look and press/hover behaviour to
  the primitive. Collapse them if gousse ever grows those props.
- `src/components/ui/sidebar.tsx` is **gousse's own source, vendored** from the
  registry (issue #95) — the first primitive to arrive that way rather than
  through the npm package. The local stand-in is deleted; call sites moved from
  `SidebarNav` / `SidebarNavItem` to `SidebarContent` / `SidebarItem`, and the
  router link is grafted on with TanStack's `createLink`, since `SidebarItem`
  renders the `<a>` itself. Like the vendored stylesheets it is excluded from
  biome, so the next `shadcn add` is not reformatted into a diff.
- gousse-ui `0.4.0`'s `dist` is `"type": "module"` but uses extensionless
  relative imports, which Node's ESM resolver rejects. `vite build` tolerates
  it; Vitest does not, so `vitest.config.ts` inlines the package via
  `server.deps.inline`. Remove that once gousse-ui emits extensioned
  specifiers.
