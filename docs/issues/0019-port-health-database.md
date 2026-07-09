---
id: 19
title: Port health + database (backup / restore / reset)
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 12, 13, 14, 15, 16, 17, 18]
---

## Question

Port the two remaining groups per [api-contract.md](../research/api-contract.md) §2.1 + §2.10. **Health** is trivial (folded in). **Database** is blocked by every resource port because its dump schema (`DbDump`) imports every entity — port it last.

**Health** (§2.1) — group `health`: `check` (`GET /api/health` → 200 `{ status: "ok" }`, literal, no DB check — faithful). This is the walking-skeleton endpoint from [Scaffold](0007-scaffold-new-packages.md); reconcile with the final group layout.

**Database** (§2.10) — group `database`: `reset` (`POST /database/reset` → 200 `{ ok: true }`, destructive full wipe of all 8 tables, no reseed/confirmation — subsumes all the dropped `*/clear` endpoints), `export` (`POST /database/export` → 200 `DbDump`, **stays POST** — whole-DB dump, client persists the JSON), `import` (`POST /database/import`, `DbImport = Schema.partial(DbDump)` → 200 `{ ok: true }`, destructive clear-then-load in dependency order: accounts → categories → merchants → rules → transactions → subscriptions → settings; `appSettings = appSettings[0]`; a table absent from the payload is still wiped — faithful).

`DbDump` = `{ accounts, transactions, merchants, rules, categories, subscriptions, settings, appSettings }`, each `Schema.Array(Entity)`, `appSettings` 0- or 1-element. No auth/confirmation/merge (local single-user admin — faithful).

## Acceptance criteria

- [ ] `HealthGroup` matches §2.1 (or the walking-skeleton endpoint is reconciled into it).
- [ ] `DatabaseGroup` matches §2.10; `reset` wipes all 8 tables; `export` returns the full `DbDump`; `import` does the destructive clear-then-load in dependency order.
- [ ] Round-trip test: export → reset → import restores state through the SDK.
- [ ] Coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- Every resource port — [categories](0012-port-categories.md) (#12), [merchants](0013-port-merchants.md) (#13), [transactions core](0014-port-transactions-core.md) (#14), [transactions bulk](0015-port-transactions-bulk.md) (#15), [rules](0016-port-rules.md) (#16), [subscriptions](0017-port-subscriptions.md) (#17), [settings + app-settings](0018-port-settings-app-settings.md) (#18) — because `DbDump`/`DbImport` reference every entity schema. ([accounts](0011-port-accounts.md) #11 is transitive via #12.)
