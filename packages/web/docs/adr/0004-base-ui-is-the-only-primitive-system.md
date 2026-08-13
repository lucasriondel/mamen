# Base UI is the only primitive system

**Status**: accepted (issue #102).
**Continues**: [ADR 0003](./0003-gousse-is-vendored-from-a-shadcn-registry.md) —
where gousse's source comes from, which is unchanged. What that record listed as
a consequence to live with, *two primitive systems*, is what this one closes.

`radix-ui` is **uninstalled**. It left `@mamen/web`'s manifest and took
forty-three of its scoped members out of the lockfile with it — the seventeen
that stay are `cmdk`'s, on which more below — and no source file in the repo
names it. mamen depends on **one primitive library**:
`@base-ui-components/react`, pinned exactly at `1.0.0-rc.0` — a prerelease under
a caret range would drift into breaking changes on a plain install.

Radix was never a decision here. It arrived underneath the shadcn components
that filled the holes gousse's registry leaves, and it stayed as long as any of
them was still built on it. `Tooltip` (issue #99), `Dialog` (#100) and `Popover`
(#101, twelve call sites) moved those three onto Base UI one at a time; this
record is the state that sequence arrived at, and the rule that keeps it.

## The three converted primitives are mamen-owned source

`src/components/ui/popover.tsx`, `dialog.tsx` and `tooltip.tsx` sit on Base UI,
and they are **not gousse items**. The registry publishes no popover, no dialog
and no tooltip — there is no `shadcn add @gousse/popover` to run — so unlike
`Button`, `Empty` or `sidebar.tsx` they were never vendored and cannot be
re-installed. They are mamen-owned source that happens to import the same
library gousse's components import.

That answers the question ADR 0003 leaves a reader holding. Its two formatting
regimes turn on whether a file may be overwritten by a re-install; these three
are in neither regime, because nothing upstream will ever overwrite them. They
are ordinary repo code: biome formats them, they are edited in place without a
fork to reconcile, and a Base UI upgrade that breaks one is ours to fix. If
gousse ever ships these items, adopting them is a deliberate migration with call
sites to review — not an install.

## What is *not* claimed

`cmdk` stays, untouched and in deliberate use: it is the command palette's
engine, not a Radix package. It does, however, depend on `@radix-ui/react-dialog`
and three of its siblings, so Radix code still reaches the bundle **transitively**
underneath `Command`. "One primitive system" is therefore a claim about mamen's
own dependencies and mamen's own imports, which is what the guard actually
checks — not a claim that no Radix byte ships.

The cost is that there is no second library to reach for when Base UI is missing
something. It has already been paid once: Base UI wires no ARIA for a tooltip in
`1.0.0-rc.0`, so `tooltip.tsx` restates `role="tooltip"` by hand and the label's
`aria-describedby` link is simply gone (#99). The answer to the next such gap is
our own file, or upstream — not `npm install` for one component.

## Consequences

- **A guard test keeps the package out**: `src/test/radix-package-removed.test.ts`
  fails if the name reappears in any workspace manifest, in the lockfile as a
  resolved umbrella, or in any non-prose file in the repo. It is the one file
  allowed to spell the package out, and `@radix-ui/*` scoped members match it too
  — the umbrella is one way back in and a single scoped package is another.
- The reintroduction path is **not a developer choosing Radix**. `shadcn` is
  still a devDependency (it installs the gousse items), its stock registry is
  Radix-based, and a snippet pasted from the shadcn docs brings the import with
  it. None of that is a decision anyone makes out loud, which is why the failure
  has to be a red test rather than a review comment.
- `src/components/ui/base-ui-primitives.test.tsx` holds the positive half: each
  of the three renders on Base UI, alongside what the swap changed in the DOM.
- The repo's root `package-lock.json` is **deleted**. It was a fossil of the
  pre-monorepo app — npm-resolved, months stale, listing `radix-ui` as a direct
  dependency — that nothing reads: bun is the package manager, both Dockerfiles
  copy `bun.lock`, and `bun install --frozen-lockfile` never looked at it. Kept,
  it would have been a live `npm ci` away from reinstalling exactly what this
  record retires.
- ADR 0003's account of the seam stands as history; its enforcement pointer now
  reads here. **The seam is still the token layer** — a primitive is restyled
  onto the `--gousse-*` tokens rather than given a look of its own — but it no
  longer separates two libraries, only vendored source from ours.
- This record's own claims are held by `src/test/base-ui-adr.test.ts`, which also
  asserts that no other document in the repo describes mamen as depending on the
  retired package.
