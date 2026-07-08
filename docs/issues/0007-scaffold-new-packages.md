---
id: 7
title: Scaffold the new packages
state: open
labels: [wayfinder:task]
assignee: none
parent: 1
blocked-by: [2, 8]
---

## Question

Stand up the three-package skeleton so per-resource ports have a home. AFK task, using versions/patterns from [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md):

- Resolve the naming collision: new `@mamen/api` (server) vs the existing `@mamen/api` (client hooks). Frontend is allowed to break — decide whether old packages are deleted/renamed now or parked until cutover, and do it.
- Create/rework the packages: `@mamen/shared` (Effect Schema + contract home, zod dependency dropped from it), `@mamen/api` (platform-bun server entry, layers skeleton, dev script teeing to `logs/server.log` per repo convention), `@mamen/sdk` (client derivation + tanstack-query layer skeleton, react-query peer dep).
- Wire the workspace: turbo tasks (dev/build/test/typecheck), tsconfig refs, biome, vitest + @effect/vitest config, v8 coverage gate config (threshold per map notes).
- One walking-skeleton endpoint end-to-end as proof: `/api/health` defined in the contract, implemented in the server, hit through the derived SDK client in an integration test, visible in `/api/openapi.json` and Scalar docs.

Resolution records: package layout as built, versions pinned, how to run dev/test, what was done with the old packages.
