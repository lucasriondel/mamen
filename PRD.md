# Merchant Pictures - Implementation Plan

## Context

Merchants currently have no visual representation. Adding pictures to merchants will make the transaction list, merchant list, and merchant detail page more visually scannable. Images are stored on the local filesystem with paths in SQLite. A first-letter colored avatar serves as fallback.

## Phase 1: Shared Types & Schema ✅

**`packages/shared/src/types/merchant.types.ts`** — Add `imageUrl?: string` to the `Merchant` type. ✅

**`packages/shared/src/schemas/merchant.schema.ts`** — Add `imageUrl: z.string().optional()` to `merchantSchema`. Add `imageUrl` to the `createMerchantSchema.omit()` fields. ✅

## Phase 2: Database & Adapter ✅

**`packages/server/src/lib/repository/adapters/sqlite/migrations/001-initial-schema.ts`** — After the existing `db.exec(...)`, add a safe `ALTER TABLE merchants ADD COLUMN imageUrl TEXT` wrapped in try/catch (SQLite errors if column already exists). ✅

**`packages/server/src/lib/repository/adapters/sqlite/merchant.adapter.ts`**: ✅
- Add `imageUrl: string | null` to `MerchantRow` ✅
- Add `imageUrl: row.imageUrl ?? undefined` to `toEntity()` ✅
- Add `imageUrl` to INSERT in `add()`, `bulkAdd()`, `bulkPut()` ✅
- Add `imageUrl` change handler in `update()` ✅

## Phase 3: Backend Upload Infrastructure ✅

**Install dependency**: `bun add @fastify/multipart` in `packages/server/` ✅

**Create `packages/server/src/lib/uploads.ts`** (new file): ✅
- `UPLOADS_DIR` = `path.join(import.meta.dir, "../../uploads")` ✅
- `ensureUploadsDir()` — creates `uploads/merchants/` if missing ✅
- `deleteUpload(filepath)` — safely removes a file ✅

**`packages/server/src/app.ts`**: ✅
- Register `@fastify/multipart` with `{ limits: { fileSize: 2_097_152, files: 1 } }` ✅
- Call `ensureUploadsDir()` during app build ✅
- Register second `@fastify/static` for uploads: `{ root: UPLOADS_DIR, prefix: "/uploads/", decorateReply: false }` ✅

**`packages/server/src/routes/merchants.ts`** — Add two new routes: ✅
- `POST /merchants/:id/image` — Accepts multipart file, validates MIME type (jpeg/png/webp/gif), generates filename `merchant-{id}-{timestamp}.{ext}`, writes to `uploads/merchants/`, deletes old image if exists, updates DB `imageUrl`, returns `{ imageUrl }` ✅
- `DELETE /merchants/:id/image` — Deletes file from disk, sets `imageUrl` to null in DB ✅
- Modify existing `DELETE /merchants/:id` — Clean up image file before deleting merchant ✅

## Phase 4: Frontend API Client ✅

**`packages/web/src/lib/api/merchants.ts`**: ✅
- Add `uploadImage(id: number, file: File): Promise<{ imageUrl: string }>` — uses raw `fetch()` with `FormData` (not the JSON-only `api` helper) ✅
- Add `deleteImage(id: number): Promise<void>` — uses `api.delete()` ✅

## Phase 5: MerchantAvatar Component ✅

**Create `packages/web/src/components/MerchantAvatar/index.tsx`** (new file): ✅
- Props: `name`, `imageUrl?`, `size?: "sm" | "md" | "lg"`, `className?` ✅
- Sizes: `sm` = 24px, `md` = 32px, `lg` = 48px ✅
- With image: `<img>` with `rounded-full object-cover` ✅
- Without image: colored circle with first letter, color derived from hash of full name (16-color palette) ✅

## Phase 6: Frontend Integration ✅

**`packages/web/src/features/transactions/components/TransactionDataTable/columns.tsx`**: ✅
- Replace `getMerchantCreatedAt` with `getMerchantInfo` returning `{ name?: string; imageUrl?: string; createdAt?: Date }` ✅
- Render `<MerchantAvatar size="sm">` before `rawMerchantString` in the Description column ✅

**`packages/web/src/features/transactions/components/TransactionDataTable/index.tsx`**: ✅
- Change merchant map from `Map<number, Date>` to `Map<number, { name: string; imageUrl?: string; createdAt: Date }>` ✅
- Rename `getMerchantCreatedAt` → `getMerchantInfo` ✅

**`packages/web/src/features/merchants/hooks/useMerchantsList.ts`**: ✅
- Add `imageUrl?: string` to `MerchantListItem` type ✅
- Pass `imageUrl: merchant.imageUrl` in the mapping ✅

**`packages/web/src/features/merchants/components/MerchantListItem/index.tsx`**: ✅
- Add `<MerchantAvatar name={merchant.name} imageUrl={merchant.imageUrl} size="sm" />` before the name span ✅

**`packages/web/src/features/merchants/components/MerchantHeader/index.tsx`**: ✅
- Add `imageUrl` to props ✅
- Render `<MerchantAvatar size="lg">` next to the merchant name ✅

**`packages/web/src/features/merchants/components/MerchantDetailPage/index.tsx`**: ✅
- Pass `imageUrl={merchant.imageUrl}` to `<MerchantHeader>` ✅
- Pass `currentImageUrl={merchant.imageUrl}` to `<EditMerchantModal>` ✅

**`packages/web/src/features/merchants/components/EditMerchantModal/index.tsx`**: ✅
- Add `currentImageUrl` prop ✅
- Add state: `imageFile`, `imagePreview`, `removeImage` ✅
- Add image picker UI: clickable avatar preview with camera overlay, hidden file input, remove button ✅
- On save: call `uploadImage()` / `deleteImage()` before the metadata update ✅

## Phase 7: Housekeeping

**`.gitignore`** — Add `uploads/` line.

**`packages/web/vite.config.ts`** — Add `"/uploads": "http://localhost:3000"` to the proxy config (dev mode needs to forward upload requests to the backend).

## Verification

1. Start dev server, open EditMerchantModal, upload an image → verify it appears in the modal preview
2. Save → verify the image appears in the merchant detail header, merchant list, and transaction list
3. Edit merchant again, remove image → verify fallback letter avatar shows everywhere
4. Delete a merchant that has an image → verify the file is cleaned from `uploads/`
5. Run `bun run typecheck` in all packages to confirm no type errors
6. Run existing tests to confirm no regressions
