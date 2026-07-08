---
id: 3
title: Uploads and static files under HttpApi
state: open
labels: [wayfinder:research]
assignee: none
parent: 1
blocked-by: []
---

## Question

The current Fastify server uses `@fastify/multipart` (2MB, single file) for uploads and `@fastify/static` to serve `/uploads/`. How do file uploads and static file serving work under Effect HttpApi on `@effect/platform-bun`?

Produce a markdown summary (linked asset under `docs/research/`) covering:

- **Multipart uploads in HttpApi**: `HttpApiSchema.Multipart` (or current equivalent) — declaring a file-upload endpoint in the contract, size/count limits, how the file lands in the handler (temp path? stream?), how it appears in the OpenAPI spec and in the derived client (can the typed client upload a file?).
- **Static file serving**: serving a directory (`/uploads/`) — `HttpRouter` file responses, etag/caching behavior, and how a static route coexists with an HttpApi-defined API on one server.
- **Current usage audit**: find every upload/static consumer in this repo (`packages/server/src/lib/uploads.ts`, routes using multipart, web references to `/uploads/`) so the contract ticket knows exactly what must be expressible.
- Recommendation: what the upload endpoint and static serving should look like in the new stack.

Consult the `/effect-ts` skill; verify against current official docs.
