---
id: 20
title: Cutover — delete old packages, retire zod, rewire dev
state: closed
labels: [wayfinder:impl]
assignee: luriondel
parent: 1
blocked-by: [11, 12, 13, 14, 15, 16, 17, 18, 19]
---

## Question

The final map ticket (map fog "Cutover ticket"). With every resource ported and live through the new `@mamen/api`, retire the old stack.

- **Delete `@mamen/server`** (old Fastify server) and **`@mamen/web-api-legacy`** (renamed old client-hooks package from [Scaffold](0007-scaffold-new-packages.md)).
- **Retire zod from `@mamen/shared`** — the Effect contract now covers every schema the ported API needs; remove the zod schemas and the `zod` dependency. (Web frontend adaptation is out of scope for this map — but zod removal from `@mamen/shared` may surface frontend breakage, which is **allowed to break** per the map. Confirm the frontend break scope is acceptable / tracked as its own effort.)
- **Rewire root `turbo dev` + scripts** onto the new `@mamen/api` (the `logs/server.log` tee'd dev server per CLAUDE.md should now run the new server).
- **Final coverage check** — the whole new API meets the coverage gate settled in [Port accounts](0011-port-accounts.md).
- Confirm OpenAPI (live `/api/openapi.json` + Scalar + committed `packages/api/openapi.json` + the `openapi:check` drift guard from [OpenAPI spec emit script](0009-openapi-emit-script.md)) reflects the full ported contract.

On close, **the map is done**: the new API is live, tested, and the old packages are deleted (map Destination).

## Acceptance criteria

- [ ] `@mamen/server` and `@mamen/web-api-legacy` deleted; workspace builds without them.
- [ ] zod removed from `@mamen/shared` (dep + schemas); any resulting frontend break is confirmed acceptable/tracked (out of scope to fix here).
- [ ] Root `turbo dev` + scripts run the new `@mamen/api`; `logs/server.log` tee works.
- [ ] Committed `openapi.json` regenerated + drift guard green over the full contract.
- [ ] Final coverage gate passes across the new API.

## Blocked by

- Every port ticket — [accounts](0011-port-accounts.md) (#11) through [health + database](0019-port-health-database.md) (#19).
