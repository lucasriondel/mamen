# New REST contract

The full redesigned REST contract for the [Effect API rework](../issues/0001-effect-api-rework.md), resolving [Design the new REST contract](../issues/0006-design-new-rest-contract.md). Decided with Lucas via grilling, 2026-07-09.

This is the **single source of truth** for the new API: every resource, endpoint, path/query/payload schema, success schema+status, and declared errors. A per-resource port ticket implements a group from this doc **without further contract decisions**. It is expressed in `@effect/platform` `HttpApi` terms (`HttpApiGroup` / `HttpApiEndpoint` / `Schema`), grounded in the [HttpApi stack survey](effect-httpapi-stack-survey.md).

Built on:
- [API surface inventory](api-surface-inventory.md) — the resource-by-resource checklist (50 endpoints across 11 resources).
- [Error taxonomy & status conventions](error-taxonomy.md) — the error envelope, domain error set, success statuses, per-endpoint error-set rule. **This doc applies that taxonomy mechanically; read it first.**
- [Uploads and static files under HttpApi](uploads-static-under-httpapi.md) — the merchant image upload + `/uploads/*` static story.

Wire compatibility with today is explicitly **not** preserved.

---

## 0. Decisions locked at grilling (the load-bearing redesigns)

Six decisions shape everything below:

1. **Transactions list → fully composable AND filters.** The old 9-branch either/or fan-out (`accountId` dominates, other filters unreachable) is gone. `GET /transactions` takes every filter as an independent optional query param, combined with `AND`. `GET /transactions/count` takes the **same** filter struct. No dominance, no precedence. (§ Transactions.)
2. **Settings and app-settings stay two separate resources.** `/settings` = generic key/value store (`value` always a string); `/app-settings` = typed singleton `{ llm }`. LLM config remains duplicated across both (loose strings in `settings`, typed object in `app-settings.llm`) — a faithful port, least frontend churn. (§ Settings, § App-settings.)
3. **Drop the broken orphan + all client-only endpoints.** The new contract carries only what `packages/web` actually calls, plus `health` and the `database` backup/restore ops. The full drop list is in §Dropped endpoints. Anything the rebuilt frontend later needs is re-added deliberately.
4. **Branded ids, everywhere.** Each resource gets a branded id schema (`AccountId = Schema.Int.pipe(Schema.brand("AccountId"))`, etc.). Path params decode via `Schema.NumberFromString` into the brand. Cross-resource foreign keys use the target resource's brand (`transaction.accountId: AccountId`). No plain `Schema.Number` ids.
5. **All lists are paginated** with a uniform `{ items, total }` envelope and `limit`/`offset` query params. Every list endpoint — even small ones (accounts, categories) — returns the paged envelope. `total` is the count **before** limit/offset (the full filtered set).
6. **Keep all bulk ops + database verbs, normalized.** Transaction bulk create/put/delete/get and `database` reset/export/import survive, re-typed per the taxonomy. `bulk-get` stays `POST` (id list in body). `database/export` stays `POST` (conscious REST exception — a whole-DB dump is not a cacheable GET).

---

## 1. Conventions applied uniformly

These come straight from the taxonomy + the two grilling decisions above; stated once here, not repeated per endpoint.

### 1.1 Ids and foreign keys

Branded, per resource. Defined in `@mamen/shared` alongside the schemas:

```ts
export const AccountId      = Schema.Int.pipe(Schema.brand("AccountId"))
export const CategoryId     = Schema.Int.pipe(Schema.brand("CategoryId"))
export const MerchantId     = Schema.Int.pipe(Schema.brand("MerchantId"))
export const TransactionId  = Schema.Int.pipe(Schema.brand("TransactionId"))
export const RuleId         = Schema.Int.pipe(Schema.brand("RuleId"))
export const SubscriptionId = Schema.Int.pipe(Schema.brand("SubscriptionId"))
export const SettingId      = Schema.Int.pipe(Schema.brand("SettingId"))
```

- **Path params**: `HttpApiSchema.param("id", Schema.NumberFromString.pipe(Schema.compose(TheId)))` — decodes the URL segment string → number → brand. A non-numeric segment fails schema decode → `HttpApiDecodeError (400)` automatically (this is what retires the old hand-written `"Invalid id"` error — see taxonomy §2).
- **Foreign keys in entities** use the target brand: `transaction.accountId: AccountId`, `transaction.merchantId: Schema.optional(MerchantId)`, `category.parentId: Schema.NullOr(CategoryId)`, `rule.merchantId: MerchantId`, `merchant.defaultCategoryId: Schema.optional(CategoryId)`, etc. There is **no DB-level FK enforcement** (inventory §3: zero foreign keys) — the brand is a compile-time/contract-level guard only, not a runtime referential check.
- `appSettings.id` is the fixed string `"app"` (singleton) — not branded, not exposed as a path param (there is only one).

