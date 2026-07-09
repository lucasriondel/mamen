---
id: 12
title: Port categories
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 11]
---

## Question

Port the **categories** resource end-to-end per [api-contract.md](../research/api-contract.md) §2.3, copying the DB-test + coverage pattern settled by [Port accounts](0011-port-accounts.md).

Endpoints: `list` (paged, **composable filter** — `parentId?` + `orderBy: "sortOrder"?`, both optional and combinable, replacing the old 4-branch fan-out), `getById`, `getBySlug`, `create`, `bulkCreate` (→ 201 `Category[]`), `update`, `remove`. Errors: `NotFound` on getById/getBySlug/update/remove. `parentId` is `Schema.NullOr(CategoryId)` (null = root). **No `Conflict`** — `slug` has no DB unique constraint (faithful port).

Dropped vs today: `GET /categories/root`, `PUT /categories/bulk-put`, `POST /categories/clear` (all client-only).

## Acceptance criteria

- [ ] `CategoriesGroup` matches spec §2.3; composable `parentId`/`orderBy` list filter works (both independently and combined).
- [ ] `bulkCreate` returns created rows with generated ids (201).
- [ ] Handler layer + repository; integration-tested through the SDK; `NotFound` paths covered.
- [ ] Coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the `:memory:` test-layer helper + coverage baseline it settles.
