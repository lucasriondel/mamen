# gousse is vendored from a shadcn registry

**Status**: accepted (issue #98).
**Supersedes**: [ADR 0002](./0002-gousse-ui-tailwind-v4-theme-bridge.md) — the
npm-package theme bridge. The token contract and the two-primitive-system seam
carry over unchanged; what moved is where the source lives.

gousse is consumed as a **shadcn registry**, not as a package. `components.json`
declares the `@gousse` namespace
(`https://lucasriondel.github.io/gousse-ui/r/{name}.json`), and
`shadcn add @gousse/<item>` copies that item's source into this repo at the
registry's own targets — the three theme layers to `src/styles/gousse/`, the
primitives to `src/components/ui/`. Nothing arrives through a package `exports`
map any more: the private npm dependency ADR 0002 describes is uninstalled, and
with it went the `.npmrc` aiming its scope at GitHub Packages and the build
credential that `.npmrc` read (issues #92, #93, #95, #96). Every install path
now resolves from the public registry alone, with no secret in it.

What lands is **source we own**. `Button`'s `size` scale, `Empty`'s `icon` slot
and `Textarea`'s focus / disabled / invalid states each used to sit in a thin
local adapter wrapping the published component, for one reason only: an npm
build cannot be edited. Owning the source removed the reason, so every concern
moved into the component itself and the wrappers are gone.

## The trade

Source is copied **at install time**, and that is the whole of the mechanism.
Nothing records which revision an item came from, so there is **no version to
track**: no range to bump, no changelog to read, no lockfile line that says what
`button.tsx` is. The same fact stated from the other side — **upstream fixes
will never reach a component already vendored here.** A bug gousse fixes
tomorrow lives on in this repo until someone re-runs `shadcn add` for that item
by hand, and for a component edited in place that re-run is a fork to reconcile,
not an update to accept.

That is the cost, taken deliberately: **ownership and editability instead of
automatic updates**. The kit is small, its consumer is one app, and the changes
mamen needed were changes to the components themselves — which the package
could never allow and the registry makes ordinary. Read a vendored file as
mamen's code with a known origin, not as a dependency: fix it here, and carry
the fix upstream separately if it belongs there.

## Consequences

- Vendored files fall into **two formatting regimes**, and which one a file is
  in says whether it may be re-installed blind. `src/styles/gousse/` and
  `src/components/ui/sidebar.tsx` are upstream source untouched, so they are
  excluded from biome (`biome.json`) — tabifying them would be reverted by the
  next `shadcn add` and the churn would read as ours. `Button`, `Empty`,
  `Textarea` and `Checkbox` were edited in place, cannot be overwritten cleanly
  anyway, and therefore stay on the repo's formatting.
- Tokens are the theme source of truth and stay **rgb channel triples**, not
  `oklch()` colours. Anything reading a token in raw CSS must wrap it:
  `rgb(var(--gousse-bg))`. Overrides are written as **bare channels**, because
  the `rgb(...)` wrapping lives in gousse's `theme.css`.
- Colour utilities are namespaced `*-gousse-*` (`bg-gousse-panel`,
  `text-gousse-ink`, …), which is what that `@theme` block declares. There is no
  local token stub and no hand-rolled bridge.
- mamen's own tint — `--gousse-accent` on miel's blue in both ramps, rather than
  gousse's warm-orange default — lives in `src/index.css` **below** the imports,
  precisely because the files above it are gousse's and get overwritten.
- Two primitive systems coexist: **Base UI** under the vendored gousse
  components, and **Radix** under the shadcn gap-fills that cover what gousse
  does not ship — `Popover` is Radix, `Command` is cmdk, and
  `Table`, `Input` and `Skeleton` are plain markup. Accepted for velocity; the
  **seam is the token layer**, so a gap-fill is restyled onto the same
  `--gousse-*` tokens rather than given a look of its own. The seam is
  narrowing rather than widening: `Tooltip` was the first gap-fill moved onto
  Base UI directly (issue #99, `@base-ui-components/react` pinned exactly at
  `1.0.0-rc.0`) and `Dialog` the second (issue #100), both asserted in
  `src/components/ui/base-ui-primitives.test.tsx`. The tooltip cost the label's
  `aria-describedby` — Base UI wires no ARIA for a tooltip — which is
  survivable only because nothing the tooltip reveals is available there alone.
  The dialog cost nothing: role, labelling, focus trap, scroll lock and
  dismissal all survive the swap, and only the state attribute its animation
  reads changes spelling (`data-open` / `data-ending-style` for
  `data-state="open"` / `"closed"`).
- The token layer is not the only contract the two systems share. **Shape** is
  the other (issue #97): **`rounded-full`** for anything control-shaped (fields,
  selects, toggles, segmented options, menu and list rows, chips, badges,
  icon-only targets, and the focus ring of a control with no background of its
  own); **`rounded-2xl`** for panels, cards, overlays and the outer frame of a
  table or list; **`rounded-xl`** for a box nested inside one of those, one step
  down so corners nest instead of colliding.
- **Radius is held apart from the shared field chrome.** `FIELD_CHROME` in
  `src/lib/field-chrome.ts` (vendored as `Textarea`'s own dependency) carries
  border, background and inset; the shape is split out into `FIELD_PILL` and
  `FIELD_BOX` so `Textarea` can share the chrome without inheriting a pill it
  would look broken as. `Input` — a gap-fill with chrome of its own — reads
  `FIELD_PILL` rather than restating `rounded-full`, so the one axis the two
  systems must agree on cannot drift.
- **Rounding widens, and it centres.** A pill spends its own horizontal padding
  on the arc, so control insets are `px-4` (`px-3` on the dense `text-xs` tier,
  where a two-word badge would otherwise be mostly padding) and a leading icon
  sits at `left-3`. A narrow numeric field is centred rather than right-aligned:
  digits pushed against the arc read as broken.
- Four elements keep a smaller corner, each of them a glyph-sized **mark** where
  a pill would be a dot and a box corner would swallow the glyph — the
  `Checkbox` tick, its twin in `AccountMultiSelect`, the 16px override marker
  and the 24px brand icon.
- Each contract above is enforced as text, because prose does not fail a build:
  `src/styles/gousse-vendoring.test.ts` (the registry namespace, the vendored
  sheets, the token contract, the import order, the accent ramps),
  `src/components/ui/gousse-primitives.test.ts` (the primitives are owned source
  wrapping nothing, on tokens rather than hardcoded colour),
  `src/lib/shape-contract.test.ts` (no smaller corner anywhere in `src` outside
  the four marks, each held to its count) and
  `src/test/gousse-package-removed.test.ts` (the dependency, the `.npmrc`, the
  build credential and the Vitest inline workaround are gone and stay gone).