### 1.2 Dates

Replaces the old field-agnostic date-reviver plugin (inventory §1) with per-field `Schema` types:

- **Datetime fields** (a moment in time): `Schema.Date` on the entity, stored as ISO-8601 TEXT. Applies to `account.createdAt/updatedAt`, `transaction.date/importedAt`, `merchant.createdAt/firstSeen`, `category.createdAt`, `rule.createdAt`. On the wire these are full ISO-8601 strings (`"2026-07-09T14:30:00.000Z"`); the derived client decodes them to real `Date` instances.
- **Date-only / month / opaque-string fields** stay `Schema.String`, matching today (inventory §3 "Kept as string"): `transaction.importMonth` (`"YYYY-MM"`), and all subscription date fields (`lastChargeDate`, `firstChargeDate`, `detectedAt`, `updatedAt`) which are strings in both the entity and DB today. **Faithful port — do not "upgrade" subscription dates to `Schema.Date`.**
- **Date-range filter params** (`startDate`, `endDate` on the transactions list) are `Schema.Date` in query position — they encode to ISO strings in the URL.

> Port-ticket note: bun:sqlite can't bind JS `Date` (survey §8). Datetime columns are ISO TEXT; the repository layer uses `Model.DateTime*` fields or explicit ISO encode/decode. This is a storage detail, invisible on the wire.

### 1.3 Nullability

- **Optional-and-omittable** entity fields (absent, not null) use `Schema.optional(S)` — e.g. `merchant.imageUrl`, `merchant.defaultCategoryId`, `transaction.merchantId`, all the optional transaction fields. Matches today's `field?: T` entity shape.
- **Nullable** fields that are explicitly `null` (not absent) use `Schema.NullOr(S)` — `category.parentId` is `number | null` today (NULL = root category), so `Schema.NullOr(CategoryId)`.
- **Create payloads** omit server-generated fields; **update payloads** are `Schema.partial(EntityCreate)` (every field optional). Precise create/update schemas per resource below.

### 1.4 List pagination (uniform)

Every list endpoint shares this shape. Query params (a reusable `Pagination` struct + per-resource filters):

```ts
// shared pagination params, spread into every list's urlParams struct
const Pagination = {
  limit:  Schema.optionalWith(Schema.NumberFromString, { default: () => 50 }),
  offset: Schema.optionalWith(Schema.NumberFromString, { default: () => 0 }),
}
```

Success schema is a generic paged envelope:

```ts
const Paged = <A>(item: Schema.Schema<A>) =>
  Schema.Struct({ items: Schema.Array(item), total: Schema.Number })
```

- `total` = count of the **full filtered set** before `limit`/`offset` (so the frontend can page). For an unfiltered list it's the table row count.
- Default page size **50**, default offset **0**. `limit`/`offset` are `NumberFromString` (query strings), NaN/negative are a schema-decode concern — clamp/validate in the port if desired, but the contract accepts any decoded number (keep it faithful-simple: no upper cap on `limit` in the contract).
- Ordering, where a resource supports it, is separate `orderBy` / `direction` params (see per-resource).

### 1.5 Success statuses & bodies (from taxonomy §5)

| Operation | Status | Body |
|---|---|---|
| GET one | 200 | the resource |
| GET list | 200 | `Paged(Resource)` = `{ items, total }` |
| POST create | 201 | the created resource (full, with generated id + timestamps) |
| PUT update | 200 | the updated resource (full) |
| DELETE | 204 | *no body* |
| Bulk create | 201 | created resources `[]` |
| Bulk put | 200 | `{ count: number }` |
| Bulk delete | 200 | `{ count: number }` |
| Bulk get | 200 | resource `[]` (endpoint stays `POST`) |
| Action (reset/export/import/image) | 200 | the action result |

### 1.6 Errors (from taxonomy §2, §6)

Three domain errors, `Schema.TaggedError` in `@mamen/shared`, each declared **only** on endpoints that can produce it (`.addError`):

| Tag | Status | Fields |
|---|---|---|
| `NotFound` | 404 | `resource: string`, `id: string \| number` |
| `Conflict` | 409 | `resource: string`, `message: string` |
| `InvalidFileType` | 415 | `allowed: string[]`, `received: string` |

Framework-implicit on **every** endpoint (never declared per-endpoint): `HttpApiDecodeError (400)` for schema-decode failures, and an untyped `500` for defects (incl. non-UNIQUE `SqlError`, caught at the service boundary — taxonomy §3). Per-endpoint declared errors follow the taxonomy §6 mapping rule; each endpoint below lists its set explicitly.

