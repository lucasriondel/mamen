# gousse-ui theming under Tailwind v4

> **Status: superseded by [ADR 0003](./0003-gousse-is-vendored-from-a-shadcn-registry.md).**
> gousse is a shadcn registry now, not a package: the theme layers and the
> primitives are vendored source under `src/styles/gousse/` and
> `src/components/ui/`, and the dependency, its `.npmrc`, the build credential
> and the Vitest inline workaround are all gone (issues #92, #93, #95, #96,
> #97).
>
> The text below is the decision **as taken**, restored. Each migration slice
> amended it in place because there was no successor record to hold the new
> state; ADR 0003 is that record, so this one goes back to being what it is —
> history. Nothing below describes this repo. What survives the reversal is the
> half ADR 0003 inherits: gousse tokens are the theme source of truth, they are
> rgb channel triples under a `*-gousse-*` namespace, mamen retints the accent,
> and two primitive systems meet at the token layer. What changed is the
> distribution channel, and with it the reason the adapters and the stand-in
> below had to exist at all — a published build cannot be edited, and vendored
> source can.

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
- `src/components/ui/sidebar.tsx` is still a local stand-in. gousse ships a
  `Sidebar`, but under a different surface (`SidebarContent` / `SidebarGroup` /
  `SidebarItem` vs the local `SidebarNav` / `SidebarNavItem`), so swapping it is
  its own change.
- gousse-ui `0.4.0`'s `dist` is `"type": "module"` but uses extensionless
  relative imports, which Node's ESM resolver rejects. `vite build` tolerates
  it; Vitest does not, so `vitest.config.ts` inlines the package via
  `server.deps.inline`. Remove that once gousse-ui emits extensioned
  specifiers.
