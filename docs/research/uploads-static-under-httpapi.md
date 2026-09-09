# Uploads & static files under HttpApi

Research asset for ticket [Uploads and static files under HttpApi](../issues/0003-uploads-static-files-under-httpapi.md) (map: [Effect API rework](../issues/0001-effect-api-rework.md)).

Verified against Effect source at `~/.effect` — `effect` 3.21.4, `@effect/platform` 0.96.2, `@effect/platform-bun` — the exact stack the [survey](effect-httpapi-stack-survey.md) locked in. All `file:line` refs below are into `~/.effect/packages/`.

---

## TL;DR / Recommendation

- **Multipart uploads are first-class in HttpApi.** Declare the payload with `HttpApiSchema.Multipart(Schema.Struct({ image: Multipart.SingleFileSchema }))`. The handler receives a `PersistedFile` — a file already written to a **scoped temp path on disk** (`payload.image.path`, `.name`, `.contentType`). Cleaned up automatically when the request scope closes.
- **Limits are options on the `Multipart(...)` combinator** — `maxFileSize`, `maxParts`, `maxTotalSize`, `maxFieldSize`, `fieldMimeTypes`. Our current `{ fileSize: 2 MiB, files: 1 }` maps to `maxFileSize: 2MB` + `maxParts: 1`.
- **No `size` field on `PersistedFile`** — if the contract needs to reject oversized files, `maxFileSize` enforces it at parse time (yields a typed `MultipartError` `reason: "FileTooLarge"`); otherwise `stat` the temp path.
- **MIME allow-list is NOT built into the file schema.** `fieldMimeTypes` only distinguishes fields-vs-files. Our jpeg/png/webp/gif allow-list must be enforced in the handler (or via a refinement on `contentType`) and surfaced as a domain error in the contract's error taxonomy.
- **The derived client sends `FormData`.** For a multipart endpoint, `HttpApiClient` types the request as `{ payload: FormData }` and calls `HttpClientRequest.bodyFormData`. The web caller builds `FormData`, appends the `File`, passes it as `payload` — no auto-`File`→`FormData` helper, but that's exactly what today's hand-rolled `fetch` already does.
- **OpenAPI emits `multipart/form-data`** with the file field as `{ type: "string", format: "binary" }` — the standard binary-upload representation. Scalar renders a file picker for it.
- **Static serving: no built-in directory helper.** Serve `/uploads/*` with a wildcard route mapping the path param to `HttpServerResponse.file(path)`. On bun this routes through `Bun.file` → zero-copy send + **automatic content-type from extension**; etag + last-modified are stamped automatically by the platform layer. Mount it into the **same** `HttpApiBuilder.Router` so one server serves both the API and `/uploads/`.

---

## 1. Current usage audit (what must be expressible)

The **only** upload/static consumer is merchant logos. Full inventory:

