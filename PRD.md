# Category Management Page

## Context

The app currently has categories with a 2-level hierarchy (parent + subcategory) used for transaction classification. There's no UI to manage them — categories come from seed data only. This plan adds a `/categories` page with a tree view supporting unlimited nesting, inline editing, adding, deleting, reordering, and color/icon customization.

## New Files

| File                                                                | Purpose                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/routes/categories.tsx`                                         | Route file (thin, delegates to CategoriesPage)                                    |
| `src/features/categories/components/CategoriesPage/index.tsx`       | Main page — state management, modals, layout                                      |
| `src/features/categories/components/CategoryTree/index.tsx`         | Renders root-level tree nodes                                                     |
| `src/features/categories/components/CategoryTreeNode/index.tsx`     | Recursive node: row with expand/collapse, color dot, icon, name, actions dropdown |
| `src/features/categories/components/CategoryFormModal/index.tsx`    | Create/Edit modal (react-hook-form + zod)                                         |
| `src/features/categories/components/DeleteCategoryDialog/index.tsx` | AlertDialog confirmation — cascade deletes all descendants                        |
| `src/features/categories/components/ColorPicker/index.tsx`          | Popover with predefined color palette grid                                        |
| `src/features/categories/components/IconPicker/index.tsx`           | Popover with curated lucide icon grid                                             |
| `src/features/categories/hooks/useCategoryTree.ts`                  | Builds recursive `CategoryTreeNode[]` from flat DB query                          |
| `src/features/categories/hooks/useCategoryMutations.ts`             | CRUD: create, update, delete (cascade), reorder                                   |
| `src/features/categories/lib/constants.ts`                          | Color palette array, icon list, icon name → component map                         |
| `src/features/categories/index.ts`                                  | Barrel export                                                                     |

## Modified Files

| File                                 | Change                                               |
| ------------------------------------ | ---------------------------------------------------- |
| `src/types/category.types.ts`        | Add `CategoryTreeNode` type (recursive children)     |
| `src/types/index.ts`                 | Export `CategoryTreeNode`                            |
| `src/lib/schemas/category.schema.ts` | Add `updateCategorySchema` (name, color, icon)       |
| `src/lib/schemas/index.ts`           | Export `updateCategorySchema`                        |
| `src/components/Layout/Sidebar.tsx`  | Add Categories nav item (Tag icon), after Rules      |
| `src/hooks/useBreadcrumbs.ts`        | Add `'/categories': 'Categories'` to `routeLabelMap` |

## Implementation Details

### 1. Type: `CategoryTreeNode`

```typescript
export type CategoryTreeNode = Category & { children: CategoryTreeNode[] };
```

### 2. `useCategoryTree` hook

- Uses `useLiveQuery(() => db.categories.orderBy('sortOrder').toArray())`
- Groups by `parentId` into a Map, builds tree recursively in O(n)
- Returns `{ tree: CategoryTreeNode[], allCategories: Category[], isLoading: boolean }`

### 3. `useCategoryMutations` hook

- **create**: Auto-generates slug from name (prefixed with parent slug if nested), auto-sets `sortOrder` as `max(siblings) + 1`, sets `createdAt`
- **update**: Updates name, color, icon via `db.categories.update(id, {...})`
- **delete (cascade)**: Collects all descendants recursively, deletes in a single Dexie transaction, returns snapshot for undo
- **reorder**: Swaps `sortOrder` with adjacent sibling (move up/down)

### 4. `CategoryTreeNode` component (recursive)

Each row layout:

```
[indent] [▶ chevron] [● color] [icon] Name  [child count]  [⋯ actions]
```

- Indent: `paddingLeft: depth * 24 + 8`
- Chevron: only shown if has children, rotates 90° when expanded
- Actions via `DropdownMenu`: Add Subcategory, Edit, Move Up, Move Down, Delete (destructive)
- Auto-expand depth 0 (root level) by default

### 5. `CategoryFormModal` (create + edit)

- Shared modal with `mode: 'create' | 'edit'`
- Fields: Name (Input), Color (ColorPicker), Icon (IconPicker)
- Slug auto-generated, parentId passed as prop, sortOrder computed
- Uses react-hook-form + zodResolver with `updateCategorySchema`

### 6. `DeleteCategoryDialog`

- Shows category name and descendant count
- Cascade delete: removes category + all descendants
- Undo via sonner toast (10s window), snapshots all deleted categories, `bulkAdd` on undo
- Pattern matches accounts page delete with `useRef` for undo state

### 7. `ColorPicker`

- Popover trigger shows current color swatch
- Content: 4×4 grid of 16 predefined colors (includes all seed colors + extras)
- Click selects and closes

### 8. `IconPicker`

- Popover trigger shows current icon
- Content: scrollable grid of ~32 curated lucide icons
- `ICON_MAP` maps string names to components (static imports, no dynamic loading)
- Fallback to `Tag` for unknown icon names

### 9. Sidebar nav

Add after "Rules":

```typescript
{ to: '/categories', label: 'Categories', icon: <Tag className="h-4 w-4" /> }
```

## Implementation Order

1. Types + schema additions (CategoryTreeNode, updateCategorySchema)
2. Constants file (colors, icons, icon map)
3. Hooks (useCategoryTree, useCategoryMutations)
4. ColorPicker + IconPicker components
5. CategoryTreeNode + CategoryTree components
6. CategoryFormModal + DeleteCategoryDialog
7. CategoriesPage + barrel export
8. Route file (`categories.tsx`)
9. Sidebar + breadcrumbs updates

## Verification

1. Run `npm run dev` and navigate to `/categories`
2. Verify seed categories display as a tree (10 parents with subcategories)
3. Add a new root category — verify it appears at the bottom
4. Add a nested subcategory to an existing category — verify tree updates
5. Add a sub-subcategory (3rd level) — verify unlimited nesting works
6. Edit a category's name, color, icon — verify changes persist
7. Delete a leaf category — verify simple delete with undo
8. Delete a parent with children — verify cascade delete + undo restores all
9. Move categories up/down — verify reordering persists
10. Run existing tests to ensure no regressions