**Behavior change (deliberate):** `PUT`/`DELETE` on a missing id → `NotFound (404)`. Today they silently return `{ ok: true }`. (Taxonomy §6.)

### 1.7 Envelopes (normalized)

Today's envelope zoo (raw entities / `{ id }` / `{ ids }` / `{ ok: true }` / `{ count }` / `{ imageUrl }`) collapses to: **the resource itself** for reads and single mutations, **`Paged(Resource)`** for lists, **`{ count }`** for bulk put/delete, **created resources `[]`** for bulk create, and **no body** for delete. No `{ ok: true }` anywhere.

### 1.8 Group / API assembly

```ts
export class MamenApi extends HttpApi.make("mamen")
  .add(HealthGroup)
  .add(AccountsGroup)
  .add(CategoriesGroup)
  .add(MerchantsGroup)
  .add(TransactionsGroup)
  .add(RulesGroup)
  .add(SubscriptionsGroup)
  .add(SettingsGroup)
  .add(AppSettingsGroup)
  .add(DatabaseGroup)
  .prefix("/api")
  .annotateContext(OpenApi.annotations({ title: "Mamen API", version: "1.0.0" }))
{}
```

- Every group is `.prefix`ed to its resource path (e.g. `AccountsGroup.prefix("/accounts")`), and the API is `.prefix("/api")` — so all routes serve at `/api/…` as today (inventory §1). CORS allows `http://localhost:5173` (survey server section). `HttpApiDecodeError` + untyped `500` are auto-carried by `HttpApi.make`.
- `/uploads/*` static serving is **not** part of this HttpApi contract — it is a separate wildcard route in the same Bun router (uploads research); the contract only owns the merchant image **upload** and **delete** endpoints (§Merchants).

---

## 2. Resources

Legend for the per-endpoint "Errors" column: only **declared domain errors** are listed. `HttpApiDecodeError (400)` and untyped `500` are implicit everywhere and omitted.

### 2.1 Health

Group `health`, prefix `/health`. One endpoint, no schemas, no DB check (literal — faithful port).

| Name | Method + path | Payload | Success | Errors |
|---|---|---|---|---|
| `check` | `GET /api/health` | — | 200 `{ status: "ok" }` | — |

```ts
HttpApiEndpoint.get("check", "/").addSuccess(Schema.Struct({ status: Schema.Literal("ok") }))
```

### 2.2 Accounts

Group `accounts`, prefix `/accounts`.

**Entity** (`Account`):
```ts
export class Account extends Schema.Class<Account>("Account")({
  id: AccountId,
  name: Schema.String,
  type: Schema.Literal("checking", "savings", "credit_card", "other"),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
```
- **Create** payload: `Schema.Struct({ name, type })` — server sets `id`, `createdAt`, `updatedAt`.
- **Update** payload: `Schema.partial(Schema.Struct({ name, type }))`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/accounts` | `Pagination` | 200 `Paged(Account)` | — |
| `getById` | `GET /api/accounts/:id` | `id: AccountId` | 200 `Account` | `NotFound` |
| `getByName` | `GET /api/accounts/by-name/:name` | `name: Schema.String` (path) | 200 `Account` | `NotFound` |
| `create` | `POST /api/accounts` | `AccountCreate` | 201 `Account` | — |
| `update` | `PUT /api/accounts/:id` | `id`, `AccountUpdate` | 200 `Account` | `NotFound` |
| `remove` | `DELETE /api/accounts/:id` | `id` | 204 | `NotFound` |

- **Dropped** vs today: `GET /accounts/by-type/:type` (client-only). No uniqueness constraint on accounts today → `create`/`update` declare **no** `Conflict`.
- `by-name/:name` path param decodes the URL-encoded name (HttpApi handles percent-decoding of path segments; the old inconsistent manual `decodeURIComponent` is gone).

### 2.3 Categories

Group `categories`, prefix `/categories`.

**Entity** (`Category`):
```ts
export class Category extends Schema.Class<Category>("Category")({
  id: CategoryId,
  name: Schema.String,
  slug: Schema.String,
  color: Schema.String,
  icon: Schema.String,
  parentId: Schema.NullOr(CategoryId),   // null = root
  sortOrder: Schema.Number,
  createdAt: Schema.Date,
}) {}
```
- **Create**: `Schema.Struct({ name, slug, color, icon, parentId: Schema.NullOr(CategoryId), sortOrder })` — server sets `id`, `createdAt`.
- **Update**: `Schema.partial(CategoryCreateFields)`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/categories` | `Pagination` + filters ↓ | 200 `Paged(Category)` | — |
| `getById` | `GET /api/categories/:id` | `id: CategoryId` | 200 `Category` | `NotFound` |
| `getBySlug` | `GET /api/categories/by-slug/:slug` | `slug: Schema.String` | 200 `Category` | `NotFound` |
| `create` | `POST /api/categories` | `CategoryCreate` | 201 `Category` | — |
| `bulkCreate` | `POST /api/categories/bulk-add` | `{ records: CategoryCreate[] }` | 201 `Category[]` | — |
| `update` | `PUT /api/categories/:id` | `id`, `CategoryUpdate` | 200 `Category` | `NotFound` |
| `remove` | `DELETE /api/categories/:id` | `id` | 204 | `NotFound` |

