---
id: 9
title: OpenAPI spec emit script
state: closed
labels: [wayfinder:task]
parent: 1
assignee: luriondel
blocked-by: []
---

## Question

Add the committed-OpenAPI-spec pipeline (AFK task; third leg of the map's OpenAPI story, alongside live `/api/openapi.json` and Scalar docs which land with the scaffold). Graduated from fog by [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md) — the generation API is pure and deterministic, so this is fully specified:

- `scripts/emit-openapi.ts`: import the contract from @mamen/shared, `OpenApi.fromApi(api)`, `Bun.write` pretty-printed JSON to a committed spec file (location: alongside the contract package or repo root — pick at implementation).
- Wire a package/turbo script (e.g. `openapi:emit`) and decide the drift guard: regenerate-and-diff in CI/pre-commit vs. regenerate-on-build (survey confirms output is deterministic — key order stable, nothing time/env-dependent — so diffing is safe).
- Survey reference: [OpenAPI generation, Scalar docs, spec emit](../research/effect-httpapi-stack-survey.md) section (incl. the `fromApi` WeakMap-cache gotcha — one options variant per process).

Resolution records: spec file location, script name, drift-guard choice as implemented.

## Resolution

**Narrowed to the drift guard — the emit half was already delivered by [Scaffold the new packages](0007-scaffold-new-packages.md)** (the walking skeleton required a live + committed spec). Confirmed on arrival: `packages/api/scripts/emit-openapi.ts` (`OpenApi.fromApi(Api)` → `Bun.write` pretty JSON), the `emit-openapi` package script, and the committed `packages/api/openapi.json` all existed and re-emit produced zero diff. So the ticket's first bullet (script + spec file) was done; this session added the missing third leg: the CI drift guard.

**Delivered — regenerate-and-diff drift guard:**

- **Spec file location:** `packages/api/openapi.json` (unchanged; alongside the server package). Live `/api/openapi.json` + Scalar `/docs` continue to serve from the running server (Scaffold).
- **Script name:** `openapi:check` (`bun run scripts/emit-openapi.ts --check`) in `packages/api/package.json`. The existing `emit-openapi` (writer) is untouched.
- **Drift-guard choice:** **regenerate-and-diff in CI**, not regenerate-on-build. `emit-openapi.ts` grew a `--check` mode that regenerates the spec **in memory** and compares string-equal to the committed file — exits `1` with a fix hint (`Run \`bun run emit-openapi\` and commit the result.`) on mismatch or missing file, exits `0` when in sync. It never writes in check mode. Wired into CI by prepending it to the `test` script (`"test": "bun run openapi:check && vitest run"`) — turbo already fans `test` across packages, so a contract change without a re-emit fails the test run with **no new turbo task**. Safe because the survey confirmed `OpenApi.fromApi` output is deterministic (stable key order, nothing time/env-dependent); the WeakMap-cache gotcha is avoided — the script only ever calls `fromApi(Api)` with no options.
- **Files changed:** `packages/api/scripts/emit-openapi.ts` (factored spec-gen, added `--check` branch), `packages/api/package.json` (`openapi:check` script + `test` chaining). `openapi.json` unchanged.

Verified: check passes in sync (exit 0), detects a drifted spec (exit 1), detects a missing spec (exit 1), and `bun run test` runs the check before vitest (2 health tests still green).

No new tickets. The map's OpenAPI story is now complete (live spec + Scalar docs + committed spec + drift guard).
