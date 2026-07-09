---
id: 17
title: Port subscriptions
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 11]
---

## Question

Port the **subscriptions** resource end-to-end per [api-contract.md](../research/api-contract.md) §2.7, copying the DB-test + coverage pattern from [Port accounts](0011-port-accounts.md).

Endpoints: `list` (paged, **composable** `merchantId?` + `status?`, both AND-combinable — replacing the old `merchantId > status` precedence), `create`, `update`, `getFirstByMerchant` (`GET /subscriptions/first-by-merchant/:merchantId`), `getByMerchantFrequency` (`GET /subscriptions/by-merchant-frequency/:merchantId/:frequency`, `frequency` now a validated `Schema.Literal` — was an unchecked cast). Errors: `NotFound` on update/getFirstByMerchant/getByMerchantFrequency.

**Faithful-port gotcha (spec §1.2):** subscription date fields (`lastChargeDate`, `firstChargeDate`, `detectedAt`, `updatedAt`) stay `Schema.String`, NOT `Schema.Date` — they're strings in both entity and DB today. Do not upgrade them. `transactionIds: Schema.Array(TransactionId)`.

Dropped: `GET /subscriptions/:id`, `DELETE /subscriptions/:id`, `PUT /subscriptions/bulk-put`, `POST /subscriptions/clear` (all client-only). This removes generic get-by-id + delete — re-add deliberately if a frontend need appears.

## Acceptance criteria

- [ ] `SubscriptionsGroup` matches spec §2.7; `merchantId` + `status` filters compose (AND).
- [ ] Subscription date fields are strings (not `Date`); entity round-trips through the SDK unchanged.
- [ ] `frequency` path param validated against the literal union (bad value → decode 400).
- [ ] Integration-tested through the SDK; `NotFound` paths covered; coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the test harness + coverage baseline.