**`list` filters** (composable, replacing the old fan-out) — all optional, `AND`-combined, plus `Pagination`:
```ts
setUrlParams(Schema.Struct({
  ...Pagination,
  parentId: Schema.optional(Schema.NumberFromString.pipe(Schema.compose(CategoryId))),
  orderBy:  Schema.optional(Schema.Literal("sortOrder")),
}))
```
- `parentId` present → filter to that parent's children. `orderBy: "sortOrder"` → order by `sortOrder` (else natural/insertion order). Both compose (parent's children ordered by sortOrder). The old branch-1..4 fan-out becomes these two independent optional params.
- **Dropped**: `GET /categories/root` (client-only — express as `?parentId=` targeting null-root if the frontend ever needs it, or re-add deliberately), `PUT /categories/bulk-put` (client-only), `POST /categories/clear` (client-only).
- `bulkCreate` kept (web uses it). `slug` has **no** DB unique constraint today (inventory §3) → **no** `Conflict` on create.

### 2.4 Merchants

Group `merchants`, prefix `/merchants`. Includes the image upload (uploads research).

**Entity** (`Merchant`):
```ts
export class Merchant extends Schema.Class<Merchant>("Merchant")({
  id: MerchantId,
  name: Schema.String,
  imageUrl: Schema.optional(Schema.String),          // root-relative "/uploads/merchants/..."
  defaultCategoryId: Schema.optional(CategoryId),
  createdAt: Schema.Date,
  firstSeen: Schema.Date,
}) {}
```
- **Create**: `Schema.Struct({ name, imageUrl: Schema.optional, defaultCategoryId: Schema.optional, firstSeen: Schema.Date })` — server sets `id`, `createdAt`. (`firstSeen` is caller-provided today.)
- **Update**: `Schema.partial(...)`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/merchants` | `Pagination` + `orderBy?` | 200 `Paged(Merchant)` | — |
| `getById` | `GET /api/merchants/:id` | `id: MerchantId` | 200 `Merchant` | `NotFound` |
| `getByName` | `GET /api/merchants/by-name/:name` | `name` | 200 `Merchant` | `NotFound` |
| `getByNameCi` | `GET /api/merchants/by-name-ci/:name` | `name` | 200 `Merchant` | `NotFound` |
| `create` | `POST /api/merchants` | `MerchantCreate` | 201 `Merchant` | — |
| `update` | `PUT /api/merchants/:id` | `id`, `MerchantUpdate` | 200 `Merchant` | `NotFound` |
| `remove` | `DELETE /api/merchants/:id` | `id` | 204 | `NotFound` |
| `uploadImage` | `POST /api/merchants/:id/image` | `id` + multipart file | 200 `Merchant` | `NotFound`, `InvalidFileType` |
| `deleteImage` | `DELETE /api/merchants/:id/image` | `id` | 200 `Merchant` | `NotFound` |

- **`list` order**: `orderBy: Schema.optional(Schema.Literal("name"))` — `"name"` → ordered by name, else natural. (Faithful: today only `orderBy=name` is recognized.)
- **`remove` now 404s** on a missing merchant (behavior change — today it doesn't, though the image sub-routes do). Still cascades the image-file cleanup (delete the `imageUrl` file before the row).
- **`uploadImage`** (uploads research): payload `HttpApiSchema.Multipart(Schema.Struct({ file: SingleFileSchema }))`; handler gets a scoped-temp `PersistedFile`. MIME allow-list (`image/jpeg|png|webp|gif`) enforced in the handler/refinement → `InvalidFileType (415)` on miss. Size relies on `maxFileSize` (2 MiB, matching today's global limit); there is no `PersistedFile.size` so no separate 413. Returns the **updated `Merchant`** (with the new `imageUrl`) — richer than today's `{ imageUrl }`, and consistent with the "mutations return the full resource" rule. `imageUrl` stays a **root-relative `/uploads/merchants/…` path**.
- **`deleteImage`** returns the updated `Merchant` (with `imageUrl` now absent). 200 (has a body) — not 204 — because it returns the resource. Declares `NotFound` (fetches first, like today).
- **Dropped**: `PUT /merchants/bulk-put` (client-only).
- No merchant-name unique constraint today → no `Conflict` (the taxonomy lists merchant-name as a *potential* conflict, but the current schema doesn't enforce it — faithful port omits it; a port ticket that adds a UNIQUE index must then add `Conflict` to create/update).

### 2.5 Transactions

Group `transactions`, prefix `/transactions`. The composable-filter redesign lives here.

**Entity** (`Transaction`):
```ts
export class Transaction extends Schema.Class<Transaction>("Transaction")({
  id: TransactionId,
  accountId: AccountId,
  date: Schema.Date,
  amount: Schema.Number,
  rawMerchantString: Schema.String,
  merchantId: Schema.optional(MerchantId),
  categoryId: Schema.optional(CategoryId),
  subcategoryId: Schema.optional(CategoryId),
  categoryOverride: Schema.optional(Schema.String),
  manualCategory: Schema.optional(Schema.Boolean),
  isRefund: Schema.optional(Schema.Boolean),
  linkedRefundId: Schema.optional(TransactionId),
  anomalyFlags: Schema.optional(Schema.Array(AnomalyFlag)),
  isDuplicateExcluded: Schema.optional(Schema.Boolean),
  duplicateNote: Schema.optional(Schema.String),
  importedAt: Schema.Date,
  importMonth: Schema.String,             // "YYYY-MM"
  importBatchId: Schema.optional(Schema.String),
}) {}
```
- `AnomalyFlag` — port the existing `AnomalyFlag` type from `@mamen/shared` into an Effect Schema (its shape is defined there; the port ticket carries it over verbatim).
- Booleans are `Schema.optional(Schema.Boolean)` — today they read back as `true | undefined` (0/1 in DB); the repository decodes 0/1 → boolean.
- **Create**: `Schema.Struct(...)` omitting `id` (all other fields as above; `importedAt` may be server-set or caller-provided — port ticket picks; today it's caller-provided). **Update**: `Schema.partial(TransactionCreate)`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/transactions` | `Pagination` + composable filters ↓ | 200 `Paged(Transaction)` | — |
| `count` | `GET /api/transactions/count` | same filters (no pagination) ↓ | 200 `{ count }` | — |
| `getById` | `GET /api/transactions/:id` | `id: TransactionId` | 200 `Transaction` | `NotFound` |
| `create` | `POST /api/transactions` | `TransactionCreate` | 201 `Transaction` | — |
| `bulkCreate` | `POST /api/transactions/bulk` | `{ records: TransactionCreate[] }` | 201 `Transaction[]` | — |
| `update` | `PUT /api/transactions/:id` | `id`, `TransactionUpdate` | 200 `Transaction` | `NotFound` |
| `bulkPut` | `PUT /api/transactions/bulk-put` | `{ records: Transaction[] }` | 200 `{ count }` | — |
| `remove` | `DELETE /api/transactions/:id` | `id` | 204 | `NotFound` |
| `bulkDelete` | `POST /api/transactions/bulk-delete` | `{ ids: TransactionId[] }` | 200 `{ count }` | — |
| `bulkGet` | `POST /api/transactions/bulk-get` | `{ ids: TransactionId[] }` | 200 `Transaction[]` | — |
| `deleteByAccountMonth` | `DELETE /api/transactions/by-account-month` | `accountId`, `importMonth` (query, required) | 200 `{ count }` | — |
| `deleteByImportBatch` | `DELETE /api/transactions/by-import-batch/:batchId` | `batchId: Schema.String` | 200 `{ count }` | — |

