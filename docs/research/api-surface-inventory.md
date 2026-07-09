# Current API surface inventory

Fact-gathering for the [Effect API rework](../issues/0001-effect-api-rework.md), resolving [Inventory the current API surface](../issues/0004-inventory-current-api-surface.md). Pure inventory of the **live Fastify server** (`packages/server`) + its **legacy client** (`packages/web-api-legacy`) as consumed by `packages/web`. No redesign opinions — quirks are flagged, not fixed. This is the checklist [Design the new REST contract](../issues/0006-design-new-rest-contract.md) works from.

Sources: `packages/server/src/{app,routes,plugins,lib}`, `packages/server/src/lib/repository/{ports,adapters/sqlite}`, `packages/shared/src/types`, `packages/web-api-legacy/src`, `packages/web/src`.

---

## 1. Cross-cutting facts

From `app.ts` (`buildApp(opts)`):

- **Framework:** Fastify, `logger: false`. Every route module registers under **`{ prefix: "/api" }`** — all paths below are served at `/api/…`.
- **No CORS.** No `@fastify/cors` registered anywhere. (The new server must add CORS — dev proxy is `http://localhost:5173`.)
- **Multipart:** `@fastify/multipart` global, `limits: { fileSize: 2_097_152, files: 1 }` = **2 MiB / 1 file**. Sole consumer is merchant image upload.
- **Static — uploads:** `@fastify/static` with `root: uploadsDir`, `prefix: "/uploads/"`, `decorateReply: false`. Uploaded files served at `/uploads/…` (NOT under `/api`). `ensureUploadsDir` runs at build; only guaranteed subdir is `merchants/`.
- **Static — SPA:** `staticFilesPlugin` registered **only when `opts.staticDir` is set** (prod serve). Serves the built SPA at root with an `index.html` not-found fallback. **Out of scope** for this map (SPA hosting → cutover ticket), but note: when set, unknown `/api/*` paths fall through to `index.html` (HTML 200), not a JSON 404.
- **Date parsing:** `dateParserPlugin` (global) **replaces the `application/json` body parser** with `JSON.parse(body, dateReviver)`. `dateReviver` converts **any string** (any field, any depth) matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/` into a JS `Date`. **Date-only strings (`"2026-07-09"`) do NOT match** — no `T…` time part — and stay strings. Field-agnostic. Parse failure → Fastify's standard 400.
- **No route-level validation.** No handler attaches a Fastify `schema`. Zod schemas exist in `@mamen/shared` (`ruleSchema`, `settingSchema`, `appSettingsSchema`, `createRuleSchema`, …) but are **never applied at the route layer** — bodies are typed only via TS generics. The only runtime checks are manual `Number.isNaN(id)` guards on `:id` path params.
- **Global error handler:** `app.setErrorHandler` → `console.error("API error:", …)` + **`500 { error: "Internal Server Error" }`**. Any repository throw (SQLite error, malformed `decodeURIComponent`, missing `merchants/` dir on write, `body.records` undefined) surfaces as this generic 500.
- **Success statuses:** handlers that `return` a value → implicit **200**. Only single-record `POST` creates set **201**. `PUT`/`DELETE`/bulk-put → **200**.

### Global quirks to decide on (feed the [error-taxonomy ticket](../issues/0005-error-taxonomy-status-conventions.md) + contract)

- **Inconsistent envelopes:** reads return entities/arrays **raw**; creates → `{ id }`/`{ ids }` (201); count → `{ count }`; mutations → `{ ok: true }` (200); image upload → `{ imageUrl }` (unique).
- **Uneven 404s:** GET-by-id/name/slug 404 on missing. `PUT`/`DELETE :id` **never 404** — return `{ ok: true }` regardless of existence. Exceptions: `POST`/`DELETE /merchants/:id/image` DO 404 (they fetch first); `DELETE /merchants/:id` does NOT.
- **NaN guard only on path `:id`.** Query-string numeric coercions (`accountId`, `merchantId`, `categoryId`, `parentId`, `linkedRefundId`, …) pass `NaN` straight into repo methods, unguarded.
- **`decodeURIComponent` inconsistent:** applied on `by-name` (accounts, merchants), NOT on `by-slug`, `by-type`, `by-import-batch`. Malformed `%` → `URIError` → 500.
- **Verb/semantics mismatches:** `POST /transactions/bulk-delete` (delete via POST), `POST /transactions/bulk-get` (read via POST), `POST /database/export` (read via POST), `POST …/clear` (destructive delete-all, no body/confirmation).
- **Status split:** single `POST` create → 201; `bulk-add` → 201; `bulk-put` → 200. Inconsistent.

---

## 2. Endpoints by resource

Entity types (from `packages/shared/src/types/`):

- **Account:** `{ id?: number; name: string; type: "checking"|"savings"|"credit_card"|"other"; createdAt: Date; updatedAt: Date }`
- **Category:** `{ id?: number; name: string; slug: string; color: string; icon: string; parentId: number|null; sortOrder: number; createdAt: Date }`
- **Merchant:** `{ id?: number; name: string; imageUrl?: string; defaultCategoryId?: number; createdAt: Date; firstSeen: Date }`
- **Transaction:** `{ id?: number; accountId: number; date: Date; amount: number; rawMerchantString: string; merchantId?: number; categoryId?: number; subcategoryId?: number; categoryOverride?: string; manualCategory?: boolean; isRefund?: boolean; linkedRefundId?: number; anomalyFlags?: AnomalyFlag[]; isDuplicateExcluded?: boolean; duplicateNote?: string; importedAt: Date; importMonth: string; importBatchId?: string }`
- **Rule:** `{ id?: number; merchantId: number; pattern: string; categoryOverride?: number; matchCount: number; createdAt: Date }`
- **Subscription:** `{ id?: number; merchantId: number; merchantName: string; typicalAmount: number; frequency: "weekly"|"monthly"|"yearly"; intervalDays: number; lastChargeDate: string; firstChargeDate: string; chargeCount: number; status: "active"|"possibly-cancelled"; transactionIds: number[]; detectedAt: string; updatedAt: string }`
- **Setting:** `{ id?: number; key: SettingKey; value: string }` — `SettingKey` = `llm_endpoint | llm_api_key | llm_model | currency_symbol | date_format | anomaly_threshold | anomaly_settings | displayPreferences`
- **AppSettings:** `{ id: "app"; llm: LLMSettings }`, `LLMSettings = { endpoint: string; apiKey?: string; modelName: string; provider: "ollama"|"lm-studio"|"openai"|"anthropic"|"custom"; lastTestedAt?: Date; lastTestSuccess?: boolean }`

Legend: **used** = web app calls it; **client-only** = client fn exists, web never calls it; **no client** = no client fn.

### Health

| Method + path | Repo call | Success | Errors | Web |
|---|---|---|---|---|
| `GET /api/health` | none | 200 `{ status: "ok" }` | — | no client (expected) |

Does NOT check DB connectivity — returns a literal.

### Accounts (`routes/accounts.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/accounts` | — | `accounts.getAll` | 200 `Account[]` | — | used |
| `GET /api/accounts/:id` | `id` num | `accounts.get` | 200 `Account` | 400 invalid id, 404 not found | used |
| `POST /api/accounts` | `Omit<Account,"id">` | `accounts.add` | **201** `{ id }` | — | used |
| `PUT /api/accounts/:id` | `Partial<Account>` | `accounts.update` | 200 `{ ok: true }` | 400 invalid id | used |
| `DELETE /api/accounts/:id` | `id` num | `accounts.delete` | 200 `{ ok: true }` | 400 invalid id | used |
| `GET /api/accounts/by-name/:name` | `name` (decoded) | `accounts.getByName` | 200 `Account` | 404 | used |
| `GET /api/accounts/by-type/:type` | `type` (raw, unvalidated) | `accounts.getByType` | 200 `Account[]` | — | **client-only** |

PUT/DELETE never 404 on missing id. `by-type` not validated against the union.

### Categories (`routes/categories.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/categories` | `parentId?`, `orderBy?` | fan-out ↓ | 200 `Category[]` | — | used |
| `GET /api/categories/root` | — | `categories.getRootCategories` | 200 `Category[]` | — | **client-only** |
| `GET /api/categories/:id` | `id` num | `categories.get` | 200 `Category` | 400, 404 | used |
| `POST /api/categories` | `Omit<Category,"id">` | `categories.add` | **201** `{ id }` | — | used |
| `POST /api/categories/bulk-add` | `{ records: Omit<Category,"id">[] }` | `categories.bulkAdd` | **201** `{ ids }` | — | used |
| `PUT /api/categories/:id` | `Partial<Category>` | `categories.update` | 200 `{ ok: true }` | 400 | used |
| `PUT /api/categories/bulk-put` | `{ records: Category[] }` | `categories.bulkPut` | 200 `{ ok: true }` | — | **client-only** |
| `DELETE /api/categories/:id` | `id` num | `categories.delete` | 200 `{ ok: true }` | 400 | used |
| `GET /api/categories/by-slug/:slug` | `slug` (raw, not decoded) | `categories.getBySlug` | 200 `Category` | 404 | used |
| `POST /api/categories/clear` | — | `categories.clear` | 200 `{ ok: true }` | — | **client-only** |

**`GET /api/categories` fan-out** (first match wins):
1. `parentId` truthy + `orderBy === "sortOrder"` → `getByParentIdOrderedBySortOrder(Number(parentId))`
2. `parentId` truthy → `getByParentId(Number(parentId))`
3. `orderBy === "sortOrder"` → `getAllOrderedBySortOrder()`
4. else → `getAll()`

`parentId="0"` is truthy (string); no NaN guard on `Number(parentId)`. Only `orderBy="sortOrder"` recognized.

### Merchants (`routes/merchants.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/merchants` | `orderBy?` | `getAllOrderedByName` if `orderBy==="name"` else `getAll` | 200 `Merchant[]` | — | used |
| `GET /api/merchants/:id` | `id` num | `merchants.get` | 200 `Merchant` | 400, 404 | used |
| `POST /api/merchants` | `Omit<Merchant,"id">` | `merchants.add` | **201** `{ id }` | — | used |
| `PUT /api/merchants/:id` | `Partial<Merchant>` | `merchants.update` | 200 `{ ok: true }` | 400 | used |
| `DELETE /api/merchants/:id` | `id` num | `merchants.get` + `merchants.delete` | 200 `{ ok: true }` | 400 | used |
| `GET /api/merchants/by-name/:name` | `name` (decoded) | `merchants.getByName` | 200 `Merchant` | 404 | used |
| `GET /api/merchants/by-name-ci/:name` | `name` (decoded) | `merchants.getByNameCaseInsensitive` | 200 `Merchant` | 404 | used |
| `PUT /api/merchants/bulk-put` | `{ records: Merchant[] }` | `merchants.bulkPut` | 200 `{ ok: true }` | — | **client-only** |
| `POST /api/merchants/:id/image` | multipart, 1 file | `merchants.get` + `merchants.update` | 200 `{ imageUrl }` | 400 invalid id, 404, 400 no file, 400 invalid type | used |
| `DELETE /api/merchants/:id/image` | `id` num | `merchants.get` + `merchants.update` | 200 `{ ok: true }` | 400, 404 | used |

**Image upload side effects** (`POST /api/merchants/:id/image`):
- MIME allowlist (handler constant): `image/jpeg`, `image/png`, `image/webp`, `image/gif` → 400 `{ error: "Invalid file type. Allowed: jpeg, png, webp, gif" }` on miss.
- Filename: `` `merchant-${id}-${Date.now()}.${ext}` `` (`ext` from MIME map). Written **synchronously** (`writeFileSync`) to `uploadsDir/merchants/`. The `merchants/` dir must pre-exist (no `mkdir`) — else 500.
- Old image cleanup: if `merchant.imageUrl` set, `deleteUpload(join(uploadsDir, imageUrl.replace("/uploads/","")))`.
- Returns `{ imageUrl: "/uploads/merchants/<filename>" }` — a **root-relative path** the web renders raw as `<img src>`. No explicit size check (relies on global 2 MiB; over-limit → 500, not 413).

**`DELETE /api/merchants/:id`** cascade: fetches merchant (optional-chain), if `imageUrl` set deletes the file, then `delete(id)`. **No 404** even if merchant missing. `DELETE /api/merchants/:id/image` deletes the file + sets `imageUrl: undefined` (unchecked `as Partial<Merchant>` cast); **does** 404.

### Transactions (`routes/transactions.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/transactions` | 10 query params | fan-out ↓ | 200 `Transaction[]` | — | used |
| `GET /api/transactions/count` | `accountId?`, `importMonth?`, `importBatchId?` | fan-out ↓ | 200 `{ count }` | — | used |
| `GET /api/transactions/:id` | `id` num | `transactions.get` | 200 `Transaction` | 400, 404 | used |
| `POST /api/transactions` | `Omit<Transaction,"id">` | `transactions.add` | **201** `{ id }` | — | used |
| `POST /api/transactions/bulk` | `{ records: Omit<Transaction,"id">[] }` | `transactions.bulkAddReturningIds` | **201** `{ ids }` | — | used |
| `PUT /api/transactions/:id` | `Partial<Transaction>` | `transactions.update` | 200 `{ ok: true }` | 400 | used |
| `PUT /api/transactions/bulk-put` | `{ records: Transaction[] }` | `transactions.bulkPut` | 200 `{ ok: true }` | — | used |
| `DELETE /api/transactions/:id` | `id` num | `transactions.delete` | 200 `{ ok: true }` | 400 | used |
| `POST /api/transactions/bulk-delete` | `{ ids: number[] }` | `transactions.bulkDelete` | 200 `{ ok: true }` | — | used |
| `POST /api/transactions/bulk-get` | `{ ids: number[] }` | `transactions.bulkGet` | 200 `Transaction[]` | — | used |
| `DELETE /api/transactions/by-account-month` | `accountId`, `importMonth` (query, required) | `deleteByAccountIdAndMonth` | 200 `{ ok: true }` | 400 both required | used |
| `DELETE /api/transactions/by-import-batch/:batchId` | `batchId` (raw string) | `deleteByImportBatchId` | 200 `{ ok: true }` | — | used |

**`GET /api/transactions` fan-out** — EXACT precedence, first match wins, each branch early-returns:

| # | Condition | Repo call | Args |
|---|---|---|---|
| 1 | `accountId && importMonth` | `getByAccountIdAndMonth` | `Number(accountId)`, `importMonth` |
| 2 | `accountId` | `getByAccountId` | `Number(accountId)` |
| 3 | `merchantId` | `getByMerchantId` | `Number(merchantId)` |
| 4 | `categoryId` | `getByCategoryId` | `Number(categoryId)` |
| 5 | `importBatchId` | `getByImportBatchId` | `importBatchId` (string) |
| 6 | `linkedRefundId` | `getByLinkedRefundId` | `Number(linkedRefundId)` |
| 7 | `startDate && endDate` | `getByDateRange` | `new Date(startDate)`, `new Date(endDate)` |
| 8 | `orderBy === "date"` | `getAllOrderedByDate` | `direction` (`"asc"\|"desc"\|undefined`) |
| 9 | else | `getAll` | — |

**This is the key fan-out the contract must reckon with** ([map fog note](../issues/0001-effect-api-rework.md): "transactions query-param fan-out may split"). Filters are **either/or dispatch, not composable**: `accountId` dominates — with `accountId` present, `merchantId`/`categoryId`/`importBatchId`/`linkedRefundId`/date-range/orderBy are all unreachable. `importMonth` only works alongside `accountId` (branch 1); alone it's ignored. `startDate` XOR `endDate` doesn't match branch 7. Only `orderBy="date"` recognized. No NaN guards on any coercion.

**`GET /api/transactions/count` fan-out:** (1) `accountId && importMonth` → `countByAccountIdAndMonth`; (2) `importBatchId` → `countByImportBatchId`; (3) else → `count()` (total). No accountId-only count branch.

### Rules (`routes/rules.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/rules` | `merchantId?` | `getByMerchantId` if present else `getAll` | 200 `Rule[]` | — | used |
| `GET /api/rules/count` | `merchantId?` | `countByMerchantId` if present else `count` | 200 `{ count }` | — | used |
| `GET /api/rules/:id` | `id` num | `rules.get` | 200 `Rule` | 400, 404 | used |
| `POST /api/rules` | `Omit<Rule,"id">` | `rules.add` | **201** `{ id }` | — | used |
| `PUT /api/rules/:id` | `Partial<Rule>` | `rules.update` | 200 `{ ok: true }` | 400 | used |
| `DELETE /api/rules/:id` | `id` num | `rules.delete` | 200 `{ ok: true }` | 400 | used |
| `POST /api/rules/bulk-add` | `{ records: Omit<Rule,"id">[] }` | `rules.bulkAdd` | **201** `{ ids }` | — | **client-only** |
| `POST /api/rules/bulk-delete` | `{ ids: number[] }` | `rules.bulkDelete` | 200 `{ ok: true }` | — | **client-only** |
| `GET /api/rules/by-merchant-pattern/:merchantId/:pattern` | `merchantId` num, `pattern` (decoded) | `getByMerchantIdAndPattern` | 200 `Rule` | 400 invalid merchantId, 404 | used |

### Subscriptions (`routes/subscriptions.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/subscriptions` | `merchantId?`, `status?` | fan-out ↓ | 200 `Subscription[]` | — | used |
| `GET /api/subscriptions/:id` | `id` num | `subscriptions.get` | 200 `Subscription` | 400, 404 | **client-only** |
| `POST /api/subscriptions` | `Omit<Subscription,"id">` | `subscriptions.add` | **201** `{ id }` | — | used |
| `PUT /api/subscriptions/:id` | `Partial<Subscription>` | `subscriptions.update` | 200 `{ ok: true }` | 400 | used |
| `DELETE /api/subscriptions/:id` | `id` num | `subscriptions.delete` | 200 `{ ok: true }` | 400 | **client-only** |
| `GET /api/subscriptions/first-by-merchant/:merchantId` | `merchantId` num | `getFirstByMerchantId` | 200 `Subscription` | 400, 404 | used |
| `GET /api/subscriptions/by-merchant-frequency/:merchantId/:frequency` | `merchantId` num, `frequency` (unchecked cast) | `getByMerchantIdAndFrequency` | 200 `Subscription` | 400, 404 | used |
| `PUT /api/subscriptions/bulk-put` | `{ records: Subscription[] }` | `subscriptions.bulkPut` | 200 `{ ok: true }` | — | **client-only** |
| `POST /api/subscriptions/clear` | — | `subscriptions.clear` | 200 `{ ok: true }` | — | **client-only** |

Query precedence: `merchantId` > `status` > all. `frequency` path param is an unchecked `as SubscriptionFrequency` cast.

### Settings — key/value store (`routes/settings.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/settings` | — | `settings.getAll` | 200 `Setting[]` | — | used |
| `GET /api/settings/by-key/:key` | `key` (unchecked cast) | `settings.getByKey` | 200 `Setting` | 404 | used |
| `PUT /api/settings/by-key` | `Setting` | `settings.putByKey` (upsert on key) | 200 `{ ok: true }` | — | used |
| `DELETE /api/settings/:id` | `id` num | `settings.delete` | 200 `{ ok: true }` | 400 | **client-only** |
| `POST /api/settings/clear` | — | `settings.clear` | 200 `{ ok: true }` | — | **client-only** |

**Asymmetric addressing:** mutation keyed by `key` (`PUT /by-key`), deletion keyed by numeric `id` (`DELETE /:id`). No POST-create (upsert covers it). `value` is always a string — callers serialize structured values (`anomaly_settings`, `displayPreferences`) themselves.

### App-settings — singleton config (`routes/app-settings.ts`)

| Method + path | Params / body | Repo call | Success | Errors | Web |
|---|---|---|---|---|---|
| `GET /api/app-settings` | — | `appSettings.get` | 200 `AppSettings` | 404 not found | used |
| `PUT /api/app-settings` | `AppSettings` | `appSettings.put` (single-row upsert, id `"app"`) | 200 `{ ok: true }` | — | used |
| `POST /api/app-settings/clear` | — | `appSettings.clear` | 200 `{ ok: true }` | — | **client-only** |

**Settings vs app-settings** (the requested distinction): `settings` = generic key/value table, N rows, `value` always a string (callers JSON-encode structured values). `app-settings` = single fixed-shape object (`{ id: "app", llm: LLMSettings }`), one row, get/put-whole/clear only. **LLM config lives in both** — as loose strings in `settings` (`llm_endpoint`/`llm_api_key`/`llm_model`) AND as a typed object in `app-settings.llm`. `app-settings.llm` additionally carries `provider`/`lastTestedAt`/`lastTestSuccess` with no `settings`-key equivalent. **Zod drift:** `settingKeySchema` omits `displayPreferences` present in the TS `SettingKey` type (schema unused at routes anyway).

### Database — backup / restore / reset (`routes/database.ts`)

| Method + path | Body | Behavior | Success | Web |
|---|---|---|---|---|
| `POST /api/database/reset` | — | `clear()` all 8 tables (order: transactions, merchants, rules, subscriptions, categories, settings, appSettings, accounts). Destructive full wipe, no reseed, no confirmation. | 200 `{ ok: true }` | used |
| `POST /api/database/export` | — | Read all tables → JSON dump. **Read via POST.** | 200 `{ accounts, transactions, merchants, rules, categories, subscriptions, settings, appSettings }` (each an array; `appSettings` is 0- or 1-element) | used |
| `POST /api/database/import` | `{ accounts?, transactions?, merchants?, rules?, categories?, subscriptions?, settings?, appSettings? }` (each `unknown[]`, cast `as never[]`) | **Clear-then-load** = destructive replace: wipes ALL 8 tables first (even tables absent from payload), then `bulkPut` in dependency order (accounts → categories → merchants → rules → transactions → subscriptions → settings); `appSettings` = `body.appSettings[0]` via `appSettings.put`. | 200 `{ ok: true }` | used |

No auth, no confirmation, no merge/partial mode. Export persistence is the client's job (JSON in response body, no file). Clear order (transactions-first) differs from load order (accounts-first) — deliberate for logical-FK dependency ordering.

---

## 3. Repository & schema layer

Backs every route; the [`@effect/sql` rewrite](../issues/0001-effect-api-rework.md) reimplements this. Adapter = `bun:sqlite` (`connection.ts`: WAL mode, `PRAGMA foreign_keys = ON`, runs migrations + `seedCategories` on open; `:memory:` variant for tests).

### IDs & dates & booleans

- **IDs:** all entity tables `INTEGER PRIMARY KEY AUTOINCREMENT` (numeric). Exception: `appSettings.id` is `TEXT PRIMARY KEY` = `"app"` (singleton).
- **Dates:** stored as **ISO 8601 strings in `TEXT` columns** (`.toISOString()` on write, `new Date(...)` on read). No epochs. Wrapped to `Date` in the TS entity for: `accounts.createdAt/updatedAt`, `transactions.date/importedAt`, `merchants.createdAt/firstSeen`, `categories.createdAt`, `rules.createdAt`. Kept as `string` in both entity + DB: `subscriptions.{lastChargeDate,firstChargeDate,detectedAt,updatedAt}`, `transactions.importMonth` (`"YYYY-MM"`).
- **Booleans:** `INTEGER` 0/1 (`transactions.{manualCategory,isRefund,isDuplicateExcluded}`), read back as `true | undefined`.
- **JSON-in-TEXT:** `transactions.anomalyFlags` (array), `subscriptions.transactionIds` (`number[]`, `DEFAULT '[]'`), `appSettings.llm` (object).

### No foreign keys

**Zero `FOREIGN KEY` constraints declared on any table** — all references (`accountId`, `merchantId`, `categoryId`, `parentId`, `linkedRefundId`, …) are plain indexed columns. Despite `PRAGMA foreign_keys = ON`, there is **no DB-level FK enforcement and no `ON DELETE` cascade anywhere.** Referential integrity is entirely application-managed (and the routes mostly don't manage it — no cascade logic beyond merchant image files).

### Tables

- **`accounts`** — `id` PK · `name` (idx) · `type` TEXT default `'checking'` (idx; logical enum) · `createdAt` (idx) · `updatedAt`.
- **`transactions`** — `id` PK · `accountId` (idx) · `date` (idx) · `amount` REAL (idx) · `rawMerchantString` · `merchantId?` (idx) · `categoryId?` (idx) · `subcategoryId?` (idx) · `categoryOverride?` TEXT · `manualCategory?` INT 0/1 (idx) · `isRefund?` INT 0/1 · `linkedRefundId?` (idx) · `anomalyFlags?` TEXT-JSON · `isDuplicateExcluded?` INT 0/1 · `duplicateNote?` · `importedAt` · `importMonth` (idx) · `importBatchId?` (idx) · composite idx `(accountId, importMonth)`.
- **`merchants`** — `id` PK · `name` (idx) · `defaultCategoryId?` (idx) · `createdAt` · `firstSeen` (idx) · `imageUrl?` (added via `ALTER TABLE` at end of migration).
- **`rules`** — `id` PK · `merchantId` (idx) · `pattern` (idx) · `categoryOverride?` INT (a category id despite the name) · `matchCount` INT default 0 · `createdAt`.
- **`settings`** — `id` PK · `key` TEXT **UNIQUE** (unique idx) · `value` TEXT.
- **`appSettings`** — `id` TEXT PK (`"app"`) · `llm` TEXT-JSON. Writes `INSERT OR REPLACE`.
- **`categories`** — `id` PK · `name` · `slug` (idx, **not** declared unique though used as a lookup key) · `color` · `icon` · `parentId?` (self-ref, idx; NULL = root) · `sortOrder` INT default 0 (idx) · `createdAt`. Seeded on connection.
- **`subscriptions`** — `id` PK · `merchantId` (idx) · `merchantName` (denormalized) · `typicalAmount` REAL · `frequency` TEXT enum · `intervalDays` INT · `lastChargeDate` · `firstChargeDate` · `chargeCount` INT · `status` TEXT default `'active'` (idx) · `transactionIds` TEXT-JSON default `'[]'` · `detectedAt` · `updatedAt`.

### Ports

All repos except `AppSettingsRepository` extend **`BaseRepository<T extends { id?: number }>`**:
`get(id)` · `getAll()` · `add(Omit<T,"id">) → number` · `bulkAdd(Omit<T,"id">[]) → number[]` · `update(id, Partial<T>) → void` · `bulkPut(T[]) → void` (INSERT OR REPLACE, needs id) · `delete(id)` · `bulkDelete(ids)` · `bulkGet(ids) → (T|undefined)[]` · `count() → number` · `clear()`.

Per-repo extensions:
- **accountRepo:** `getByName`, `getByType`.
- **categoryRepo:** `getBySlug`, `getByParentId`, `getByParentIdOrderedBySortOrder`, `getRootCategories` (parentId IS NULL), `getAllOrderedBySortOrder`.
- **merchantRepo:** `getByName`, `getByNameCaseInsensitive` (COLLATE NOCASE), `getAllOrderedByName`.
- **transactionRepo:** `getByAccountId`, `getByAccountIdAndMonth`, `countByAccountIdAndMonth`, `deleteByAccountIdAndMonth`, `getByMerchantId`, `getByCategoryId`, `getByDateRange(start, end)`, `getByImportBatchId`, `countByImportBatchId`, `deleteByImportBatchId`, `getByLinkedRefundId`, `getAllOrderedByDate(direction = "desc")`, `bulkAddReturningIds` (≡ `bulkAdd`), `filterByPredicate((tx) => boolean)` (**loads ALL rows into JS, filters in memory**), `filterIdsByPredicate` (same, returns ids).
- **ruleRepo:** `getByMerchantId`, `countByMerchantId`, `getByMerchantIdAndPattern`.
- **subscriptionRepo:** `getByMerchantId`, `getFirstByMerchantId`, `getByMerchantIdAndFrequency`, `getByStatus`.
- **settingRepo:** `getByKey`, `putByKey` (INSERT OR REPLACE on key).
- **appSettingsRepo** (not Base, singleton): `get()`, `put(settings)`, `clear()`.
- **databaseRepo** (`DatabasePort`, lifecycle): `open()`, `close()`, `delete()`.
- **UnitOfWork** (`unit-of-work.port.ts`): `run<T>(fn) → Promise<T>` — manual `BEGIN`/`COMMIT`/`ROLLBACK` around an async callback; rolls back + rethrows on throw. **Not invoked by any route** read (bulk methods use bun's native `db.transaction` independently). Cross-repo transaction primitive that's effectively unused at the HTTP layer.

---

## 4. Dead / unused endpoints (drop candidates for the contract)

Scoped to non-test `packages/web/src`; every route has server-side tests, so "unused in web" ≠ "untested."

**Broken orphan (highest-confidence drop):**
- **`importApi.run() → POST /api/import`** — the `web-api-legacy/src/import.ts` client posts to `/api/import`, but **the server has no such route** (only `POST /api/database/import`). Also never called by web. Dead client hitting a nonexistent endpoint.

**Client-only endpoints** (real, tested, but web never calls them — candidates to drop unless kept for parity/future use):
`GET /accounts/by-type/:type` · `GET /categories/root` · `PUT /categories/bulk-put` · `POST /categories/clear` · `PUT /merchants/bulk-put` · `POST /rules/bulk-add` · `POST /rules/bulk-delete` · `GET /subscriptions/:id` · `DELETE /subscriptions/:id` · `PUT /subscriptions/bulk-put` · `POST /subscriptions/clear` · `DELETE /settings/:id` · `POST /settings/clear` · `POST /app-settings/clear`.

**Entire `query/` factory layer is dead relative to web.** `web-api-legacy` exports generated `*Queries`/`*Mutations` factories (`defineQueries`/`defineMutations`, all 10 resource modules). The web app **does not use them** — it calls raw `*Api` methods inside hand-written `useQuery`/`useMutation` hooks, using only `queryKeys` + `invalidateEntity`/`invalidateAll`. Not an endpoint concern (it's client shape), but it means the [SDK tanstack-query layer](../issues/0001-effect-api-rework.md) has no existing factory contract to preserve — the web currently hand-rolls hooks.

---

## What this unblocks

- **[Design the new REST contract](../issues/0006-design-new-rest-contract.md)** — this is its resource-by-resource checklist. Key decisions it must make, surfaced here: the transactions either/or fan-out → composable filters; settings/app-settings LLM-config overlap → merge or keep split; envelope consistency; 404-on-mutation policy; numeric-id validation on query params; which client-only/dead endpoints to drop; ID type (numeric today) and date handling (ISO-string `TEXT`, date-only vs datetime split, replacing the date-reviver with `Schema.Date`).
- **[Error taxonomy and status conventions](../issues/0005-error-taxonomy-status-conventions.md)** — inherits the current error inventory: `400 { error: "Invalid id" }`, `404 { error: "Not found" }`, `400 { error: "…" }` variants, and the catch-all `500 { error: "Internal Server Error" }`. All use a bare `{ error: string }` envelope.
- **Per-resource port tickets** (map fog) — the endpoint tables above are each port's spec.
