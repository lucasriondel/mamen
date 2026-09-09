---
id: 4
title: Inventory the current API surface
state: closed
labels: [wayfinder:research]
assignee: luriondel
parent: 1
blocked-by: []
---

## Question

What exactly does the current API do? Produce a complete inventory (linked asset under `docs/research/`) as input to the contract redesign — for every route in `packages/server/src/routes/*` :

- Method, path, query params, body shape, response shape(s), status codes actually produced (including implicit 200s and error paths).
- Which repository methods it calls (`packages/server/src/lib/repository/`), and any dispatch logic (e.g. the `/transactions` query-param fan-out to 6 repo methods — document each branch).
- Side effects: uploads written, files deleted, cascades.
- The repository layer itself: every table, every method per repo, the sqlite schema.
- Which endpoints the web app actually calls (cross-check `packages/api/src/*` client functions and their web usage) — flag any dead endpoints.
- Quirks worth preserving or consciously dropping: the `date-parser` plugin's behavior, the `database` routes (what are they for?), settings vs app-settings split.

Pure fact-gathering — no redesign opinions beyond flagging oddities.

## Resolution

Full inventory written to **[docs/research/api-surface-inventory.md](../research/api-surface-inventory.md)** — every endpoint (method/path/params/body/response/status/errors), its repo calls + dispatch logic, side effects, the schema + repo ports, and web-usage cross-check. No new tickets surfaced; the answer feeds existing frontier/fog (contract, error taxonomy, per-resource ports).

**The 50 endpoints across 11 resources** (health, accounts, categories, merchants, transactions, rules, subscriptions, settings, app-settings, database). Every route mounts under `/api`; no CORS; no route-level validation (zod schemas exist in `@mamen/shared` but are never applied — only manual `Number.isNaN(id)` guards); global error handler collapses any throw to `500 { error: "Internal Server Error" }`.

**Findings that shape the contract redesign ([#6](0006-design-new-rest-contract.md)):**

- **The transactions fan-out is either/or dispatch, not composable filters.** `GET /api/transactions` runs a 9-branch first-match if-else; `accountId` dominates (with it present, `merchantId`/`categoryId`/`importBatchId`/`linkedRefundId`/date-range/`orderBy` are all unreachable); `importMonth` only works alongside `accountId`; `startDate` XOR `endDate` doesn't match; only `orderBy="date"` recognized. This is the fog note's "query-param fan-out may split" — the contract must turn it into composable filters. `GET /api/transactions/count` has its own 3-branch fan-out.
- **Settings vs app-settings overlap.** `settings` = generic key/value table (`value` always a string, callers JSON-encode). `app-settings` = singleton `{ id: "app", llm: LLMSettings }`. **LLM config is representable in both** (loose `llm_*` string keys vs typed `app-settings.llm`); `app-settings.llm` additionally has `provider`/`lastTestedAt`/`lastTestSuccess`. Merge-or-keep-split is a contract decision.
- **Pervasive inconsistencies to normalize:** envelopes (raw entities vs `{ ok }` vs `{ id }` vs `{ imageUrl }` vs `{ count }`); 404-on-mutation (GET-by-id 404s, but `PUT`/`DELETE :id` never do — return `{ ok: true }` regardless of existence); NaN-guard only on path `:id`, never on query-string numeric coercions; `decodeURIComponent` applied inconsistently; verb/semantics mismatches (`POST /transactions/bulk-delete`, `POST /transactions/bulk-get`, `POST /database/export` — all read/delete-via-POST).
- **IDs numeric autoincrement; dates ISO-8601 strings in `TEXT`.** Some date fields wrapped to `Date` in the entity, some kept as `string` (`subscriptions.*`, `transactions.importMonth = "YYYY-MM"`). The date-reviver plugin coerces **only datetime** strings (`YYYY-MM-DDTHH:MM:SS`), not date-only — contract replaces this with `Schema.Date` semantics.
- **Zero DB-level foreign keys / cascades** despite `PRAGMA foreign_keys = ON` — referential integrity is application-managed (and routes mostly don't manage it). The `@effect/sql` rewrite inherits this reality.

**Dead-endpoint candidates ([#6](0006-design-new-rest-contract.md) drop list):** one broken orphan — `importApi.run() → POST /api/import` client with **no matching server route** (server only has `POST /api/database/import`), also unused in web. Plus 14 client-only endpoints (real + tested, but web never calls them) — full list in the asset §4. Also: the legacy client's entire generated `query/` factory layer (`*Queries`/`*Mutations`) is unused — web hand-rolls its hooks off raw `*Api` + `queryKeys` + `invalidate*`, so the new SDK's tanstack-query layer has no factory contract to preserve.

**Error inventory (feeds [#5](0005-error-taxonomy-status-conventions.md)):** current wire errors are all a bare `{ error: string }` envelope — `400 { error: "Invalid id" }`, `404 { error: "Not found" }`, assorted `400 { error: "…" }`, and the catch-all `500 { error: "Internal Server Error" }`.
