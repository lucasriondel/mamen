# gousse-ui theming under Tailwind v4

`@lucasriondel/gousse-ui` is the primary component kit (Base UI under the hood),
but it ships a **Tailwind v3** artifact — a JS `preset.js` consumed via
`presets: [...]`. This web app is **Tailwind v4** (CSS-first `@theme`, no
`presets` config), so the v3 preset cannot be consumed directly.

We resolved this **upstream in gousse-ui** rather than in web: gousse-ui gains an
additive `./theme.css` export (a v4 `@theme` block mapping every `--gousse-*`
token to `--color-gousse-*` / shadow / animation utilities), published as
`0.3.0`. The existing v3 `preset.js` stays for other consumers — the change is
non-breaking. web pins `@lucasriondel/gousse-ui@^0.3.0` from the GitHub registry
and `@import`s `theme.css` + `tokens.css` + `effects.css`.

gousse tokens are the theme source of truth; the few shadcn/Radix gap-fill
components (Table, Dialog, Command, Popover, Tooltip — things gousse does not
ship) are restyled onto the same `--gousse-*` tokens so the two primitive
systems (Base UI + Radix) present one visual language.

## Consequences

- web's build is **blocked** on gousse-ui `0.3.0` being published. Sequencing:
  fix + publish gousse-ui first, then build web against it.
- Two primitive systems (Base UI via gousse, Radix via shadcn gap-fills)
  coexist. Accepted for velocity; the seam is the token layer.
