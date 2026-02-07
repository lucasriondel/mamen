# Story 4.1: Category System Setup

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **a predefined set of spending categories with subcategories**,
So that **I can organize my transactions meaningfully (FR8)**.

## Acceptance Criteria

1. **Given** I use the app for the first time
   **When** the database initializes
   **Then** default categories are seeded:
   - Shopping (Online, Groceries, Clothing, Electronics, Other)
   - Dining (Restaurants, Coffee, Fast Food, Delivery)
   - Transportation (Rideshare, Public Transit, Gas, Parking)
   - Subscriptions (Streaming, Software, Memberships)
   - Housing (Rent, Utilities, Insurance, Maintenance)
   - Health (Medical, Pharmacy, Fitness)
   - Entertainment (Events, Games, Hobbies)
   - Travel (Flights, Hotels, Activities)
   - Income (Salary, Freelance, Refunds, Other)
   - Other (Uncategorized)

2. **Given** I want to view categories
   **When** I access category selection (in modals or settings)
   **Then** categories are shown with their subcategories
   **And** the picker is searchable and keyboard-navigable

3. **Given** I select a category
   **When** assigning to a transaction or merchant
   **Then** I can select the parent category
   **And** optionally select a subcategory
   **And** format displays as "Category > Subcategory"

## Tasks / Subtasks

