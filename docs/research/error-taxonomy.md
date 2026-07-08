# Error taxonomy & status-code conventions

Resolves [Error taxonomy and status-code conventions](../issues/0005-error-taxonomy-status-conventions.md) for the [Effect API rework](../issues/0001-effect-api-rework.md). Decided with Lucas via grilling, 2026-07-09. This is the shared convention **every endpoint in the new contract follows**; [Design the new REST contract](../issues/0006-design-new-rest-contract.md) applies the per-endpoint mapping rule mechanically.

Grounded in the [current API surface inventory](api-surface-inventory.md) — today's errors are all a bare `{ error: string }` (`400 "Invalid id"`, `404 "Not found"`, catch-all `500 "Internal Server Error"`). This taxonomy replaces that.

---

## 1. Error envelope

**Flat, per-error tagged struct.** Each error is a `Schema.TaggedError` in `@mamen/shared`; the wire body is its fields plus the `_tag` discriminant. No wrapper key.

```jsonc
{ "_tag": "NotFound", "message": "Account 5 not found", "resource": "account", "id": 5 }
```

This is the same grain as the framework's own `HttpApiDecodeError` (`{ _tag, message, issues[] }`), so domain errors and framework errors are consistent on the wire. The derived `HttpApiClient` decodes each `_tag` back to a real tagged instance — the frontend `switch`es on `_tag` with structured fields available (no parsing them out of `message`).

---

## 2. Domain error set

Three domain errors, defined as `Schema.TaggedError` in `@mamen/shared` (the contract package), each with a fixed HTTP status:

| Tag | Status | Fields | Raised when |
|---|---|---|---|
| **NotFound** | 404 | `resource: string`, `id: string \| number` | a row addressed by id/name/slug is missing (get, update, delete) |
| **Conflict** | 409 | `resource: string`, `message: string` | a uniqueness constraint is violated (e.g. duplicate `settings.key`, merchant name) |
| **InvalidFileType** | 415 | `allowed: string[]`, `received: string` | an upload's MIME type is not in the image allow-list |

Plus the framework error, implicit on every endpoint (see §4):

| Tag | Status | Source |
|---|---|---|
| **HttpApiDecodeError** | 400 | request body/params/query fail schema decode — HttpApi produces it automatically |

### Deliberately excluded

- **`Invalid id`** — gone. The new contract types `:id` path params as `Schema.NumberFromString` (or a branded id), so a non-numeric id fails **schema decode** → automatic `HttpApiDecodeError (400)`. No hand-written `Invalid id` error.
- **`ValidationError` (domain-rule failures)** — omitted. This map is a **faithful-but-clean port**; the current server enforces **no** referential/domain rules (zero DB foreign keys, deletes cascade nothing, no future-date guard). Adding a domain-rule error now would invent a contract for rules not yet enforced. Schema decode + the three domain errors cover everything the current surface actually produces. If a specific resource port later needs a rule that isn't a schema refinement, it graduates its own typed error then — not here.

---

## 3. SqlError mapping at the service boundary

`@effect/sql` operations fail with `SqlError` (carrying raw DB text — SQL, column names, sqlite internals). **`SqlError` never crosses the wire as itself.** It is caught at the service layer and split:

