---
id: 21
title: Adapt web frontend onto @mamen/sdk (post-cutover)
state: open
labels: [wayfinder:task]
assignee: none
parent: 1
blocked-by: []
---

## Question

The [cutover](0020-cutover.md) deleted `@mamen/server`, `@mamen/web-api-legacy`, and the
zod schemas + `zod` dep from `@mamen/shared` — leaving `@mamen/web` broken, exactly as the
map's **Out of scope → Web frontend adaptation** note sanctioned. This ticket is that follow-up
effort: switch the web app onto the derived `@mamen/sdk` client + tanstack-query layer and the
Effect contract, and delete the dead zod-schema / legacy-client shims.

Break scope captured at cutover (197 TS errors in `@mamen/web`, all rooted in two barrels):

- **`packages/web/src/lib/api/index.ts`** — re-exported the deleted `@mamen/web-api-legacy`
  client hooks. Replace with `@mamen/sdk` query/mutation options.
- **`packages/web/src/lib/schemas/index.ts`** — re-exported the deleted zod schemas from
  `@mamen/shared` (`accountSchema`, `createTransactionSchema`, …). Source validation from the
  Effect contract under `@mamen/shared/contract` (or web-local zod schemas if the form layer
  keeps zod). `@mamen/shared` now exports **types only**.
- Everything else (~195 errors) is downstream `any`-inference cascade from those two — fixing
  the barrels should collapse most of it.

Type-only imports from `@mamen/shared` (`web/src/types/index.ts`, `web/src/lib/db/index.ts`)
still resolve — the domain types were kept.

Web still lists its own `zod` dep (for form/runtime validation independent of the API contract);
whether to keep zod there or move fully onto Effect Schema is part of this effort.

## Acceptance criteria

- [ ] `@mamen/web` typechecks and tests pass against `@mamen/sdk` + `@mamen/shared/contract`.
- [ ] `lib/api` and `lib/schemas` shims replaced or removed; no references to `@mamen/web-api-legacy`.
- [ ] Web dev/build green under root `turbo dev` / `turbo build`.

## Blocked by

- Nothing — the cutover ([#20](0020-cutover.md)) unblocked this by making `@mamen/api` live.
