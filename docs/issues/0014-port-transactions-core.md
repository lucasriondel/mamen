---
id: 14
title: Port transactions core (CRUD + composable list/count)
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 11]
---

## Question

Port the **core** of the transactions resource per [api-contract.md](../research/api-contract.md) §2.5 — the CRUD endpoints and the redesigned composable list/count. Bulk + targeted-delete ops are split into [Port transactions bulk](0015-port-transactions-bulk.md), which builds on this ticket's handler layer.

This is the **key redesign** of the whole map: the old 9-branch either/or fan-out (where `accountId` dominates and other filters are unreachable) becomes **fully composable AND filters**.

Endpoints here: `list` (paged, composable filters ↓), `count` (same filters minus pagination/order), `getById`, `create`, `update`, `remove` (204, 404 on missing). Errors: `NotFound` on getById/update/remove.

**Composable list filters** (all optional, `AND`-combined, per §2.5): `accountId`, `merchantId`, `categoryId`, `linkedRefundId`, `importMonth`, `importBatchId`, `startDate`, `endDate` (inclusive `date` bounds), `isRefund`, `isDuplicateExcluded`, `orderBy: "date"?`, `direction` (default `desc`), plus `Pagination`. `count` takes the identical struct minus pagination/order → `{ count }`.

Entity carries branded FKs (`accountId: AccountId`, `merchantId?: MerchantId`, …), `Schema.Date` for `date`/`importedAt`, `importMonth` stays string, `anomalyFlags` ported from the existing `@mamen/shared` `AnomalyFlag` type into a Schema, booleans `Schema.optional(Schema.Boolean)`.

## Acceptance criteria

- [ ] `TransactionsGroup` core endpoints match spec §2.5.
- [ ] Every list filter works **independently and in combination** — regression-test the exact cases the old fan-out couldn't do: `accountId + categoryId + startDate` together; `importMonth` alone; `startDate` alone.
- [ ] `count` honors every filter `list` does.
- [ ] `AnomalyFlag` ported to a Schema; entity round-trips through the SDK.
- [ ] `NotFound` on getById/update/remove; `remove` → 204.
- [ ] Integration-tested through the SDK; coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the test harness + coverage baseline.