- **UNIQUE constraint violation → `Conflict (409)`.** The service inspects the `SqlError`, and if it is a constraint violation, `Effect.fail(new Conflict(...))`. This is the *only* place a `SqlError` becomes a typed wire error.
- **Everything else** (connection lost, disk full, malformed query = a bug) → **untyped defect / 500.** Not declared in the contract, no response body, no DB detail leaked. HttpApi renders it as a bare `500 InternalServerError` (exactly what `openapi.json` already shows for the health endpoint's 500 — a `500` description with no schema).

Rationale: leaking SQL text to the client is an info-disclosure smell and couples the wire to sqlite; the only client-actionable SQL failure is a constraint violation, which is already `Conflict`.

---

## 4. Schema-decode failures (validation)

**Accept the HttpApi default — no customization.** A request whose body/params/query fails schema decode returns **`HttpApiDecodeError` @ 400**, body `{ _tag, message, issues[] }` where `issues[]` gives per-field parse detail. This is strictly richer than today's bare `{ error: "Invalid id" }`, is already the framework grain (consistent with §1), and is the zero-config path.

`HttpApiDecodeError` is therefore a **de-facto member of every endpoint's error set** (any endpoint with a schema-typed input can return it). It is the framework's error, not one of the three domain errors — it is *not* declared per-endpoint (see §6), but the derived client sees it on every call.

Note on 400 vs 422: HttpApi uses **400** by default for decode failures. We keep 400 — the 400/422 distinction is not worth a per-endpoint override.

---

## 5. Success status conventions

Replaces today's inconsistency (single POST→201, bulk-add→201, bulk-put→200, all mutations `{ ok: true }`@200, deletes→200). Set per endpoint via `HttpApiEndpoint.setSuccess(Schema, { status })`.

| Operation | Status | Body |
|---|---|---|
| GET (read one / list) | **200** | the resource / resource array |
| POST create | **201** | the **created resource** (full, server-authoritative) |
| PUT/PATCH update | **200** | the **updated resource** (full) |
| DELETE | **204** | *no body* |
| Bulk create | **201** | **created resources** `[]` (with generated ids) |
| Bulk put / upsert | **200** | `{ count: number }` |
| Bulk delete | **200** | `{ count: number }` |
| Bulk get | **200** | resource array (endpoint stays `POST …/bulk-get`) |
| Action (export, reset, import) | **200** | the action result |

Key choices:

- **Mutations return the full affected resource.** Create → 201 + the created row (with autoincrement `id`, `createdAt`, applied defaults); update → 200 + the updated row. The frontend's tanstack-query layer primes its cache from the response instead of refetching. Costs nothing — the success schema is the resource already defined.
- **Delete → 204, no body.** REST-standard; the derived client handles empty responses cleanly. There is no `{ ok: true }` ack anymore.
- **Bulk-delete → 200 `{ count }`, NOT 204.** A bulk delete has a useful result (how many rows actually deleted — some ids may not exist); `{ count }` returns it. This deliberately breaks the "delete → 204" rule for the bulk case.
- **Bulk-put → 200 `{ count }`.** The client already holds the rows it sent; only the affected count is new information.
- **Bulk-get stays `POST`.** Semantically a read, but the id list goes in the body (a long `?ids=` query is worse). A conscious REST-purity exception, flagged.

---

## 6. Per-endpoint error-set discipline

**Tight.** Each endpoint declares (via `.addError(...)`) only the domain errors it can actually produce — the derived client's per-endpoint error channel is exactly that set, so the contract is self-documenting and the client's `switch` on `_tag` is exhaustive and minimal.

`HttpApiDecodeError (400)` and the untyped `500` are **framework-implicit on every endpoint** — not declared per-endpoint. Only the three domain errors get scoped.

### Mapping rule (the contract ticket applies this per endpoint)

| Endpoint shape | Declared domain errors |
|---|---|
| get by id / name / slug | `NotFound` |
| list / count | *(none — empty result, never 404)* |
| create | `Conflict` *(only if the resource has a uniqueness constraint)* |
| update | `NotFound` (+ `Conflict` if a unique field is mutable) |
| delete | `NotFound` |
| bulk create | `Conflict` *(if applicable)* |
| bulk put / delete / get | *(none)* |
| image upload (`POST /merchants/:id/image`) | `NotFound` + `InvalidFileType` |
| image delete (`DELETE /merchants/:id/image`) | `NotFound` |

### Behavior change from today (deliberate, flagged)

- **Update / delete on a missing id → `NotFound (404)`.** Today `PUT`/`DELETE :id` **never 404** — they return `{ ok: true }` regardless of existence (flagged as a quirk-to-drop in the inventory). The new contract makes them 404 on a missing row. This is a conscious improvement, not a faithful port of the old silent-ok. (With delete now 204-no-body, there is no "ok" signal to smuggle anyway.)

Everything else is a faithful port of the current surface with the inconsistencies (envelopes, status codes, NaN handling) normalized per this doc.

---

## What this unblocks

- **[Design the new REST contract](../issues/0006-design-new-rest-contract.md)** — builds directly on this. Every endpoint spec sets its success status + body per §5 and declares its domain errors per the §6 mapping rule; the three `Schema.TaggedError` types (§2) are defined in `@mamen/shared` alongside the contract.
- **Per-resource port tickets** (map fog) — each handler raises these typed errors and the service boundary applies the §3 SqlError rule.
