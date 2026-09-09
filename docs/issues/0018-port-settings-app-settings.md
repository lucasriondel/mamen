---
id: 18
title: Port settings + app-settings
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 11]
---

## Question

Port **both settings resources** (they're small; paired into one ticket) per [api-contract.md](../research/api-contract.md) §2.8 + §2.9, copying the DB-test + coverage pattern from [Port accounts](0011-port-accounts.md). They stay **two separate resources** (grilled decision #2) — LLM config duplication across both is accepted, faithful.

**Settings** (key/value store, §2.8) — group `settings`: `list` (paged), `getByKey` (`GET /settings/by-key/:key`, `key` a validated `SettingKey` literal), `putByKey` (`PUT /settings/by-key`, upsert → 200 `Setting`, **no `NotFound`** — upsert always succeeds; **no `Conflict`** — only writer is the upsert). `getByKey` → `NotFound` on absent-but-valid key. `value` always `Schema.String`. **Fix the zod drift**: `SettingKey` literal includes `displayPreferences` (the old zod schema dropped it). Dropped: `DELETE /settings/:id`, `POST /settings/clear` (client-only).

**App-settings** (singleton, §2.9) — group `appSettings`: `get` (→ 200 `AppSettings`, `NotFound` when the singleton row doesn't exist yet), `put` (whole-object upsert → 200 `AppSettings`, no error). Fixed shape `{ id: "app", llm: LlmSettings }`; `llm.lastTestedAt: Schema.optional(Schema.Date)`. Dropped: `POST /app-settings/clear` (client-only).

## Acceptance criteria

- [ ] `SettingsGroup` matches §2.8; `SettingKey` includes `displayPreferences`; `putByKey` upserts + returns the `Setting`; `getByKey` 404s on absent valid key.
- [ ] `AppSettingsGroup` matches §2.9; `get` 404s on missing singleton; `put` upserts the whole object.
- [ ] Both integration-tested through the SDK; coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the test harness + coverage baseline.
