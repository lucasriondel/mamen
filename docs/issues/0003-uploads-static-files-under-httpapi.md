---
id: 3
title: Uploads and static files under HttpApi
state: closed
labels: [wayfinder:research]
assignee: luriondel
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

## Resolution

Both fully supported on the stable 3.21.4 / platform 0.96.2 stack the [survey](../research/effect-httpapi-stack-survey.md) locked in. Verified against Effect source at `~/.effect`. Full summary: **[docs/research/uploads-static-under-httpapi.md](../research/uploads-static-under-httpapi.md)**.

Key findings:

- **Multipart uploads are first-class.** Declare the payload with `HttpApiSchema.Multipart(Schema.Struct({ image: Multipart.SingleFileSchema }), { maxFileSize, maxParts })`. Handler gets a `PersistedFile` — file already written to a **scoped temp path** (`.path`/`.name`/`.contentType`), auto-cleaned when the request scope closes. Move it to permanent storage via `FileSystem`. Our `{ fileSize: 2 MiB, files: 1 }` → `maxFileSize: 2MB` + `maxParts: 1`; breaches yield a typed `MultipartError`.
- **Two things the combinator does NOT do**, flagged for the contract ticket: `PersistedFile` has **no `size`** field (rely on `maxFileSize`), and the **jpeg/png/webp/gif MIME allow-list is not a combinator feature** — enforce in the handler / as a `contentType` refinement + a domain `InvalidFileType` error.
- **Derived client uploads.** For a multipart endpoint `HttpApiClient` types the payload as `FormData` and sends it via `bodyFormData` — exactly today's hand-rolled shape. OpenAPI emits `multipart/form-data` with `{ type: "string", format: "binary" }`, so Scalar renders a file picker; no special OpenAPI handling.
- **Static serving: no built-in directory helper.** Serve `/uploads/*` with a wildcard route → `HttpServerResponse.file(path)`, mounted into the **same** `HttpApiBuilder.Router` (it *is* an `HttpRouter.Tag`). On bun this routes through `Bun.file` → zero-copy + **auto content-type**; etag + last-modified stamped automatically. **Must add a path-traversal guard** on the wildcard param (fastify-static did this for us).
- **Current usage audit:** the sole consumer is **merchant logos**. `POST/DELETE /api/issuers/:id/image` (returns `{ imageUrl }` / `{ ok }`), `imageUrl` is a **root-relative `/uploads/issuers/…` path** the web renders raw as `<img src>` (dev proxy + prod same-origin depend on this — the new server must keep serving `/uploads/`). Separately, old `@mamen/server` also statically serves the **web SPA** with an `index.html` fallback (`plugins/static-files.ts`) — that's SPA hosting, out of scope here, noted for the cutover ticket.

No new tickets surfaced — the answer feeds existing frontier/fog tickets (contract design, merchants port, SDK layer, OpenAPI emit). See "What this unblocks" in the asset.
