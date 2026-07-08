---
id: 9
title: OpenAPI spec emit script
state: open
labels: [wayfinder:task]
parent: 1
assignee: none
blocked-by: [7]
---

## Question

Add the committed-OpenAPI-spec pipeline (AFK task; third leg of the map's OpenAPI story, alongside live `/api/openapi.json` and Scalar docs which land with the scaffold). Graduated from fog by [Survey the Effect HttpApi stack](0002-survey-effect-httpapi-stack.md) — the generation API is pure and deterministic, so this is fully specified:

- `scripts/emit-openapi.ts`: import the contract from @mamen/shared, `OpenApi.fromApi(api)`, `Bun.write` pretty-printed JSON to a committed spec file (location: alongside the contract package or repo root — pick at implementation).
- Wire a package/turbo script (e.g. `openapi:emit`) and decide the drift guard: regenerate-and-diff in CI/pre-commit vs. regenerate-on-build (survey confirms output is deterministic — key order stable, nothing time/env-dependent — so diffing is safe).
- Survey reference: [OpenAPI generation, Scalar docs, spec emit](../research/effect-httpapi-stack-survey.md) section (incl. the `fromApi` WeakMap-cache gotcha — one options variant per process).

Resolution records: spec file location, script name, drift-guard choice as implemented.
