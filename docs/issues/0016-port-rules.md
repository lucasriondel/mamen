---
id: 16
title: Port rules
state: closed
labels: [wayfinder:impl]
assignee: luriondel
parent: 1
blocked-by: [10, 11]
---

## Question

Port the **rules** resource end-to-end per [api-contract.md](../research/api-contract.md) §2.6, copying the DB-test + coverage pattern from [Port accounts](0011-port-accounts.md).

Endpoints: `list` (paged, `merchantId?` filter), `count` (`merchantId?`, no pagination), `getById`, `getByMerchantPattern` (`GET /rules/by-merchant-pattern/:merchantId/:pattern`), `create`, `update`, `remove` (204). Errors: `NotFound` on getById/getByMerchantPattern/update/remove. `categoryOverride` is `Schema.optional(CategoryId)` (a category id despite the name); `merchantId: MerchantId`.

Dropped: `POST /rules/bulk-add`, `POST /rules/bulk-delete` (both client-only).

## Acceptance criteria

- [x] `RulesGroup` matches spec §2.6; `merchantId` list/count filter works.
- [x] `getByMerchantPattern` two-segment path param decodes + 404s correctly.
- [x] Handler + repository; integration-tested through the SDK; coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the test harness + coverage baseline.
