---
id: 6
title: Design the new REST contract
state: closed
labels: [wayfinder:grilling]
assignee: luriondel
parent: 1
blocked-by: [2, 3, 4, 5]
---

## Question

What is the full new REST contract — every resource, endpoint, schema? Wire compatibility is explicitly NOT required; redesign freely. To decide with the user (grilling + domain-modeling), resource by resource, using the [inventory](0004-inventory-current-api-surface.md) as the checklist:

- Final resource list and boundaries — does the transactions query-param fan-out become one list endpoint with composable filters? Do settings/app-settings merge?
- Per endpoint: method, path, query/path-param schemas, payload schema, success schema + status, which taxonomy errors it can return.
- List endpoints: filter params (composable, not either/or dispatch), ordering, any pagination (or explicitly none).
- Upload endpoints per the [uploads research](0003-uploads-static-files-under-httpapi.md).
- ID types (numeric today), date handling (replacing the date-parser plugin with Schema.Date semantics), nullability conventions.
- What dead endpoints from the inventory get dropped.

Resolution is a contract spec document (linked asset, e.g. `docs/research/api-contract.md`) precise enough that a per-resource port ticket needs no further contract decisions. On close: graduate the per-resource port tickets from the map's fog.

## Resolution

Full new REST contract designed with Lucas via grilling (2026-07-09); spec asset at [docs/research/api-contract.md](../research/api-contract.md). Precise enough that a per-resource port ticket implements a group with **no further contract decisions** — every endpoint's method/path/param-schema/payload/success-status/declared-errors is fixed, grounded in the [inventory](0004-inventory-current-api-surface.md) checklist, [error taxonomy](../research/error-taxonomy.md), and [uploads research](0003-uploads-static-files-under-httpapi.md).

**Six load-bearing decisions** (grilled):

1. **Transactions list → fully composable AND filters.** The old 9-branch either/or fan-out (`accountId` dominates) is gone: every filter (accountId, merchantId, categoryId, linkedRefundId, importMonth, importBatchId, startDate, endDate, isRefund, isDuplicateExcluded) is an independent optional query param, `AND`-combined. `count` takes the same filter struct (minus pagination/ordering). `subscriptions` and `categories` list fan-outs likewise become composable.
2. **Settings and app-settings stay two separate resources.** LLM config duplication (loose `llm_*` strings in `/settings` + typed `/app-settings.llm`) accepted as-is — faithful port, least frontend churn.
3. **Drop the broken orphan + all 14 client-only endpoints** — tightest surface. Contract carries only web-used endpoints + health + database backup. The four dropped `*/clear` ops are subsumed by `POST /database/reset`. Full drop list in the spec §3.
4. **Branded ids everywhere** — `AccountId`/`TransactionId`/… `Schema.Int.pipe(Schema.brand(...))`; path params decode via `NumberFromString → brand`; FKs use the target brand. This retires the hand-written `"Invalid id"` error (non-numeric = schema decode 400).
5. **All lists paginated** — uniform `{ items, total }` envelope via a shared `Paged`/`Pagination` helper; `total` is the pre-limit filtered count. Default page 50.
6. **Keep all bulk ops + database verbs, normalized** — transaction bulk create/put/delete/get and database reset/export/import survive, re-typed per taxonomy (bulk create → 201 resources[], bulk-put/delete → 200 `{count}`, bulk-get stays POST, export stays POST).

Also settled: **dates** (`Schema.Date` for datetime fields; subscription date fields stay `Schema.String` — faithful; `importMonth` stays string); **nullability** (`Schema.optional` for omittable, `Schema.NullOr` for `category.parentId`); **fixed the zod `displayPreferences` drift** in `SettingKey`; **behavior change** — `PUT`/`DELETE` on a missing id now 404 (was silent `{ok}`). Result: **~45 endpoints across 10 groups**, down from 50/11.

**Graduates the per-resource port tickets** from the map fog — one per group (health, accounts, categories, merchants, transactions, rules, subscriptions, settings, app-settings, database). Each has its full spec in §2; no contract decisions remain. The branded-id/`Paged`/`Pagination` helpers + the three `Schema.TaggedError`s land in `@mamen/shared` (first port ticket or a small shared-schemas ticket). Open items left to the ports (not contract): `:memory:` test-layer wiring, coverage threshold number, SDK typed-error ergonomics, `importedAt` server-set-vs-caller.