**`list` composable filters** — the core redesign. Every filter optional, `AND`-combined:
```ts
setUrlParams(Schema.Struct({
  ...Pagination,
  accountId:      Schema.optional(numFromStr(AccountId)),
  merchantId:     Schema.optional(numFromStr(MerchantId)),
  categoryId:     Schema.optional(numFromStr(CategoryId)),
  linkedRefundId: Schema.optional(numFromStr(TransactionId)),
  importMonth:    Schema.optional(Schema.String),        // "YYYY-MM"
  importBatchId:  Schema.optional(Schema.String),
  startDate:      Schema.optional(Schema.Date),          // inclusive lower bound on `date`
  endDate:        Schema.optional(Schema.Date),          // inclusive upper bound on `date`
  isRefund:            Schema.optional(BooleanFromString),
  isDuplicateExcluded: Schema.optional(BooleanFromString),
  orderBy:   Schema.optional(Schema.Literal("date")),
  direction: Schema.optionalWith(Schema.Literal("asc", "desc"), { default: () => "desc" }),
}))
// numFromStr(Id) = Schema.NumberFromString.pipe(Schema.compose(Id))
// BooleanFromString = Schema.transform over "true"/"false" (query strings are strings)
```
- **Behavior vs today**: `accountId` no longer dominates. `?accountId=3&categoryId=7&startDate=2026-01-01` filters on all three (was impossible). `?importMonth=2026-01` alone now works (was ignored unless `accountId` present). `?startDate=` alone works (was ignored — needed both). `orderBy=date` + `direction` order the result; direction defaults `desc` (faithful to `getAllOrderedByDate`'s default).
- **`count`** takes the identical filter struct **minus** `Pagination`/`orderBy`/`direction` (ordering is meaningless for a count) → `200 { count: number }`. This replaces the old 3-branch count fan-out; `count` now honors every filter `list` does.
- **`deleteByAccountMonth`**: `accountId` + `importMonth` are **required** query params (not optional) — a targeted bulk delete. Returns `{ count }` (rows deleted) instead of today's `{ ok: true }`.
- **`deleteByImportBatch`**: `:batchId` path param, returns `{ count }`.
- Bulk create → 201 `Transaction[]` (was `{ ids }`). Bulk-put/delete → 200 `{ count }`. Bulk-get stays `POST`, → 200 `Transaction[]`. (Taxonomy §5.)
- No transactions dropped — all of today's transaction endpoints are web-used.

### 2.6 Rules

Group `rules`, prefix `/rules`.

**Entity** (`Rule`):
```ts
export class Rule extends Schema.Class<Rule>("Rule")({
  id: RuleId,
  merchantId: MerchantId,
  pattern: Schema.String,
  categoryOverride: Schema.optional(CategoryId),   // a category id despite the name
  matchCount: Schema.Number,
  createdAt: Schema.Date,
}) {}
```
- **Create**: `Schema.Struct({ merchantId, pattern, categoryOverride: Schema.optional(CategoryId), matchCount })`. **Update**: `Schema.partial(...)`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/rules` | `Pagination` + `merchantId?` | 200 `Paged(Rule)` | — |
| `count` | `GET /api/rules/count` | `merchantId?` | 200 `{ count }` | — |
| `getById` | `GET /api/rules/:id` | `id: RuleId` | 200 `Rule` | `NotFound` |
| `getByMerchantPattern` | `GET /api/rules/by-merchant-pattern/:merchantId/:pattern` | `merchantId: MerchantId`, `pattern: Schema.String` | 200 `Rule` | `NotFound` |
| `create` | `POST /api/rules` | `RuleCreate` | 201 `Rule` | — |
| `update` | `PUT /api/rules/:id` | `id`, `RuleUpdate` | 200 `Rule` | `NotFound` |
| `remove` | `DELETE /api/rules/:id` | `id` | 204 | `NotFound` |

- **`list` filter**: `merchantId: Schema.optional(numFromStr(MerchantId))` (+ `Pagination`) — present → rules for that merchant, else all. **`count`**: `merchantId?` → count for merchant or total (no pagination on count).
- **Dropped**: `POST /rules/bulk-add`, `POST /rules/bulk-delete` (both client-only).

### 2.7 Subscriptions

Group `subscriptions`, prefix `/subscriptions`. Note the string date fields (faithful port — see §1.2).

**Entity** (`Subscription`):
```ts
export class Subscription extends Schema.Class<Subscription>("Subscription")({
  id: SubscriptionId,
  merchantId: MerchantId,
  merchantName: Schema.String,                 // denormalized
  typicalAmount: Schema.Number,
  frequency: Schema.Literal("weekly", "monthly", "yearly"),
  intervalDays: Schema.Number,
  lastChargeDate: Schema.String,               // string, not Date (faithful)
  firstChargeDate: Schema.String,
  chargeCount: Schema.Number,
  status: Schema.Literal("active", "possibly-cancelled"),
  transactionIds: Schema.Array(TransactionId),
  detectedAt: Schema.String,
  updatedAt: Schema.String,
}) {}
```
- **Create**: `Schema.Struct(...)` omitting `id`. **Update**: `Schema.partial(...)`.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/subscriptions` | `Pagination` + `merchantId?`, `status?` | 200 `Paged(Subscription)` | — |
| `create` | `POST /api/subscriptions` | `SubscriptionCreate` | 201 `Subscription` | — |
| `update` | `PUT /api/subscriptions/:id` | `id`, `SubscriptionUpdate` | 200 `Subscription` | `NotFound` |
| `getFirstByMerchant` | `GET /api/subscriptions/first-by-merchant/:merchantId` | `merchantId: MerchantId` | 200 `Subscription` | `NotFound` |
| `getByMerchantFrequency` | `GET /api/subscriptions/by-merchant-frequency/:merchantId/:frequency` | `merchantId`, `frequency: Schema.Literal("weekly","monthly","yearly")` | 200 `Subscription` | `NotFound` |

- **`list` filters** (composable, replacing the old `merchantId > status` precedence): `merchantId: Schema.optional(numFromStr(MerchantId))`, `status: Schema.optional(Schema.Literal("active", "possibly-cancelled"))`, `+ Pagination`. Both compose with `AND` now (was either/or).
- **`frequency` path param** is now a validated `Schema.Literal` (was an unchecked cast) → bad value = `HttpApiDecodeError (400)`.
- **Dropped**: `GET /subscriptions/:id`, `DELETE /subscriptions/:id`, `PUT /subscriptions/bulk-put`, `POST /subscriptions/clear` (all client-only). **Note**: this removes generic get-by-id and delete for subscriptions — the web app only ever lists/creates/updates them and looks them up by merchant. A port ticket that needs `getById`/`remove` re-adds them then (they're trivial `NotFound`-declaring endpoints).

### 2.8 Settings (key/value store)

Group `settings`, prefix `/settings`. Kept separate from app-settings (decision #2).

**Entity** (`Setting`):
```ts
export const SettingKey = Schema.Literal(
  "llm_endpoint", "llm_api_key", "llm_model", "currency_symbol",
  "date_format", "anomaly_threshold", "anomaly_settings", "displayPreferences",
)
export class Setting extends Schema.Class<Setting>("Setting")({
  id: SettingId,
  key: SettingKey,
  value: Schema.String,        // always a string; callers JSON-encode structured values themselves
}) {}
```
- `SettingKey` is the full union from the TS `SettingKey` type — **including `displayPreferences`**, which the old zod `settingKeySchema` dropped (inventory §2 "Zod drift"). This contract fixes that drift.

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `list` | `GET /api/settings` | `Pagination` | 200 `Paged(Setting)` | — |
| `getByKey` | `GET /api/settings/by-key/:key` | `key: SettingKey` (path) | 200 `Setting` | `NotFound` |
| `putByKey` | `PUT /api/settings/by-key` | `Setting` (full) | 200 `Setting` | — |

- **Addressing** (faithful to today's asymmetry, cleaned): read/upsert are keyed by `key`. `putByKey` is an **upsert** — creates or updates the row for that `key`, returns the resulting `Setting`. It always succeeds (upsert, no missing-row case) → **no `NotFound`**. `key` is now a validated `Schema.Literal` path param (was an unchecked cast) → unknown key on `getByKey` = decode 400; on a genuinely-absent-but-valid key, `getByKey` → 404.
- **`key` has a UNIQUE constraint** in the DB (inventory §3: `settings.key TEXT UNIQUE`). But since the only writer is an **upsert** (`putByKey`, `INSERT OR REPLACE` on key), a duplicate-key insert never happens → **no `Conflict`** declared. (If a port ticket ever adds a plain non-upsert create keyed by `key`, it must add `Conflict`.)
- **Dropped**: `DELETE /settings/:id`, `POST /settings/clear` (both client-only). Removing `DELETE /settings/:id` means no way to delete a single setting — faithful to web usage (web only lists / gets-by-key / upserts). Re-add deliberately if needed (would be `DELETE /settings/by-key/:key` for consistency, not `:id`).

### 2.9 App-settings (singleton config)

Group `appSettings`, prefix `/app-settings`. Single fixed-shape row.

**Entity** (`AppSettings`):
```ts
export class LlmSettings extends Schema.Class<LlmSettings>("LlmSettings")({
  endpoint: Schema.String,
  apiKey: Schema.optional(Schema.String),
  modelName: Schema.String,
  provider: Schema.Literal("ollama", "lm-studio", "openai", "anthropic", "custom"),
  lastTestedAt: Schema.optional(Schema.Date),
  lastTestSuccess: Schema.optional(Schema.Boolean),
}) {}
export class AppSettings extends Schema.Class<AppSettings>("AppSettings")({
  id: Schema.Literal("app"),
  llm: LlmSettings,
}) {}
```

| Name | Method + path | Params / payload | Success | Errors |
|---|---|---|---|---|
| `get` | `GET /api/app-settings` | — | 200 `AppSettings` | `NotFound` |
| `put` | `PUT /api/app-settings` | `AppSettings` | 200 `AppSettings` | — |

- **`get` 404s** when the singleton row doesn't exist yet (faithful — today it 404s). `put` is a whole-object upsert (single row, id `"app"`), returns the stored `AppSettings` → no `NotFound`.
- **LLM config duplication accepted** (decision #2): the loose `llm_*` keys still live in `/settings`, the typed object here. No merge. The port tickets keep both in sync at the application layer exactly as today (they don't — today they're independent; faithful port keeps them independent).
- **Dropped**: `POST /app-settings/clear` (client-only).

### 2.10 Database (backup / restore / reset)

Group `database`, prefix `/database`. Destructive whole-DB operations; kept + normalized (decision #6).

**Dump schema** (`DbDump`) — arrays per table, matching today's export/import shape:
```ts
const DbDump = Schema.Struct({
  accounts:      Schema.Array(Account),
  transactions:  Schema.Array(Transaction),
  merchants:     Schema.Array(Merchant),
  rules:         Schema.Array(Rule),
  categories:    Schema.Array(Category),
  subscriptions: Schema.Array(Subscription),
  settings:      Schema.Array(Setting),
  appSettings:   Schema.Array(AppSettings),   // 0- or 1-element
})
const DbImport = Schema.partial(DbDump)       // any table optional on import
```

| Name | Method + path | Payload | Success | Errors |
|---|---|---|---|---|
| `reset` | `POST /api/database/reset` | — | 200 `{ ok: true }` | — |
| `export` | `POST /api/database/export` | — | 200 `DbDump` | — |
| `import` | `POST /api/database/import` | `DbImport` | 200 `{ ok: true }` | — |

- **`reset`**: destructive full wipe of all 8 tables (no reseed, no confirmation — faithful port). Returns `{ ok: true }`. (This is one place `{ ok: true }` survives — an action ack with no resource to return; the taxonomy §5 "action result" row permits an action-specific body.)
- **`export`**: read-all → `DbDump`. **Stays `POST`** (decision #6): a whole-DB dump is not a cacheable/idempotent GET, and the client persists the JSON body itself (no file). Flagged REST exception.
- **`import`**: **destructive clear-then-load** — wipes all 8 tables, then bulk-loads in dependency order (accounts → categories → merchants → rules → transactions → subscriptions → settings; `appSettings` = `appSettings[0]`). `DbImport` makes every table optional (a table absent from the payload is still wiped — faithful to today). Returns `{ ok: true }`.
- No auth, no confirmation, no merge/partial mode — faithful port (these are local single-user admin ops). `database/reset` **subsumes** all the dropped `*/clear` endpoints (categories/settings/subscriptions/app-settings clear) — full wipe covers them.

---

## 3. Dropped endpoints (complete list)

Per decision #3 — the broken orphan + every client-only endpoint. Each is re-addable deliberately if the rebuilt frontend needs it.

**Broken orphan:**
- `POST /api/import` — the legacy client posts here but the server has no such route (inventory §4). Dead. Gone.

**Client-only (real + tested today, but `packages/web` never calls):**
- `GET /accounts/by-type/:type`
- `GET /categories/root`
- `PUT /categories/bulk-put`
- `POST /categories/clear`
- `PUT /merchants/bulk-put`
- `POST /rules/bulk-add`
- `POST /rules/bulk-delete`
- `GET /subscriptions/:id`
- `DELETE /subscriptions/:id`
- `PUT /subscriptions/bulk-put`
- `POST /subscriptions/clear`
- `DELETE /settings/:id`
- `POST /settings/clear`
- `POST /app-settings/clear`

The four `*/clear` drops are covered by `POST /api/database/reset` (full wipe). The dropped single get/delete on subscriptions and the dropped single delete on settings are the only genuine capability reductions; both are trivial to re-add as `NotFound`-declaring endpoints when a frontend need appears.

---

## 4. Endpoint count

New contract: **~45 endpoints across 10 groups** (health, accounts, categories, merchants, transactions, rules, subscriptions, settings, app-settings, database), down from the inventory's 50 endpoints/11 resources — the reduction is the 15 dropped endpoints (§3) minus the composable-filter consolidation (which merged fan-out branches into single endpoints rather than removing endpoints). Every surviving endpoint is web-used or an admin/health primitive.

Group breakdown: health 1 · accounts 6 · categories 7 · merchants 9 · transactions 12 · rules 7 · subscriptions 5 · settings 3 · app-settings 2 · database 3.

---

## 5. What this unblocks

- **Per-resource port tickets** (map fog) graduate now — one per group above. Each port ticket implements its group's endpoints from §2 with **no further contract decisions**: the schemas, statuses, errors, and filter params are all specified here. The three `Schema.TaggedError`s and the branded id/`Paged`/`Pagination` helpers land in `@mamen/shared` (either as part of the first port ticket or a small shared-schemas ticket the map cuts alongside the ports).
- **Open questions the port tickets settle** (deferred here on purpose, not contract decisions):
  - The **sqlite `:memory:` test-layer wiring** under `HttpApiLive` (fresh DB per test vs `it.layer` + table reset) — settle at the first DB-backed port (map fog, "Test harness details").
  - The **coverage threshold number** (gate provisional 70/60) — map fog.
  - **SDK typed-error ergonomics** at the `useQuery` boundary and whether the SDK exposes `mutationOptions`/invalidation helpers — sharpens after the first ported resource (map fog, "SDK tanstack-query layer design").
  - `importedAt` server-set vs caller-provided on transaction/merchant create — a small per-resource port call (contract accepts either; today caller-provided).
