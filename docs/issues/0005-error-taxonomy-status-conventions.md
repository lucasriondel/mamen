---
id: 5
title: Error taxonomy and status-code conventions
state: closed
labels: [wayfinder:grilling]
assignee: luriondel
parent: 1
blocked-by: []
---

## Question

What is the shared error taxonomy and status-code convention every endpoint follows? To decide with the user (grilling + domain-modeling):

- The domain error types (e.g. NotFound, Validation, Conflict, StorageFailure…) as Effect Schema tagged errors in @mamen/shared, and their HTTP status mapping.
- Error response body shape (envelope: tag, message, details?) — consistent across all endpoints, expressible in the OpenAPI spec, surfaced as typed errors in the derived client.
- Status-code conventions for success: create → 201, delete → 204, etc.
- How @effect/sql errors (SqlError) map to the taxonomy at the service boundary — what leaks to the wire, what doesn't.
- Validation failures: what a schema-decode failure response looks like (HttpApi has a default — accept or customize?).

Resolution is the taxonomy written down: error list, schemas sketch, mapping table. [Design the new REST contract](0006-design-new-rest-contract.md) builds on it.

## Resolution

Taxonomy written to **[docs/research/error-taxonomy.md](../research/error-taxonomy.md)** — decided with Lucas via grilling, 2026-07-09. Every decision on the tree locked; [Design the new REST contract](0006-design-new-rest-contract.md) applies the per-endpoint mapping rule mechanically.

**Decisions:**

- **Envelope:** flat per-error tagged struct — each error a `Schema.TaggedError` in `@mamen/shared`, wire body = `_tag` + `message` + error-specific fields. No wrapper key. Same grain as the framework's `HttpApiDecodeError`; the derived client decodes `_tag` to a typed instance.
- **Domain error set (3):** `NotFound (404)` `{ resource, id }`, `Conflict (409)` `{ resource, message }`, `InvalidFileType (415)` `{ allowed, received }`. Plus framework `HttpApiDecodeError (400)`, implicit on every endpoint.
- **Excluded:** `Invalid id` (becomes schema decode — `:id` typed as `NumberFromString`, non-numeric → `HttpApiDecodeError`) and `ValidationError` for domain rules (faithful port — the current server enforces no referential/domain rules; add per-resource later if a port needs one).
- **SqlError:** never crosses the wire as itself. Service catches it → UNIQUE constraint → `Conflict (409)`; everything else → untyped `500`, no body, no DB detail leaked.
- **Decode failures:** accept HttpApi default — `HttpApiDecodeError` @ **400** with `issues[]`, no customization.
- **Success statuses:** GET 200 · create **201 + full resource** · update **200 + full resource** · delete **204 no-body** · bulk-create 201 + resources · bulk-put/delete **200 `{ count }`** · bulk-get stays POST → 200 array · actions 200. Mutations return the affected resource so the SDK primes its cache without a refetch.
- **Error sets:** **tight** — each endpoint declares only the domain errors it can produce (framework `HttpApiDecodeError` + untyped 500 stay implicit). Mapping rule by operation-shape is in the doc §6.
- **Behavior change (deliberate, flagged):** update/delete on a missing id now → `NotFound (404)`, reversing today's silent `{ ok: true }`.

No new tickets. **This closes the last blocker on [Design the new REST contract](0006-design-new-rest-contract.md)** ([2](0002-survey-effect-httpapi-stack.md)/[3](0003-uploads-static-files-under-httpapi.md)/[4](0004-inventory-current-api-surface.md)/5 all now closed) — the contract is next on the frontier.
