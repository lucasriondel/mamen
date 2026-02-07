# Story 7.1: Merchants List View

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see a list of all my merchants with summary information**,
So that **I can browse and find merchants to investigate (FR33)**.

## Acceptance Criteria

1. **Given** I have created merchants via rule assignment
   **When** I navigate to the Merchants page
   **Then** I see a list of all merchants
   **And** each merchant shows: name, default category, transaction count, total spent

2. **Given** I view the merchants list
   **When** looking at the layout
   **Then** merchants are sorted by total spent (highest first) by default
   **And** I can sort by: name, transaction count, total spent, last seen

3. **Given** I have many merchants
   **When** I want to find a specific one
   **Then** I can use the search/filter input at the top
   **And** filtering is instant as I type

4. **Given** I view a merchant in the list
   **When** I click on it or press Enter while focused
   **Then** I navigate to the Merchant Detail page

5. **Given** I use keyboard navigation
   **When** I'm on the Merchants page
   **Then** J/K navigates between merchants
   **And** Enter opens the focused merchant

6. **Given** I have no merchants yet
   **When** I view the Merchants page
   **Then** I see an empty state: "No merchants yet"
   **And** guidance explains merchants are created when assigning transactions

## Tasks / Subtasks

- [ ] Task 1: Create Merchants route and page skeleton (AC: #1, #4)
  - [ ] Create `src/routes/merchants/index.tsx` — TanStack Router route for `/merchants`
  - [ ] Register route in the router configuration (likely `src/routes/__root.tsx` or router file)
  - [ ] Create `src/features/merchants/components/MerchantsPage/index.tsx` — page component
  - [ ] Ensure sidebar "Merchants" nav item links to `/merchants` route
  - [ ] Verify breadcrumb shows "Merchants" when on the page

- [ ] Task 2: Create `useMerchantsList` hook for data aggregation (AC: #1, #2)
  - [ ] Create `src/features/merchants/hooks/useMerchantsList.ts`
  - [ ] Create `src/features/merchants/hooks/useMerchantsList.test.ts`
  - [ ] Use `useLiveQuery` to query all merchants from Dexie
  - [ ] For each merchant, compute:
    - `transactionCount`: count of transactions where `merchantId` matches
    - `totalSpent`: sum of transaction amounts (expenses only, negative amounts) for the merchant
    - `lastSeen`: most recent transaction date for the merchant
    - `defaultCategory`: from the merchant record
  - [ ] Return type:
    ```typescript
    type MerchantListItem = {
      id: string
      name: string
      defaultCategoryId: string | null
      categoryLabel: string
      transactionCount: number
      totalSpent: number
      lastSeen: Date | null
      createdAt: Date
    }
    ```
  - [ ] Accept sort parameter:
    ```typescript
    type MerchantSortField = 'name' | 'transactionCount' | 'totalSpent' | 'lastSeen'
    type MerchantSortOrder = 'asc' | 'desc'
    ```
  - [ ] Default sort: `totalSpent` descending (highest first)
  - [ ] Accept optional `searchQuery` parameter for filtering by merchant name
  - [ ] Filter case-insensitively using `name.toLowerCase().includes(query.toLowerCase())`
  - [ ] Test: Returns merchants sorted by totalSpent descending by default
  - [ ] Test: Sorts by name alphabetically when requested
  - [ ] Test: Filters merchants by search query
  - [ ] Test: Returns empty array when no merchants exist
  - [ ] Test: Correctly computes transactionCount and totalSpent
  - [ ] Test: Returns lastSeen as the most recent transaction date

- [ ] Task 3: Create `MerchantListItem` component (AC: #1, #5)
  - [ ] Create `src/features/merchants/components/MerchantListItem/index.tsx`
  - [ ] Create `src/features/merchants/components/MerchantListItem/MerchantListItem.test.tsx`
  - [ ] Display merchant row with:
    - Merchant name (primary text, `body` size, font-semibold)
    - Default category as a Badge (using `getCategoryLabel()` from category system)
    - Transaction count: muted text, e.g., "34 transactions"
    - Total spent: monospace, right-aligned, formatted with `formatCurrency()`
    - Last seen: muted text, relative format (e.g., "3 days ago") or absolute date
  - [ ] Row height: 48px (dense mode per UX spec)
  - [ ] Layout suggestion:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ Amazon              [Shopping > Online]    34 txns   €1,247 │
    │                                           3 days ago        │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [ ] States:
    - Default: standard row styling
    - Focused: ring outline (`ring` color), subtle background elevation
    - Hover: `bg-accent/50`, `cursor-pointer`, `transition-colors duration-150`
  - [ ] Props:
    ```typescript
    type MerchantListItemProps = {
      merchant: MerchantListItem
      isFocused: boolean
      onClick: () => void
      onKeyDown: (e: React.KeyboardEvent) => void
    }
    ```
  - [ ] Add `tabIndex={0}`, `role="button"`, `aria-label="View {merchant.name} details"`
  - [ ] Enter key on focused item triggers `onClick`
  - [ ] Test: Renders merchant name, category, transaction count, total spent
  - [ ] Test: Shows focus ring when isFocused is true
  - [ ] Test: Calls onClick when clicked
  - [ ] Test: Calls onClick when Enter is pressed
  - [ ] Test: Formats currency correctly

- [ ] Task 4: Create `MerchantsList` component with search and sort (AC: #1, #2, #3)
  - [ ] Create `src/features/merchants/components/MerchantsList/index.tsx`
  - [ ] Create `src/features/merchants/components/MerchantsList/MerchantsList.test.tsx`
  - [ ] Search input at top:
    - Placeholder: "Filter merchants..."
    - Instant filtering as user types (controlled input)
    - Clear button (x) when query is non-empty
    - Auto-focus search input on page load (optional — check if conflicts with J/K nav)
  - [ ] Sort controls:
    - Dropdown or button group for sort field: Name, Transactions, Total Spent, Last Seen
    - Toggle sort direction (asc/desc)
    - Default: Total Spent, descending
    - Use shadcn `Select` or `DropdownMenu` component
  - [ ] Render list of `MerchantListItem` components
  - [ ] If list gets large (100+ merchants), consider TanStack Virtual for virtualization
  - [ ] Show count: "47 merchants" or "12 of 47 merchants" when filtered
  - [ ] Test: Renders list of merchants
  - [ ] Test: Filters merchants when search query changes
  - [ ] Test: Sorts merchants when sort option changes
  - [ ] Test: Shows merchant count
  - [ ] Test: Shows filtered count when searching

- [ ] Task 5: Implement keyboard navigation for merchants list (AC: #4, #5)
  - [ ] Wire J/K keyboard navigation into the merchants page
  - [ ] Reuse existing `useKeyboardNavigation` hook pattern (from transactions list in Epic 3)
  - [ ] J moves focus down, K moves focus up
  - [ ] Enter on focused merchant navigates to `/merchants/$merchantId`
  - [ ] Esc clears focus
  - [ ] Keyboard navigation disabled when search input is focused (J/K should type normally)
  - [ ] Scroll focused item into view if off-screen
  - [ ] Test: J/K moves focus through merchant list
  - [ ] Test: Enter navigates to merchant detail
  - [ ] Test: J/K does not interfere when typing in search input
  - [ ] Test: Esc clears focus

- [ ] Task 6: Create empty state for no merchants (AC: #6)
  - [ ] When `merchants.length === 0` and no search filter active:
    - Show centered empty state
    - Icon: `Store` or `Building2` from lucide-react
    - Title: "No merchants yet"
    - Description: "Merchants are created when you assign transactions using the R key. Import statements and start categorizing to see merchants here."
    - CTA button: "View Transactions" → navigates to `/transactions`
  - [ ] When `merchants.length === 0` and search filter is active:
    - Show: "No merchants matching '[query]'"
    - CTA: "Clear search" button
  - [ ] Test: Shows empty state when no merchants
  - [ ] Test: Shows no-results state when search has no matches
  - [ ] Test: CTA navigates to transactions

- [ ] Task 7: Add merchant route for detail page navigation placeholder (AC: #4)
  - [ ] Create `src/routes/merchants/$merchantId.tsx` — route placeholder for future Story 7.2
  - [ ] Render a simple placeholder: "Merchant Detail — Coming in Story 7.2"
  - [ ] Ensure `navigate({ to: '/merchants/$merchantId', params: { merchantId } })` works from the list
  - [ ] This allows Story 7.1 to complete with full navigation without blocking on Story 7.2

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Full page render test:
    - Render MerchantsPage with mock Dexie data (multiple merchants with transactions)
    - Verify all merchants display with correct stats
    - Verify default sort (totalSpent descending)
  - [ ] Search flow test:
    - Type in search input
    - Verify list filters
    - Clear search, verify list restores
  - [ ] Sort flow test:
    - Change sort to "Name"
    - Verify alphabetical order
    - Change sort to "Last Seen"
    - Verify chronological order
  - [ ] Keyboard navigation flow test:
    - Press J to focus first merchant
    - Press J again to move to second
    - Press Enter to navigate to merchant detail
  - [ ] Empty state test:
    - Render with no merchants
    - Verify empty state message and CTA

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Merchant Data | Query `merchants` table + aggregate from `transactions` | Stats computed on-the-fly via Dexie |
| Navigation | TanStack Router `navigate()` | Type-safe navigation to `/merchants/$merchantId` |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |
| Props | `{ComponentName}Props` type |

### Data Model Context

**Source: [architecture.md#Data-Model], [epics.md#Additional-Requirements]**

The `merchants` table stores:
- `id`: auto-increment or UUID primary key
- `name`: string — display name
- `defaultCategoryId`: string | null — default category for this merchant
- `createdAt`: Date — when merchant was created (used for "first-time" detection in Story 7.3)

The `transactions` table has:
- `merchantId`: string | null — foreign key to merchants
- `categoryId`: string | null — category assignment
- `date`: Date — transaction date
- `amount`: number — transaction amount (negative for expenses)
- `rawMerchantString`: string — original string from bank statement

The `rules` table has:
- `merchantId`: string — foreign key to merchants
- `pattern`: string — regex pattern
- `categoryId`: string | null — category override (null means use merchant default)

**Merchant stats are computed, not stored:** Transaction count, total spent, and last seen are derived from querying transactions by `merchantId`. This avoids data duplication and keeps merchant stats always accurate.

### Merchants List Data Strategy

**Approach:** Single reactive query that loads all merchants and their aggregate stats.

```typescript
const merchants = useLiveQuery(async () => {
  const allMerchants = await db.merchants.toArray()
  const allTransactions = await db.transactions.toArray()

  return allMerchants.map(merchant => {
    const merchantTxns = allTransactions.filter(tx => tx.merchantId === merchant.id)
    const expenses = merchantTxns.filter(tx => tx.amount < 0)

    return {
      id: merchant.id,
      name: merchant.name,
      defaultCategoryId: merchant.defaultCategoryId,
      categoryLabel: getCategoryLabel(merchant.defaultCategoryId),
      transactionCount: merchantTxns.length,
      totalSpent: Math.abs(expenses.reduce((sum, tx) => sum + tx.amount, 0)),
      lastSeen: merchantTxns.length > 0
        ? new Date(Math.max(...merchantTxns.map(tx => tx.date.getTime())))
        : null,
      createdAt: merchant.createdAt,
    }
  })
}, [])
```

**Performance consideration:** For <100 merchants and <10k transactions, loading all and computing in JS is fast (<100ms). If performance becomes an issue, optimize by:
1. Using Dexie `.where('merchantId').equals(id).count()` per merchant
2. Pre-computing stats on import and storing in a separate `merchantStats` table
3. Using a Web Worker for aggregation

For MVP, the simple approach is sufficient and keeps the code simple.

### Sorting Implementation

Sorting happens client-side after Dexie query returns. This is fine for <100 merchants.

```typescript
const sortMerchants = (
  merchants: MerchantListItem[],
  field: MerchantSortField,
  order: MerchantSortOrder,
): MerchantListItem[] => {
  return [...merchants].sort((a, b) => {
    let comparison = 0
    switch (field) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'transactionCount':
        comparison = a.transactionCount - b.transactionCount
        break
      case 'totalSpent':
        comparison = a.totalSpent - b.totalSpent
        break
      case 'lastSeen':
        comparison = (a.lastSeen?.getTime() ?? 0) - (b.lastSeen?.getTime() ?? 0)
        break
    }
    return order === 'asc' ? comparison : -comparison
  })
}
```

### Search/Filter Implementation

Filtering is done client-side with a simple case-insensitive includes check. No fuzzy search needed for the merchants list — there are far fewer merchants than transactions.

```typescript
const filteredMerchants = searchQuery
  ? merchants.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
  : merchants
```

### Keyboard Navigation Pattern

Reuse the same J/K navigation pattern established in Epic 3 (Transaction List). Key behaviors:

- J/K move a `focusedIndex` state variable
- The focused item gets `isFocused={true}` prop
- Enter on focused item calls `navigate()`
- When search input is focused, J/K type normally (keyboard guard checks `document.activeElement`)
- Esc clears focus (sets `focusedIndex` to -1)

```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  // Don't handle if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return
  }

  switch (e.key) {
    case 'j':
      e.preventDefault()
      setFocusedIndex(prev => Math.min(prev + 1, merchants.length - 1))
      break
    case 'k':
      e.preventDefault()
      setFocusedIndex(prev => Math.max(prev - 1, 0))
      break
    case 'Enter':
      if (focusedIndex >= 0 && focusedIndex < merchants.length) {
        navigate({
          to: '/merchants/$merchantId',
          params: { merchantId: merchants[focusedIndex].id },
        })
      }
      break
    case 'Escape':
      setFocusedIndex(-1)
      break
  }
}, [merchants, focusedIndex, navigate])
```

### UX Specifications

**Source: [ux-design-specification.md]**

**Merchant List Row Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Amazon              [Shopping > Online]    34 txns   €1,247 │
└─────────────────────────────────────────────────────────────┘
```

- Merchant name: `body` size (14px), `font-semibold`
- Category badge: shadcn `Badge` component
- Transaction count: `small` size (12px), `muted-foreground`
- Total spent: `mono` font (JetBrains Mono), right-aligned, tabular numbers
- Last seen: `small` size, `muted-foreground`, relative time

**Row Styling:**
- Height: 48px (dense mode)
- Padding: 12px horizontal
- Hover: `bg-accent/50`, `cursor-pointer`, `transition-colors duration-150`
- Focus: `ring` color outline (`:focus-visible`)
- Border bottom: `border` color, 1px

**Empty State:**
- Centered layout
- Icon from lucide-react (e.g., `Store` or `Building2`)
- Title: "No merchants yet" (`h3` size)
- Description: muted text explaining how merchants are created
- CTA button: Primary style

**Sort Controls:**
- Compact dropdown or segmented control above the list
- Show current sort: "Sorted by: Total Spent ↓"
- Click to change sort field
- Click sort indicator to toggle direction

### Sidebar Integration

The sidebar already has a "Merchants" nav item (established in Story 1.3). Ensure:
- The nav item links to `/merchants` route
- Active state highlights when on `/merchants` or `/merchants/$merchantId`
- The sidebar should already handle this via TanStack Router's active link detection

### Category Label Resolution

Categories are predefined (seeded in Story 4.1). To display category names:

```typescript
// From the category system established in Story 4.1
const getCategoryLabel = (categoryId: string | null): string => {
  if (!categoryId) return 'Uncategorized'
  // Lookup from the DEFAULT_CATEGORIES constant
  // Returns format like "Shopping > Online" or "Dining > Restaurants"
  return DEFAULT_CATEGORIES[categoryId]?.label ?? 'Unknown'
}
```

### Relative Time Formatting

For "last seen" display, use native `Intl.RelativeTimeFormat` or a simple utility:

```typescript
const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}
```

No external date library needed — keep it simple.

### No Extra Dependencies

No new libraries needed. Use:
- Dexie `useLiveQuery` (already installed)
- TanStack Router `navigate()`, route params (already installed)
- shadcn `Badge`, `Select`/`DropdownMenu`, `Button` (already installed)
- lucide-react icons (already installed)

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `getCategoryLabel` | Category system from Story 4.1 | Resolve category ID to display label |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | Keyboard handler pattern (extend or reuse) |
| `Badge` | `src/components/ui/badge.tsx` | Category badge display |
| `Select` | `src/components/ui/select.tsx` | Sort field selector |
| `Button` | `src/components/ui/button.tsx` | CTA buttons |

### Existing Components — NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| `Layout` | `src/components/Layout/` | Already renders sidebar with Merchants nav item |
| `CommandPalette` | `src/components/CommandPalette/` | Independent — not affected |
| `TransactionList` | `src/features/transactions/` | Independent — not affected |
| `CategoryBreakdown` | `src/features/dashboard/` | Independent — not affected |

### Project Structure for This Story

```
src/
├── routes/
│   └── merchants/
│       ├── index.tsx (new — merchants list route)
│       └── $merchantId.tsx (new — placeholder for Story 7.2)
├── features/
│   └── merchants/
│       ├── components/
│       │   ├── MerchantsPage/
│       │   │   ├── index.tsx (new)
│       │   │   └── MerchantsPage.test.tsx (new)
│       │   ├── MerchantsList/
│       │   │   ├── index.tsx (new)
│       │   │   └── MerchantsList.test.tsx (new)
│       │   └── MerchantListItem/
│       │       ├── index.tsx (new)
│       │       └── MerchantListItem.test.tsx (new)
│       ├── hooks/
│       │   ├── useMerchantsList.ts (new)
│       │   └── useMerchantsList.test.ts (new)
│       └── index.ts (new — feature exports)
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Page load (merchants list) | <100ms after route transition |
| Search filtering | Instant (<16ms — synchronous JS filter) |
| Sort change | Instant (<16ms — synchronous JS sort) |
| J/K navigation | <16ms per keystroke (60fps) |
| Navigate to merchant detail | <100ms route transition |

For <100 merchants, all operations are well within targets. No virtualization needed unless merchant count exceeds ~200.

### Keyboard Accessibility

**Source: [ux-design-specification.md#Keyboard-Patterns]**

| Key | Context | Action |
|-----|---------|--------|
| `J` | Merchants page | Focus next merchant |
| `K` | Merchants page | Focus previous merchant |
| `Enter` | Focused merchant | Navigate to merchant detail |
| `Esc` | Merchants page | Clear focus |
| `/` | Merchants page | Focus search input (optional convenience) |

Each merchant row must have:
- `tabIndex={0}` for keyboard focus
- `:focus-visible` ring styling
- `role="button"` for screen readers
- `aria-label` describing the action (e.g., "View Amazon details")

### Edge Cases to Handle

1. **Merchant with 0 transactions:** Can happen if all transactions were deleted or unlinked. Show merchant with "0 transactions" and "€0" — don't hide it.
2. **Merchant with no category:** Show "Uncategorized" badge in muted style.
3. **Very long merchant name:** Truncate with ellipsis, full name visible on hover (title attribute or tooltip).
4. **Currency formatting:** Use `formatCurrency()` consistently — respect user's currency setting from Story 10.2 (default to €).
5. **Sort stability:** When two merchants have the same value for the sort field, maintain a stable secondary sort (by name alphabetically).
6. **New merchant badge (preview):** Story 7.3 adds the "🆕" badge. For this story, add a `createdAt` field to the `MerchantListItem` type so Story 7.3 can easily add the badge without refactoring.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT store merchant list in React state — use `useLiveQuery` directly
- DO NOT create aggregate stats tables — compute from transactions on the fly
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT add sorting/filtering libraries — use plain JS `Array.sort()` and `.filter()`
- DO NOT add date formatting libraries (date-fns, dayjs) — use native JS
- DO NOT precompute merchant stats in the database — keep it simple, compute on read
- DO NOT modify sidebar, layout, or any components from other features

### Validation Checklist

Before marking complete:
- [ ] Merchants page renders at `/merchants` route
- [ ] All merchants display with name, category, transaction count, total spent
- [ ] Default sort is total spent descending
- [ ] Can sort by name, transaction count, total spent, last seen
- [ ] Search input filters merchants instantly
- [ ] J/K navigates between merchants
- [ ] Enter on focused merchant navigates to `/merchants/$merchantId`
- [ ] Empty state shows when no merchants exist
- [ ] No-results state shows when search has no matches
- [ ] Merchant rows have hover state (bg-accent/50, cursor-pointer)
- [ ] Focused merchant has visible focus ring
- [ ] Merchant count shown (e.g., "47 merchants")
- [ ] Filtered count shown when searching (e.g., "12 of 47 merchants")
- [ ] Each row has `role="button"` and `aria-label`
- [ ] Keyboard navigation disabled in search input (J/K type normally)
- [ ] Currency formatted correctly with `formatCurrency()`
- [ ] Category displayed as Badge with label from `getCategoryLabel()`
- [ ] Last seen shown as relative time
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass (new)
- [ ] `useLiveQuery` used for merchant data
- [ ] No extra dependencies added

### References

- [Source: epics.md#Epic-7-Story-7.1-Merchants-List-View]
- [Source: prd.md#FR33 - User can view a merchant detail page showing all transactions]
- [Source: prd.md#FR34 - User can see total spent and transaction count per merchant]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, merchant data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface]
- [Source: architecture.md#Frontend-Architecture - TanStack Router type-safe routing]
- [Source: architecture.md#Project-Structure - routes/merchants/, features/merchants/]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, TanStack Router ^1.153]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: ux-design-specification.md#Merchant-Page-Layout - Merchant page stats and sections]
- [Source: ux-design-specification.md#Keyboard-Patterns - J/K navigation, Enter to open]
- [Source: ux-design-specification.md#Layout-Structure - Sidebar navigation with Merchants]
- [Source: ux-design-specification.md#Empty-States - No merchants empty state]
- [Source: ux-design-specification.md#Component-Density - 48px row height]
- [Source: ux-design-specification.md#Typography-System - Font sizes, monospace for amounts]
- [Source: ux-design-specification.md#Responsive-Strategy - Desktop-first, 220px sidebar]
- [Story 1.3: App Shell with Linear Layout - Sidebar with Merchants nav item, Layout component]
- [Story 3.2: Keyboard Navigation with J/K - useKeyboardNavigation hook pattern]
- [Story 4.1: Category System Setup - getCategoryLabel, DEFAULT_CATEGORIES constant]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
