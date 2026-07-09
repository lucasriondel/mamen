---
id: 13
title: Port merchants (incl. image upload + /uploads static)
state: open
labels: [wayfinder:impl]
assignee: none
parent: 1
blocked-by: [10, 11]
---

## Question

Port the **merchants** resource end-to-end per [api-contract.md](../research/api-contract.md) §2.4, including the multipart image upload and the `/uploads/*` static route. Follows the [uploads research](0003-uploads-static-files-under-httpapi.md).

Endpoints: `list` (paged, `orderBy: "name"?`), `getById`, `getByName`, `getByNameCi`, `create`, `update`, `remove` (204, **now 404s** on missing + cascades image-file cleanup), `uploadImage` (multipart → 200 updated `Merchant`, errors `NotFound` + `InvalidFileType`), `deleteImage` (→ 200 updated `Merchant`, `NotFound`).

Upload mechanics (uploads research): `HttpApiSchema.Multipart` + `SingleFileSchema`; handler gets a scoped-temp `PersistedFile`; MIME allow-list (`jpeg/png/webp/gif`) → `InvalidFileType (415)`; size via `maxFileSize` (2 MiB). `imageUrl` stays a **root-relative `/uploads/merchants/…` path**. Static `/uploads/*` = wildcard route → `HttpServerResponse.file` in the same Bun router, **with the path-traversal guard**. No `Conflict` — merchant name has no unique constraint (faithful port).

Dropped: `PUT /merchants/bulk-put` (client-only).

## Acceptance criteria

- [ ] `MerchantsGroup` matches spec §2.4; all reads/writes through the SDK, tested.
- [ ] `uploadImage` accepts a multipart file, enforces the MIME allow-list (`InvalidFileType` on miss), writes to `uploads/merchants/`, returns the updated `Merchant` with root-relative `imageUrl`.
- [ ] `deleteImage` removes the file + clears `imageUrl`, returns updated `Merchant`.
- [ ] `/uploads/*` static route serves files with the path-traversal guard; OpenAPI emits the upload as binary.
- [ ] `remove` 404s on missing merchant and cascades image-file cleanup.
- [ ] Integration tests exercise upload (multipart FormData through the SDK), bad MIME, and static fetch; coverage gate passes.

## Blocked by

- [Shared contract foundations](0010-shared-contract-foundations.md) (#10)
- [Port accounts](0011-port-accounts.md) (#11) — reuses the test harness + coverage baseline.
