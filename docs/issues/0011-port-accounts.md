---
id: 11
title: Port accounts (first DB-backed resource; settles test harness + coverage)
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10]
---

## Question

Port the **accounts** resource end-to-end onto the new Effect stack, following [api-contract.md](../research/api-contract.md) §2.2. This is the **first DB-backed port**, so it also settles two things the map left open (map fog "Test harness details") that every later port copies:

- **The sqlite `:memory:` test-layer wiring under `HttpApiLive`** — fresh DB per test vs `it.layer` + table reset. Pick one, document it, make it reusable.
- **The coverage threshold number** — the gate is provisional 70/60 ([scaffold](0007-scaffold-new-packages.md)); set the real number here.

Deliver the full vertical slice: contract group → server handler layer + `@effect/sql-sqlite-bun` repository → derived SDK query layer → integration tests through the SDK against an in-memory sqlite layer.

Endpoints (contract §2.2): `list` (paged), `getById`, `getByName`, `create`, `update`, `remove`. Errors: `NotFound` on getById/getByName/update/remove; no `Conflict` (no uniqueness constraint). `remove` → 204. `update`/`remove` now **404 on missing id** (behavior change, taxonomy §6).

## Acceptance criteria

- [ ] `AccountsGroup` contract matches spec §2.2 (branded `AccountId`, `Paged(Account)` list, `Schema.Date` timestamps, create/update payloads).
- [ ] Server handler layer + account repository on `@effect/sql-sqlite-bun`; `SqlError` UNIQUE→`Conflict` boundary rule wired (even though accounts has no unique field — establishes the pattern).
- [ ] Every endpoint integration-tested **through the derived SDK client** against an in-memory sqlite layer; `NotFound` paths covered.
- [ ] `:memory:` test-layer wiring settled + documented (a reusable helper the next ports use).
- [ ] Coverage threshold set to a real number; gate passes.
- [ ] `@effect/vitest` unit tests for the account service.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10) — needs the branded id, `Paged`/`Pagination`, and `NotFound` error.