- [ ] Task 1: Define category TypeScript types (AC: #1)
  - [ ] Create `src/types/category.types.ts`
  - [ ] Define `Category` type with: `id`, `name`, `slug`, `color`, `icon`, `parentId?`, `sortOrder`
  - [ ] Define `CategoryWithSubcategories` type for nested view
  - [ ] Use `type` not `interface` per project conventions
  - [ ] Export all types as named exports

- [ ] Task 2: Create Zod validation schema (AC: #1)
  - [ ] Create `src/lib/schemas/category.schema.ts`
  - [ ] Define `categorySchema` with all required fields
  - [ ] Define `categoryInsertSchema` for creating new categories
  - [ ] Validate: name (non-empty string), slug (kebab-case), color (hex or CSS color)
  - [ ] Export schemas as named exports

- [ ] Task 3: Add categories table to Dexie schema (AC: #1)
  - [ ] Modify `src/lib/db/schema.ts`
  - [ ] Add `categories` table to Dexie schema
  - [ ] Define indexes: `id`, `parentId`, `slug`, `sortOrder`
  - [ ] Increment database version for migration
  - [ ] Export `categories` table from db instance

- [ ] Task 4: Create category seeding function (AC: #1)
  - [ ] Create `src/lib/db/seeds/categories.ts`
  - [ ] Define `DEFAULT_CATEGORIES` constant with all 10 parent categories
  - [ ] Define subcategories for each parent (as listed in AC#1)
  - [ ] Assign colors from UX design palette
  - [ ] Assign Lucide icon names to each category
  - [ ] Function: `seedCategories()` - idempotent, only seeds if empty
  - [ ] Use transaction to ensure atomic seeding

- [ ] Task 5: Implement database seeding on init (AC: #1)
  - [ ] Modify `src/lib/db/index.ts` or create init hook
  - [ ] Call `seedCategories()` on database open
  - [ ] Check if categories table is empty before seeding
  - [ ] Log seeding activity for debugging
  - [ ] Handle errors gracefully (toast notification)

- [ ] Task 6: Create CategoryPicker component (AC: #2, #3)
  - [ ] Create `src/components/CategoryPicker/index.tsx`
  - [ ] Create `src/components/CategoryPicker/CategoryPicker.test.tsx`
  - [ ] Use shadcn Command component (cmdk) as base
  - [ ] Display categories grouped by parent
  - [ ] Show category icon and color indicator
  - [ ] Props: `value`, `onSelect`, `allowSubcategory?`, `className?`
  - [ ] Controlled component pattern

- [ ] Task 7: Implement category search/filter (AC: #2)
  - [ ] Add search input at top of picker
  - [ ] Filter categories by name (case-insensitive)
  - [ ] Include both parent and subcategory in search
  - [ ] Highlight matching text in results
  - [ ] Show "No results" when nothing matches
  - [ ] Filter instantly as user types

- [ ] Task 8: Implement keyboard navigation (AC: #2)
  - [ ] Arrow keys navigate through categories
  - [ ] Enter selects highlighted category
  - [ ] Escape closes picker (when used as popover)
  - [ ] Tab cycles through interactive elements
  - [ ] Home/End jump to first/last category
  - [ ] Type-ahead: typing jumps to matching category

- [ ] Task 9: Implement subcategory selection (AC: #3)
  - [ ] When parent category is selected, show subcategories
  - [ ] Allow selecting parent without subcategory
  - [ ] Allow selecting specific subcategory
  - [ ] Display format: "Shopping > Groceries"
  - [ ] Breadcrumb-style navigation within picker
  - [ ] "Back" option to return to parent categories

- [ ] Task 10: Create CategoryBadge component (AC: #3)
  - [ ] Create `src/components/CategoryBadge/index.tsx`
  - [ ] Create `src/components/CategoryBadge/CategoryBadge.test.tsx`
  - [ ] Display category name with color indicator
  - [ ] Props: `category`, `showSubcategory?`, `size?` (sm/md)
  - [ ] Format: "Category" or "Category > Subcategory"
  - [ ] Use shadcn Badge as base
  - [ ] Add colored dot or left border for category color

- [ ] Task 11: Create useCategoriesHook (AC: #1, #2)
  - [ ] Create `src/hooks/useCategories.ts`
  - [ ] Create `src/hooks/useCategories.test.ts`
  - [ ] Use `useLiveQuery` to fetch all categories
  - [ ] Return: `categories`, `parentCategories`, `getSubcategories(parentId)`
  - [ ] Memoize subcategory grouping for performance
  - [ ] Handle loading state (return empty array while loading)

- [ ] Task 12: Style components per UX specification (AC: #2, #3)
  - [ ] CategoryPicker:
    - Popover/dialog styling from shadcn
    - Max height: 320px with scroll
    - Width: 280px
    - Search input at top, sticky
    - Categories in scrollable list
  - [ ] CategoryBadge:
    - Height: 24px (sm) or 28px (md)
    - Border radius: 6px
    - Color dot: 8px circle
    - Text: 12px/14px Inter
  - [ ] Use dark theme colors from UX spec

- [ ] Task 13: Write comprehensive tests (AC: all)
  - [ ] Category seeding tests:
    - Test: seeds categories on first run
    - Test: does not duplicate on subsequent runs
    - Test: all 10 parent categories exist
    - Test: all subcategories linked correctly
  - [ ] CategoryPicker tests:
    - Test: renders all parent categories
    - Test: search filters categories
    - Test: keyboard navigation works
    - Test: selecting category calls onSelect
    - Test: subcategory selection shows full path
  - [ ] CategoryBadge tests:
    - Test: displays category name
    - Test: shows color indicator
    - Test: displays subcategory when provided
  - [ ] useCategories hook tests:
    - Test: returns all categories
    - Test: groups subcategories correctly

- [ ] Task 14: Accessibility compliance (AC: #2)
  - [ ] CategoryPicker:
    - `role="listbox"` on category list
    - `role="option"` on each category item
    - `aria-selected` on currently highlighted
    - `aria-label="Select category"` on container
    - Announce selection changes to screen reader
  - [ ] CategoryBadge:
    - Ensure color contrast meets AA (4.5:1)
    - Don't rely solely on color for meaning
  - [ ] Search input:
    - `aria-label="Search categories"`
    - `aria-controls` linked to results list

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Schema | Dexie tables with TypeScript interfaces | Type-safe, simple |
| Validation | Zod schemas | Runtime validation, good DX |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |

### UX Design Requirements

**Source: [epics.md#Story-4.1]**

Default categories to seed:
- Shopping (Online, Groceries, Clothing, Electronics, Other)
- Dining (Restaurants, Coffee, Fast Food, Delivery)
- Transportation (Rideshare, Public Transit, Gas, Parking)
- Subscriptions (Streaming, Software, Memberships)
- Housing (Rent, Utilities, Insurance, Maintenance)
- Health (Medical, Pharmacy, Fitness)
- Entertainment (Events, Games, Hobbies)
- Travel (Flights, Hotels, Activities)
- Income (Salary, Freelance, Refunds, Other)
- Other (Uncategorized)

### Category Colors (UX Palette)

**Source: [ux-design-specification.md - implied from design system]**

| Category | Color | Hex |
|----------|-------|-----|
| Shopping | Blue | #3B82F6 |
| Dining | Orange | #F97316 |
| Transportation | Cyan | #06B6D4 |
| Subscriptions | Purple | #8B5CF6 |
| Housing | Slate | #64748B |
| Health | Red | #EF4444 |
| Entertainment | Pink | #EC4899 |
| Travel | Green | #22C55E |
| Income | Emerald | #10B981 |
| Other | Gray | #6B7280 |

### Category Icons (Lucide React)

| Category | Icon |
|----------|------|
| Shopping | ShoppingCart |
| Dining | Utensils |
| Transportation | Car |
| Subscriptions | Repeat |
| Housing | Home |
| Health | Heart |
| Entertainment | Gamepad2 |
| Travel | Plane |
| Income | TrendingUp |
| Other | MoreHorizontal |

### Implementation Approach

#### Category Types

```typescript
// src/types/category.types.ts

export type Category = {
  id: string
  name: string
  slug: string
  color: string
  icon: string
  parentId: string | null
  sortOrder: number
  createdAt: Date
}

export type CategoryWithSubcategories = Category & {
  subcategories: Category[]
}

export type CategorySelection = {
  categoryId: string
  subcategoryId?: string
}
```

#### Zod Schema

```typescript
// src/lib/schemas/category.schema.ts

import { z } from 'zod'

export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0),
  createdAt: z.date(),
})

export const categoryInsertSchema = categorySchema.omit({
  id: true,
  createdAt: true,
})
```

#### Dexie Schema Update

```typescript
// src/lib/db/schema.ts (additions)

import Dexie, { Table } from 'dexie'
import { Category } from '@/types/category.types'

export class MamenDatabase extends Dexie {
  accounts!: Table<Account>
  transactions!: Table<Transaction>
  merchants!: Table<Merchant>
  rules!: Table<Rule>
  categories!: Table<Category>  // NEW
  settings!: Table<Settings>

  constructor() {
    super('mamen')

    this.version(2).stores({  // Increment version
      accounts: '++id, name',
      transactions: '++id, accountId, merchantId, date, amount',
      merchants: '++id, name, defaultCategoryId',
      rules: '++id, merchantId, pattern',
      categories: 'id, parentId, slug, sortOrder',  // NEW
      settings: 'key',
    })
  }
}

export const db = new MamenDatabase()
```

#### Category Seeding

```typescript
// src/lib/db/seeds/categories.ts

import { db } from '@/lib/db'
import { Category } from '@/types/category.types'
import { v4 as uuid } from 'uuid'

type CategorySeed = {
  name: string
  color: string
  icon: string
  subcategories: string[]
}

const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Shopping', color: '#3B82F6', icon: 'ShoppingCart', subcategories: ['Online', 'Groceries', 'Clothing', 'Electronics', 'Other'] },
  { name: 'Dining', color: '#F97316', icon: 'Utensils', subcategories: ['Restaurants', 'Coffee', 'Fast Food', 'Delivery'] },
  { name: 'Transportation', color: '#06B6D4', icon: 'Car', subcategories: ['Rideshare', 'Public Transit', 'Gas', 'Parking'] },
  { name: 'Subscriptions', color: '#8B5CF6', icon: 'Repeat', subcategories: ['Streaming', 'Software', 'Memberships'] },
  { name: 'Housing', color: '#64748B', icon: 'Home', subcategories: ['Rent', 'Utilities', 'Insurance', 'Maintenance'] },
  { name: 'Health', color: '#EF4444', icon: 'Heart', subcategories: ['Medical', 'Pharmacy', 'Fitness'] },
  { name: 'Entertainment', color: '#EC4899', icon: 'Gamepad2', subcategories: ['Events', 'Games', 'Hobbies'] },
  { name: 'Travel', color: '#22C55E', icon: 'Plane', subcategories: ['Flights', 'Hotels', 'Activities'] },
  { name: 'Income', color: '#10B981', icon: 'TrendingUp', subcategories: ['Salary', 'Freelance', 'Refunds', 'Other'] },
  { name: 'Other', color: '#6B7280', icon: 'MoreHorizontal', subcategories: ['Uncategorized'] },
]

const toSlug = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, '-')

export const seedCategories = async (): Promise<void> => {
  const existingCount = await db.categories.count()

  if (existingCount > 0) {
    console.log('Categories already seeded, skipping')
    return
  }

  const categories: Category[] = []
  const now = new Date()

  DEFAULT_CATEGORIES.forEach((parent, parentIndex) => {
    const parentId = uuid()

    // Add parent category
    categories.push({
      id: parentId,
      name: parent.name,
      slug: toSlug(parent.name),
      color: parent.color,
      icon: parent.icon,
      parentId: null,
      sortOrder: parentIndex,
      createdAt: now,
    })

    // Add subcategories
    parent.subcategories.forEach((subName, subIndex) => {
      categories.push({
        id: uuid(),
        name: subName,
        slug: `${toSlug(parent.name)}-${toSlug(subName)}`,
        color: parent.color,
        icon: parent.icon,
        parentId: parentId,
        sortOrder: subIndex,
        createdAt: now,
      })
    })
  })

  await db.transaction('rw', db.categories, async () => {
    await db.categories.bulkAdd(categories)
  })

  console.log(`Seeded ${categories.length} categories`)
}
```

#### CategoryPicker Component

```typescript
// src/components/CategoryPicker/index.tsx

import { useState, useMemo } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useCategories } from '@/hooks/useCategories'
import { Category } from '@/types/category.types'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type CategoryPickerProps = {
  value?: string
  onSelect: (categoryId: string, subcategoryId?: string) => void
  allowSubcategory?: boolean
  className?: string
}

export const CategoryPicker = ({
  value,
  onSelect,
  allowSubcategory = true,
  className,
}: CategoryPickerProps): JSX.Element => {
  const { parentCategories, getSubcategories } = useCategories()
  const [selectedParent, setSelectedParent] = useState<Category | null>(null)
  const [search, setSearch] = useState('')

  const subcategories = useMemo(
    () => selectedParent ? getSubcategories(selectedParent.id) : [],
    [selectedParent, getSubcategories]
  )

  const handleParentSelect = (category: Category): void => {
    if (allowSubcategory) {
      setSelectedParent(category)
    } else {
      onSelect(category.id)
    }
  }

  const handleSubcategorySelect = (subcategory: Category): void => {
    onSelect(selectedParent!.id, subcategory.id)
    setSelectedParent(null)
  }

  const handleParentOnly = (): void => {
    if (selectedParent) {
      onSelect(selectedParent.id)
      setSelectedParent(null)
    }
  }

  const handleBack = (): void => {
    setSelectedParent(null)
    setSearch('')
  }

  return (
    <Command className={cn('w-[280px]', className)}>
      <CommandInput
        placeholder="Search categories..."
        value={search}
        onValueChange={setSearch}
        aria-label="Search categories"
      />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>No categories found.</CommandEmpty>

        {selectedParent ? (
          <CommandGroup heading={selectedParent.name}>
            <CommandItem onSelect={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </CommandItem>
            <CommandItem onSelect={handleParentOnly}>
              <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: selectedParent.color }} />
              {selectedParent.name} (no subcategory)
            </CommandItem>
            {subcategories.map((sub) => (
              <CommandItem
                key={sub.id}
                value={sub.name}
                onSelect={() => handleSubcategorySelect(sub)}
              >
                <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: sub.color }} />
                {sub.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandGroup heading="Categories">
            {parentCategories.map((category) => (
              <CommandItem
                key={category.id}
                value={category.name}
                onSelect={() => handleParentSelect(category)}
              >
                <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
                {allowSubcategory && <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
```

#### useCategories Hook

```typescript
// src/hooks/useCategories.ts

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Category, CategoryWithSubcategories } from '@/types/category.types'

type UseCategoriesReturn = {
  categories: Category[]
  parentCategories: Category[]
  categoriesWithSubs: CategoryWithSubcategories[]
  getSubcategories: (parentId: string) => Category[]
  getCategoryById: (id: string) => Category | undefined
  isLoading: boolean
}

export const useCategories = (): UseCategoriesReturn => {
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    []
  )

  const isLoading = categories === undefined

  const parentCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parentId === null),
    [categories]
  )

  const categoriesWithSubs = useMemo(
    () => parentCategories.map((parent) => ({
      ...parent,
      subcategories: (categories ?? []).filter((c) => c.parentId === parent.id),
    })),
    [parentCategories, categories]
  )

  const getSubcategories = (parentId: string): Category[] =>
    (categories ?? []).filter((c) => c.parentId === parentId)

  const getCategoryById = (id: string): Category | undefined =>
    (categories ?? []).find((c) => c.id === id)

  return {
    categories: categories ?? [],
    parentCategories,
    categoriesWithSubs,
    getSubcategories,
    getCategoryById,
    isLoading,
  }
}
```

#### CategoryBadge Component

```typescript
// src/components/CategoryBadge/index.tsx

import { Badge } from '@/components/ui/badge'
import { useCategories } from '@/hooks/useCategories'
import { cn } from '@/lib/utils'

type CategoryBadgeProps = {
  categoryId: string
  subcategoryId?: string
  showSubcategory?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export const CategoryBadge = ({
  categoryId,
  subcategoryId,
  showSubcategory = true,
  size = 'sm',
  className,
}: CategoryBadgeProps): JSX.Element | null => {
  const { getCategoryById } = useCategories()

  const category = getCategoryById(categoryId)
  const subcategory = subcategoryId ? getCategoryById(subcategoryId) : undefined

  if (!category) return null

  const displayText = showSubcategory && subcategory
    ? `${category.name} > ${subcategory.name}`
    : category.name

  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1.5',
        size === 'sm' && 'h-6 text-xs',
        size === 'md' && 'h-7 text-sm',
        className
      )}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: category.color }}
        aria-hidden="true"
      />
      <span className="truncate max-w-[150px]">{displayText}</span>
    </Badge>
  )
}
```

### Project Structure for This Story

```
src/
├── types/
│   └── category.types.ts (new)
├── lib/
│   ├── db/
│   │   ├── index.ts (modify - add seeding call)
│   │   ├── schema.ts (modify - add categories table)
│   │   └── seeds/
│   │       └── categories.ts (new)
│   └── schemas/
│       └── category.schema.ts (new)
├── hooks/
│   ├── useCategories.ts (new)
│   └── useCategories.test.ts (new)
└── components/
    ├── CategoryPicker/
    │   ├── index.tsx (new)
    │   └── CategoryPicker.test.tsx (new)
    └── CategoryBadge/
        ├── index.tsx (new)
        └── CategoryBadge.test.tsx (new)
```

### Dependencies on Previous Stories

This story has dependencies on:
- **Epic 1 (Complete):** Dexie database established, Zod configured
- **Epic 3 (ready-for-dev):** App shell for viewing categories

### Preparation for Future Stories

This story is a **foundation** for Epic 4:
- **Story 4.2:** Unmatched view uses CategoryBadge for "Unmatched" indicator
- **Story 4.3:** Create Merchant uses CategoryPicker for category assignment
- **Story 4.4:** Assign to existing merchant uses CategoryPicker
- **Story 4.7:** Quick category assignment (C key) uses CategoryPicker

### Database Migration Notes

**CRITICAL:** This story introduces a new `categories` table. The Dexie schema version must be incremented.

```typescript
// Migration strategy:
// 1. Increment version in schema.ts
// 2. Add categories table definition
// 3. Call seedCategories() after db opens
// 4. Seed is idempotent - safe to run multiple times
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate category data in React state (use `useLiveQuery`)
- DO NOT hardcode categories in components (fetch from Dexie)
- DO NOT use class components

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Category fetch | <50ms | Dexie indexed query |
| Picker render | <16ms | Virtualize if >50 categories |
| Search filter | <16ms | In-memory filter on fetched data |

- Categories table is small (~50 records) - no pagination needed
- Use `useLiveQuery` for automatic updates
- Memoize computed values (parentCategories, groupedCategories)

### UUID Generation

Use `crypto.randomUUID()` (browser native) or `uuid` package for category IDs:

```typescript
// Option 1: Native (modern browsers)
const id = crypto.randomUUID()

// Option 2: uuid package (if already installed)
import { v4 as uuid } from 'uuid'
const id = uuid()
```

Check if `uuid` is already a dependency; if not, use native `crypto.randomUUID()`.

### Validation Checklist

Before marking complete:
- [ ] All 10 parent categories exist in database
- [ ] Each parent has correct subcategories
- [ ] Colors assigned per specification
- [ ] Icons assigned per specification
- [ ] CategoryPicker shows all categories
- [ ] Search filters categories correctly
- [ ] Keyboard navigation works (arrow keys, Enter, Escape)
- [ ] Subcategory selection works
- [ ] "Category > Subcategory" format displayed
- [ ] CategoryBadge shows color and name
- [ ] Seeding is idempotent (doesn't duplicate)
- [ ] Database version incremented
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme
- [ ] Screen reader announces category selection

### References

- [Source: epics.md#Epic-4-Story-4.1-Category-System-Setup]
- [Source: prd.md#FR8 - User can assign categories and subcategories to rules]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Dexie-Table-Naming]
- [Previous Epics: Epic 1-3 (foundation established)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
