# CategoryPicker Improvements Plan

## Context

The CategoryPicker currently has three limitations:
1. **Search only works on the current view** — if you're on the parent list, typing "Groceries" finds nothing because subcategories aren't rendered
2. **Add Category modal has no parent selector** — `parentId` is fixed by context (determined by which button the user clicked), not changeable within the modal
3. **No way to create categories from search** — when search yields no results, it's a dead end

---

## Feature 1: Search shows nested categories ✅

**File:** `packages/web/src/components/CategoryPicker/index.tsx`

When the user types in the search box (and no parent is selected), switch from showing only parent categories to showing **all categories in a flat grouped list** — exactly like `QuickCategoryPicker` already does.

### Changes

1. Pull `categoriesWithSubs` from `useCategories()` (line 28)

2. Derive `const isSearching = search.length > 0 && !selectedParent`

3. Add a third rendering branch in the JSX (currently two branches at lines 80-131). The new structure:
   - `selectedParent` → existing subcategory drill-down (unchanged)
   - `isSearching` → flat grouped list (new, mirrors `QuickCategoryPicker` pattern)
   - default → existing parent list (unchanged)

4. The flat search view renders `categoriesWithSubs.map(parent => ...)` with:
   - Each parent as a `CommandGroup` with heading
   - Parent itself as a `CommandItem` with `value="{parent.name} (general)"`
   - Each subcategory as a `CommandItem` with `value="{parent.name} {sub.name}"` (enables cmdk matching)
   - Clicking a parent in search mode calls `onSelect(parent.id!)` directly (not drill-down)
   - Clicking a subcategory calls `onSelect(parent.id!, sub.id!)` directly

### Test updates (`CategoryPicker.test.tsx`)

- Update "filters categories by search" test (line 53): after typing "shop", the flat search view is shown — Shopping parent + its subcategories should appear. "Dining" should still NOT appear.
- Add test: typing "Groceries" shows subcategory results from parent view
- Update "shows no results" test (line 69): will be updated in Feature 3

---

## Feature 2: Parent category selector in Add Category modal ✅

**File:** `packages/web/src/features/categories/components/CategoryFormModal/index.tsx`

Add a "Parent category" field using Popover + CategoryPicker (same pattern as `MerchantAssignmentModal` lines 1022-1056).

### Changes

1. Add imports: `useState`, `ChevronDown`, `CategoryPicker`, `Popover`/`PopoverContent`/`PopoverTrigger`, `useCategories`

2. Add state: `selectedParentId` (initialized from `parentId` prop), `parentPickerOpen`

3. Sync `selectedParentId` with prop in the existing `useEffect` (on mode/parentId change)

4. Add the parent selector field between Name and Color/Icon fields (only in create mode):
   - Button trigger shows selected parent name + color dot, or "Root level (no parent)"
   - Popover contains `CategoryPicker` with `allowSubcategory={false}` and `allowCreate={false}`
   - "Remove parent" link to reset to root level

5. Update `handleSubmit` to use `selectedParentId` instead of the `parentId` prop

6. Add `defaultName?: string` prop — used in the create mode `useEffect` to pre-fill the name field (needed by Feature 3)

7. Update dialog description to use `selectedParentId` instead of prop

### No caller changes needed
`CategoriesPage` still passes `parentId` as before — it just becomes the initial value now.

---

## Feature 3: "Create category" option on empty search ✅

**Files:** `packages/web/src/components/CategoryPicker/index.tsx`, `packages/web/src/features/categories/components/CategoryFormModal/index.tsx`

### Changes to CategoryPicker

1. Add `allowCreate?: boolean` prop (defaults to `true`)

2. Add state: `createModalOpen`

3. Import `useCategoryMutations` and `CategoryFormModal`

4. Replace `<CommandEmpty>` content: when `allowCreate` and `search.trim()` is non-empty, show a clickable "Create '{search}'" button with a Plus icon. Otherwise show the existing "No categories found." text.

5. Render `CategoryFormModal` at the end (outside `<Command>`, wrapped in fragment):
   - `mode="create"`
   - `parentId={selectedParent?.id ?? null}` (if user was browsing a parent's subcategories)
   - `defaultName={search.trim()}`
   - `onCreate` handler: calls `createCategory`, then `onSelect` with the new ID, resets search

6. **Circular dependency prevention**: CategoryFormModal's internal CategoryPicker (Feature 2) must use `allowCreate={false}` to prevent infinite nesting.

### Changes to CategoryFormModal (in addition to Feature 2)

- `defaultName` prop already added in Feature 2
- The `useEffect` reset uses `defaultName ?? ""` for the name field

### Test updates

- Update "shows no results" test: expect a "Create" button instead of plain text when `allowCreate` is true
- Add test: clicking "Create" opens the form modal

---

## Implementation Order

1. **Feature 1** — search shows nested (foundational, changes rendering logic)
2. **Feature 2** — parent selector + `defaultName` in modal
3. **Feature 3** — create on empty search (depends on both above)

## Files to modify

| File | Features |
|------|----------|
| `packages/web/src/components/CategoryPicker/index.tsx` | 1, 3 |
| `packages/web/src/features/categories/components/CategoryFormModal/index.tsx` | 2, 3 |
| `packages/web/src/components/CategoryPicker/CategoryPicker.test.tsx` | 1, 3 |

## Reference files (patterns to follow)

- `packages/web/src/features/transactions/components/QuickCategoryPicker/index.tsx` — flat grouped list pattern for Feature 1
- `packages/web/src/features/merchants/components/MerchantAssignmentModal/index.tsx` (lines 1022-1056) — Popover + CategoryPicker pattern for Feature 2

## Verification

1. Open the app, go to a view with the CategoryPicker (e.g., merchant assignment)
2. Type a subcategory name (e.g., "Groceries") in the search — it should appear with its parent shown
3. Open the Add Category modal — verify the parent selector field shows and is changeable
4. Search for a non-existent category — verify "Create" option appears, clicking it opens the modal pre-filled
5. Run existing tests: `npx vitest run packages/web/src/components/CategoryPicker/CategoryPicker.test.tsx`