### Server (old `@mamen/server`, Fastify)
- `packages/server/src/app.ts:40-51` — registers `@fastify/multipart` with `limits: { fileSize: 2_097_152, files: 1 }` (2 MiB, one file) and `@fastify/static` serving `uploadsDir` at prefix `/uploads/`.
- `packages/server/src/plugins/static-files.ts` — a **separate** static plugin that serves the built **web SPA** with a not-found → `index.html` fallback. This is web-app hosting, **out of scope for this ticket** (it's about serving the SPA, not uploads); noted so the contract/cutover ticket knows the server currently plays two static roles.
- `packages/server/src/lib/uploads.ts` — `UPLOADS_DIR` (resolves to `packages/server/uploads`), `ensureUploadsDir` (creates `uploads/merchants/`), `deleteUpload` (unlink, swallow errors).
- `packages/server/src/routes/merchants.ts`:
  - `POST /api/merchants/:id/image` (`:113-150`) — the upload handler. Validates id → 400; merchant exists → 404; `request.file()`; MIME allow-list (`image/jpeg|png|webp|gif`) → 400; filename `merchant-{id}-{Date.now()}.{ext}`; `writeFileSync` into `uploads/merchants/`; deletes the old file if `merchant.imageUrl` set; persists `imageUrl = /uploads/merchants/{filename}`; **returns `{ imageUrl }`**.
  - `DELETE /api/merchants/:id/image` (`:152-175`) — id → 400/404; deletes the file (strips `/uploads/` prefix to get the on-disk path); clears `imageUrl`; returns `{ ok: true }`.
  - MIME→ext map (`:13-18`): jpeg→jpg, png→png, webp→webp, gif→gif.

### Client (old `@mamen/api`, plain fetch)
- `packages/api/src/merchants.ts:33-62`:
  - `uploadImage(id, file: File): Promise<{ imageUrl: string }>` — builds `FormData`, appends under key **`"image"`**, `fetch(POST /api/merchants/{id}/image)`, parses `{ error }` bodies into an `ApiError(status, message)`.
  - `deleteImage(id): Promise<void>` — `DELETE /merchants/{id}/image`.
- `packages/api/src/query/merchants.ts:44-51` — tanstack mutations `uploadImage` / `deleteImage` wrapping the above.

### Web
- `packages/web/src/features/merchants/components/EditMerchantModal/index.tsx:91,93` — the only call site; on save, `uploadImage(id, file)` or `deleteImage(id)`.
- `packages/web/src/components/MerchantAvatar/index.tsx:51-54` — renders `<img src={imageUrl}>` using the **raw relative path** `/uploads/merchants/…` (no base-URL join). Consumed all over merchants + transactions tables.
- `packages/web/vite.config.ts:22-24` — dev proxy: `/api` and `/uploads` → `http://localhost:3000`. In prod the same server serves SPA + uploads, so same-origin.

**Constraints the new contract must honor:**
1. `imageUrl` stays a **root-relative path** (`/uploads/merchants/…`) — the web consumes it raw as an `<img src>`, and both dev proxy and prod same-origin depend on that shape. The server must keep serving files at `/uploads/`.
2. Upload endpoint returns **`{ imageUrl }`**; delete returns success.
3. The file field key can be renamed (contract is redesigned freely) — but the SDK and web must agree; `image` is the incumbent.
4. Error cases to model in the contract's [error taxonomy](../issues/0005-error-taxonomy-status-conventions.md): merchant-not-found (404), bad file type (was 400), no file / too large. Old handler also had an explicit invalid-id 400 — likely subsumed by path-param schema validation in the new stack.

---

## 2. Multipart uploads in HttpApi

### Declaring the endpoint

`HttpApiSchema.Multipart(schema, options?)` brands a schema so the framework decodes the request as `multipart/form-data` (`HttpApiSchema.ts:422`). Set it as the endpoint payload via `.setPayload(...)` (`HttpApiEndpoint.ts:134`; its JSDoc explicitly documents multipart uploads at `:131`). `ValidatePayload` restricts payloads to body methods (POST/PUT/PATCH) — fine, upload is POST.

```ts
// contract (packages/shared)
import { HttpApiEndpoint, HttpApiSchema, Multipart } from "@effect/platform"
import { Schema } from "effect"

const UploadMerchantImage = HttpApiEndpoint.post("uploadImage", "/merchants/:id/image")
  .setPath(Schema.Struct({ id: Schema.NumberFromString }))
  .setPayload(
    HttpApiSchema.Multipart(
      Schema.Struct({ image: Multipart.SingleFileSchema }),
      { maxFileSize: Option.some(FileSystem.Size(2 * 1024 * 1024)), maxParts: Option.some(1) },
    ),
  )
  .addSuccess(Schema.Struct({ imageUrl: Schema.String }))
  // .addError(...) — MerchantNotFound, InvalidFileType, FileTooLarge per error-taxonomy ticket
```

### File-field schemas (`~/.effect/packages/platform/src/Multipart.ts`)
- `FileSchema: Schema.Schema<PersistedFile>` (`:166`) — one file; OpenAPI JSON-schema `{ type: "string", format: "binary" }` (`:169-172`).
- `FilesSchema = Schema.Array(FileSchema)` (`:179`) — multiple files under one key.
- `SingleFileSchema` (`:185`) — `FilesSchema.itemsCount(1)` transformed to a single `PersistedFile`. **Use this** — matches our `files: 1`.

### What the handler receives — `PersistedFile` (`Multipart.ts:104-110`)
```ts
interface PersistedFile extends Part.Proto {
  readonly _tag: "PersistedFile"
  readonly key: string          // form field name ("image")
  readonly name: string         // original client filename
  readonly contentType: string  // e.g. "image/png"
  readonly path: string         // TEMP path on disk, already written
}
```
With `Multipart` (non-stream), each file is persisted before the handler runs: `toPersisted` (`Multipart.ts:512`) makes a **scoped temp directory** (`fs.makeTempDirectoryScoped()`, `:519`) and writes each file to `join(dir, basename(name).slice(-128))` (`:535`). On bun the write goes through `Bun.file(path).writer()` (`platform-bun/src/internal/multipart.ts:30-52`). **Scoped ⇒ auto-cleaned when the request scope closes** — no manual temp cleanup.

Handler shape:
```ts
Effect.gen(function* () {
  const { id } = path
  const { image } = payload            // image: PersistedFile
  // move image.path -> uploads/merchants/merchant-{id}-{ts}.{ext}, persist imageUrl, delete old file
})
```
Move the temp file to permanent storage with `FileSystem.FileSystem` (`fs.rename` / `fs.copy` + the source is auto-cleaned) rather than reading the whole buffer — cleaner than today's `writeFileSync(data.toBuffer())`.

> **Flag:** `PersistedFile` has **no `size`** field (nor does the streaming `File`, `Multipart.ts:85-92`). Enforce max size via the `maxFileSize` limit (below); if a post-hoc size is needed, `stat` the temp path.

### Streaming variant (not needed here)
`HttpApiSchema.MultipartStream` (`:461`) gives the handler a live `Stream.Stream<Part, MultipartError>` instead of persisted paths (`HttpApiEndpoint.ts:409`). For a 2 MiB logo, persisted `Multipart` is simpler — recommended.

---

## 3. Size / count limits (`Multipart.ts`)

Options on the `Multipart(...)` combinator (same object as `withLimits.Options`, `Multipart.ts:682-688`):

| Option | Type | Default (`~/.effect`) | Maps to today |
| --- | --- | --- | --- |
| `maxFileSize` | `Option<SizeInput>` | `none` (unbounded) — `:737` | **`fileSize: 2_097_152`** ⇒ `Option.some(2 MiB)` |
| `maxParts` | `Option<number>` | `none` — `:695` | **`files: 1`** ⇒ `Option.some(1)` |
| `maxTotalSize` | `Option<SizeInput>` | `none` (→ `IncomingMessage.MaxBodySize`, `:632`) | optional cap |
| `maxFieldSize` | `SizeInput` | 10 MiB — `:716` | n/a (no large text fields) |
| `fieldMimeTypes` | `readonly string[]` | `["application/json"]` — `:762` | fields-vs-files split only |

Limit breaches yield a typed `MultipartError` (`Multipart.ts:145`) — `Schema.TaggedError`, `reason` ∈ `"FileTooLarge" | "FieldTooLarge" | "BodyTooLarge" | "TooManyParts" | "InternalError" | "Parse"`. The contract's error taxonomy should map `FileTooLarge`/`TooManyParts` → 413/400.

> **MIME allow-list ≠ `fieldMimeTypes`.** `fieldMimeTypes` only decides which parts count as fields vs files (`makeConfig`, `Multipart.ts:247-266`). The jpeg/png/webp/gif allow-list is **not** enforceable by the combinator — do it in the handler (check `image.contentType`, fail with a domain `InvalidFileType` error) or as a `Schema.filter` refinement on the file's `contentType`. This is real work the contract + handler own; flag it for the contract ticket.

---

## 4. OpenAPI + derived client

### OpenAPI
Multipart payloads key the request body under `"multipart/form-data"` (`HttpApi.ts:412-414`), rendered into `requestBody.content` by `OpenApi.ts:403-410` (`"multipart/form-data"` is an allowed content-type, `:620`). The file field appears as `{ type: "string", format: "binary" }` — the standard OpenAPI upload shape, so **Scalar shows a file picker** and the committed `openapi.json` describes the upload correctly. No extra work for the [OpenAPI emit ticket](../issues/0009-openapi-emit-script.md).

### Derived `HttpApiClient` — YES, it uploads
For a multipart endpoint the client request type is `{ readonly payload: FormData }` (`HttpApiEndpoint.ts:446-450`), and the client encodes it via `HttpClientRequest.bodyFormData` (`HttpApiClient.ts:208-209`). So the SDK call is:
```ts
const fd = new FormData()
fd.append("image", file)                 // File | Blob
yield* client.merchants.uploadImage({ path: { id }, payload: fd })
```
This is **exactly** today's hand-rolled shape — the SDK subsumes `packages/api/src/merchants.ts:33-58` and gives typed errors for free.

> **Flag:** no helper auto-converts a `File`/`Blob`/struct into `FormData` (`HttpApiClient.ts`) — the caller builds `FormData`. The [SDK tanstack-query layer](../issues/0001-effect-api-rework.md#not-yet-specified) should expose an `uploadImage(id, file)` mutation that constructs the `FormData` internally so web callers don't touch it (mirrors today's `uploadImage`).

---

## 5. Static file serving (`/uploads/`)

### `HttpServerResponse.file` (`HttpServerResponse.ts:190-193`)
```ts
file(path: string, options?: Options & FileSystem.StreamOptions):
  Effect<HttpServerResponse, PlatformError, Platform.HttpPlatform>
```
`Options` (`:51-58`): `status`, `headers`, `contentType`, `contentLength`, …; `StreamOptions` adds `offset`/`bytesToRead` (range support).

- **etag + last-modified: automatic.** The platform layer `stat`s the file, sets `etag` (`internal/httpPlatform.ts:52-56`) and `last-modified` from `mtime` (`:57-59`). Needs an `Etag.Generator` in context — provided by the standard platform layer.
- **content-type on bun: automatic.** `platform-bun/src/internal/httpPlatform.ts:8-19` routes through `Bun.file(path)` (`ServerResponse.raw`), which infers MIME from the extension and gives a zero-copy send. (The generic Node layer does *not* auto-detect — but we're on bun.)

> **Flag:** **no built-in `serveStatic`/directory helper** in `@effect/platform` or `@effect/platform-bun`. Serve a directory with a wildcard route + `HttpServerResponse.file`.

### Coexisting with the HttpApi app on one server
`HttpApiBuilder.Router` **is** an `HttpRouter.Tag` (`HttpApiBuilder.ts:51`). Add raw routes into the same router via `HttpApiBuilder.Router.use` (`HttpRouter.ts:145`), so the static route and the API share one server:

```ts
const StaticUploadsLive = HttpApiBuilder.Router.use((router) =>
  router.get(
    "/uploads/*",
    Effect.gen(function* () {
      const { params } = yield* HttpRouter.RouteContext          // HttpRouter.ts:239
      // guard against path traversal on params["*"] before joining
      return yield* HttpServerResponse.file(`${UPLOADS_DIR}/${params["*"]}`)
    }),
  ),
)
// compose with HttpApiBuilder.serve() via Layer.provide([StaticUploadsLive, ApiLive, ...])
```

Alternatives for raw routers (no HttpApi): `HttpRouter.mount(self, "/uploads", subRouter)` (`HttpRouter.ts:434`) / `HttpRouter.mountApp(self, "/uploads", app)` (`:443`). For our single-server setup, `HttpApiBuilder.Router.use` is the cleanest.

> **Security:** the current `@fastify/static` sanitizes traversal for us; the wildcard route must reject `..` / absolute paths in `params["*"]` before joining to `UPLOADS_DIR`. Call this out for the merchants port ticket.

### Bun static helper
None beyond `BunHttpPlatform` routing `HttpServerResponse.file`/`fileWeb` through `Bun.file` (`platform-bun/src/internal/httpPlatform.ts:8-19`). `BunHttpServer` has no static helpers. The wildcard-route + `HttpServerResponse.file` pattern already gets bun's zero-copy + auto-MIME.

---

## What this unblocks

- **[Design the new REST contract](../issues/0006-design-new-rest-contract.md)** — can now express the upload endpoint (`Multipart` payload, `SingleFileSchema`, `{ imageUrl }` success) and knows the MIME allow-list must live in the handler/refinement + error taxonomy, not the combinator.
- **Merchants per-resource port** (future fog ticket) — has the persisted-file handler pattern, the temp→permanent move, the `/uploads/*` static route, and the traversal-guard note.
- **[SDK tanstack-query layer](../issues/0001-effect-api-rework.md)** — knows the client takes `FormData`; should wrap it in an `uploadImage(id, file)` mutation.
- **[OpenAPI emit](../issues/0009-openapi-emit-script.md)** — multipart renders correctly, no special handling.
