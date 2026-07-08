---
id: 8
title: Effect 3 stable or Effect 4 beta
state: open
labels: [wayfinder:grilling]
assignee: none
parent: 1
blocked-by: []
---

## Question

Which Effect line does the rework build on — stable 3.21.4 or the 4.0 beta? Surfaced by [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md); decide with the user before any scaffolding.

Facts from the survey:

- Effect 4.0 has been in very active beta since 2026-02-18 (94 betas; `4.0.0-beta.94` published 2026-07-07; no announced stable date).
- It restructures the ecosystem: `@effect/platform` folds into core `effect` (HTTP router + multipart deps now in core); `@effect/sql` restructured; `@effect/platform-bun` and `@effect/sql-sqlite-bun` continue as `4.0.0-beta.*` lines.
- The effect-4-beta `@effect/vitest` supports vitest 4 (the repo's current vitest major); the stable-line one requires pinning vitest 3.2.4.
- `effect-query` (closest thing to a tanstack-query bridge standard) already targets effect 4 beta on its main line.
- The whole [survey](../research/effect-httpapi-stack-survey.md) documents Effect 3 APIs. Choosing the 4.0 beta invalidates its import paths and some module layouts — budget a re-research pass if so.

Trade-off to grill: stable + fully documented + community patterns vs. building a from-scratch rework on the API generation that's about to be current (avoiding a 3→4 migration of freshly written code) at the cost of beta churn, sparse docs, and re-surveying.

Blocks [Scaffold the new packages](0007-scaffold-new-packages.md).
