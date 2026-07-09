---
id: 15
title: Port transactions bulk (bulk create/put/delete/get + targeted deletes)
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [14]
---

## Question

Add the **bulk and targeted-delete** transaction endpoints on top of the core handler layer from [Port transactions core](0014-port-transactions-core.md), per [api-contract.md](../research/api-contract.md) §2.5.

Endpoints: `bulkCreate` (`POST /transactions/bulk` → 201 `Transaction[]`), `bulkPut` (`PUT /transactions/bulk-put` → 200 `{ count }`), `bulkDelete` (`POST /transactions/bulk-delete` → 200 `{ count }`), `bulkGet` (`POST /transactions/bulk-get` → 200 `Transaction[]`, stays POST — id list in body), `deleteByAccountMonth` (`DELETE /transactions/by-account-month`, **required** `accountId` + `importMonth` query → 200 `{ count }`), `deleteByImportBatch` (`DELETE /transactions/by-import-batch/:batchId` → 200 `{ count }`).

All web-used; all normalized per taxonomy §5 (bulk create → resources[], bulk-put/delete → `{ count }`, bulk-get stays POST). No declared domain errors (bulk ops never 404).

## Acceptance criteria

- [ ] All six endpoints match spec §2.5; success statuses/bodies per taxonomy §5.
- [ ] `bulkCreate` returns created rows with generated ids (201).
- [ ] `deleteByAccountMonth` requires both query params (missing → decode 400); returns rows-deleted count.
- [ ] Integration-tested through the SDK (partial-existence cases for bulk-delete/get); coverage gate passes.

## Blocked by

- [Port transactions core](0014-port-transactions-core.md) (#14) — extends its handler layer + repository (transitively carries #10 + #11).
