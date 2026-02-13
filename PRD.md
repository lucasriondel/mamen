# Plan: Remove frontend seed module — seeding belongs in the backend only

## Status: COMPLETE

## Context

The backend already seeds default categories on server startup in `getConnection()` (`packages/server/src/lib/repository/adapters/sqlite/connection.ts:13`). The frontend has a duplicate `seedCategories()` function in `packages/web/src/lib/seeds/categories.ts` with the same `DEFAULT_CATEGORIES` data. This frontend function is **never called in production** — only in test files as a convenience to populate the in-memory test DB. Even so, having seed data defined in the frontend is misleading. Test files should use local inline helpers with minimal test data instead.

## Changes

### 1. Delete the frontend seed module ✅
- **Deleted** `packages/web/src/lib/seeds/categories.ts`
- **Deleted** `packages/web/src/lib/seeds/categories.test.ts`
- **Removed** the `packages/web/src/lib/seeds/` directory

### 2. Update 3 test files that import from `@/lib/seeds/categories` ✅

Each currently does `import { seedCategories } from "@/lib/seeds/categories"` and calls it in `beforeEach`. Replace with a local `seedCategories` helper that creates categories directly via `db.categories.add()` (the in-memory test DB). Keep the same category names/structure these tests rely on.

**a) `packages/web/src/components/CategoryPicker/CategoryPicker.test.tsx`** ✅
- Tests check for all 10 parent category names, subcategories of Shopping, search/filter, navigation
- Replaced import with a local helper that creates 10 parents + their subcategories using `db.categories.add()`

**b) `packages/web/src/components/CategoryBadge/CategoryBadge.test.tsx`** ✅
- Tests only need Shopping (parent) + Groceries (subcategory)
- Replaced with a minimal local helper creating just Shopping + Groceries via `db.categories.add()`

**c) `packages/web/src/hooks/useCategories.test.ts`** ✅
- Tests check: total count, 10 parents, Shopping has 5 subs, Dining has 4 subs
- Replaced with a local helper creating the full category tree via `db.categories.add()`

### 3. No other files affected ✅
- Other test files (e.g. `batchCategoryAssign.test.ts`, `QuickCategoryPicker.test.tsx`) already define their own local `seedCategories` — no changes needed
- The frontend `DEFAULT_` constants for UI defaults (colors, icons, display prefs) are runtime fallbacks, not DB seeding — no changes needed

## Key files
- `packages/server/src/lib/repository/adapters/sqlite/seeds/categories.ts` — the authoritative seed (no changes)
- `packages/server/src/lib/repository/adapters/sqlite/connection.ts:13` — where backend seeding is called (no changes)
- `packages/web/src/lib/db/index.ts` — in-memory test DB (no changes)
- `packages/web/src/test/api-mock-setup.ts` — mocks `categoriesApi` to use in-memory DB (no changes)

## Verification
- `bun run test` in packages/web — all 24 affected tests pass (7 CategoryBadge + 11 CategoryPicker + 6 useCategories)
- `grep -r "seeds/categories" packages/web/src/` — no results
- `tsc --noEmit` — no type errors
