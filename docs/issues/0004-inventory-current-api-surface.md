---
id: 4
title: Inventory the current API surface
state: open
labels: [wayfinder:research]
assignee: none
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
