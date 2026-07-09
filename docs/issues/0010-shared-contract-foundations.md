---
id: 10
title: Shared contract foundations (branded ids, paged/pagination, tagged errors)
state: closed
labels: [wayfinder:impl]
assignee: luriondel
parent: 1
blocked-by: []
---

## Question

Land the shared building blocks every port ticket depends on, in `@mamen/shared` under the Effect contract namespace (`@mamen/shared/contract`, isolated from the zod that still lives there — see [Scaffold the new packages](0007-scaffold-new-packages.md)). This is the **expand** step of the contract migration: nothing else can be ported until these exist. No HTTP endpoint ships here — this is pure schema/value wiring that typechecks.

From the contract spec [api-contract.md](../research/api-contract.md) §1.1, §1.4, §1.6:

- **Branded id schemas**, one per resource: `AccountId`, `CategoryId`, `MerchantId`, `TransactionId`, `RuleId`, `SubscriptionId`, `SettingId` — each `Schema.Int.pipe(Schema.brand("..."))`.
- **A path-param helper** that decodes a URL segment to a branded id: `NumberFromString → compose(Id)` shape, ready for `HttpApiSchema.param`.
- **The `Pagination` params struct** (`limit`/`offset` as `NumberFromString` with defaults 50/0) and the generic **`Paged(item)`** success envelope (`{ items, total }`), per §1.4.
- **The three domain errors** as `Schema.TaggedError` in the contract package, each with its fixed HTTP status annotation (`HttpApiSchema.annotations({ status })`): `NotFound (404)` `{ resource, id }`, `Conflict (409)` `{ resource, message }`, `InvalidFileType (415)` `{ allowed, received }` — per the [error taxonomy](../research/error-taxonomy.md) §2 and spec §1.6.
- A small **query-coercion helper set** the list filters need: `numFromStr(Id)` (branded-id-from-string) and `BooleanFromString` (§2.5).

## Acceptance criteria

- [ ] All seven branded id schemas exported from `@mamen/shared/contract`.
- [ ] `Pagination`, `Paged`, `numFromStr`, `BooleanFromString` helpers exported.
- [ ] The three `Schema.TaggedError`s exported with correct status annotations; their wire shape matches the taxonomy envelope (`_tag` + fields).
- [ ] Whole workspace typechecks; existing walking-skeleton tests still green.
- [ ] No zod touched; these live under the isolated Effect contract path.

## Blocked by

None — can start immediately (both real blockers, [contract](0006-design-new-rest-contract.md) + [scaffold](0007-scaffold-new-packages.md), are closed).

## Resolution

Shared contract foundations landed in `@mamen/shared/contract` (isolated from the zod still in the package — no zod touched). Three new modules, all re-exported from `contract/index.ts`:

- **`ids.ts`** — the seven branded id schemas (`AccountId`, `CategoryId`, `MerchantId`, `TransactionId`, `RuleId`, `SubscriptionId`, `SettingId`), each `Schema.Int.pipe(Schema.brand(...))` with a matching exported `type`. Plus **`numFromStr(id)`** — `NumberFromString → compose(id)` — the path-param / branded-query coercion helper.
- **`pagination.ts`** — the **`Pagination`** params object (`limit`/`offset` as `optionalWith(NumberFromString, { default })`, 50/0) and the generic **`Paged(item)`** envelope (`{ items, total }`).
- **`errors.ts`** — the three domain errors as `Schema.TaggedError` with status via `HttpApiSchema.annotations`: `NotFound (404)` `{ resource, id }`, `Conflict (409)` `{ resource, message }`, `InvalidFileType (415)` `{ allowed, received }`. Plus **`BooleanFromString`** for query-string boolean filters.

Verified: whole workspace typechecks (7/7 turbo tasks green), the walking-skeleton api tests still pass (health handlers, 2 tests), and a runtime check confirmed the wire shapes — `NotFound` encodes to `{ resource, id, _tag: "NotFound" }` (taxonomy §1 envelope exact), `Paged` → `{ items, total }`, and both coercion helpers decode correctly. No `Conflict` on the wire yet (no endpoint declares it until a resource with a uniqueness constraint is ported).

Unblocks [Port accounts](0011-port-accounts.md) (#11) and, transitively, every other port. The `Model`/repository-side id handling (branded ids ↔ sqlite columns) is a per-port concern, not settled here.
