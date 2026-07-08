---
id: 5
title: Error taxonomy and status-code conventions
state: open
labels: [wayfinder:grilling]
assignee: none
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
