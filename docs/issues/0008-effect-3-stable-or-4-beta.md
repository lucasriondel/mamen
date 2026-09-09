---
id: 8
title: Effect 3 stable or Effect 4 beta
state: closed
labels: [wayfinder:grilling]
assignee: lucas
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

## Resolution

**Effect 3 stable** (decided with Lucas, 2026-07-08). Build the rework on effect 3.21.4 + @effect/platform 0.96.2 + @effect/platform-bun 0.90.0 + @effect/sql 0.51.1 + @effect/sql-sqlite-bun 0.52.0 + @effect/vitest 0.29.0 — the exact stack the [survey](../research/effect-httpapi-stack-survey.md) documents.

Rationale: settled, source-verified ground beats landing on the incoming generation. Effect 4 beta churns (94 breaking-capable betas in 5 months, no stable date), docs are sparse, Model/SqlSchema availability on the beta line unverified, and choosing it would invalidate the survey. The eventual 3→4 migration happens later, on official migration guides, against a working test suite — strictly better conditions than migrating mid-rework.

Consequences:
- New Effect packages pin vitest 3.2.4 + @vitest/coverage-v8 3.2.4 (per survey Gotcha 1); @mamen/web stays on vitest 4.
- Survey remains the valid API reference for all implementation tickets.
- Effect 3→4 migration is **out of scope** for this map — a future effort, taken when 4.0 is stable.

Unblocks [Scaffold the new packages](0007-scaffold-new-packages.md).
