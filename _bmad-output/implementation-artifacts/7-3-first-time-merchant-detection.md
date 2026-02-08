# Story 7.3: First-Time Merchant Detection

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see which merchants are new to me**,
So that **I can pay attention to unfamiliar spending sources (FR35)**.

## Acceptance Criteria

1. **Given** I create a new merchant
   **When** the merchant is saved
   **Then** a "first seen" timestamp is recorded (via `createdAt` field already in schema)
   **And** the merchant is flagged as "new" for 30 days

2. **Given** a merchant is less than 30 days old
   **When** I view the merchant in any list or page
   **Then** I see a "New" badge indicator
   **And** on the merchant detail page, the badge is prominent near the name

3. **Given** I view the Merchants list
   **When** I have new merchants
   **Then** new merchants are visually distinct with the "New" badge
   **And** I can filter to show only new merchants (optional toggle/filter)

4. **Given** I view the Transaction list
   **When** a transaction belongs to a new merchant
   **Then** the merchant name shows with the "New" indicator
   **And** this helps me spot unfamiliar spending

5. **Given** a merchant is more than 30 days old
   **When** I view the merchant
   **Then** the "New" badge is no longer shown
   **And** the "first seen" date is still visible on the detail page

6. **Given** I import transactions
   **When** transactions match a new merchant
   **Then** the merchant retains its "new" status
   **And** `createdAt` date doesn't change

## Tasks / Subtasks

- [x] Task 1: Create `isNewMerchant` utility function (AC: #1, #2, #5)
  - [x]Create `src/features/merchants/utils/isNewMerchant.ts`
  - [x]Create `src/features/merchants/utils/isNewMerchant.test.ts`
  - [x]Implementation:
    ```typescript
    export const NEW_MERCHANT_THRESHOLD_DAYS = 30

    export const isNewMerchant = (createdAt: Date): boolean => {
      const now = new Date()
      const diffMs = now.getTime() - new Date(createdAt).getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      return diffDays <= NEW_MERCHANT_THRESHOLD_DAYS
    }
    ```
  - [x]Export the constant `NEW_MERCHANT_THRESHOLD_DAYS` for testability and potential settings override
  - [x]Test: Returns `true` for merchant created today
  - [x]Test: Returns `true` for merchant created 29 days ago
  - [x]Test: Returns `true` for merchant created exactly 30 days ago (boundary)
  - [x]Test: Returns `false` for merchant created 31 days ago
  - [x]Test: Returns `false` for merchant created 365 days ago
  - [x]Test: Handles edge case where `createdAt` is a string (Date constructor)

- [x] Task 2: Create `NewMerchantBadge` component (AC: #2, #3, #4)
  - [x]Create `src/features/merchants/components/NewMerchantBadge/index.tsx`
  - [x]Create `src/features/merchants/components/NewMerchantBadge/NewMerchantBadge.test.tsx`
  - [x]Implementation using shadcn `Badge` with a distinct style:
    ```typescript
    type NewMerchantBadgeProps = {
      createdAt: Date
      size?: 'sm' | 'default'  // 'sm' for transaction rows, 'default' for detail page
    }

    export const NewMerchantBadge = ({ createdAt, size = 'default' }: NewMerchantBadgeProps) => {
      if (!isNewMerchant(createdAt)) return null
      return (
        <Badge variant="outline" className={cn(
          'border-blue-500/50 bg-blue-500/10 text-blue-500',
          size === 'sm' && 'text-[10px] px-1 py-0'
        )}>
          New
        </Badge>
      )
    }
    ```
  - [x]Use a blue/info color scheme to distinguish from category badges (which use default badge variant)
  - [x]Component returns `null` when merchant is > 30 days old (self-contained logic)
  - [x]Props include optional `size` for compact use in transaction rows vs prominent use on detail page
  - [x]Test: Renders "New" badge when createdAt is within 30 days
  - [x]Test: Renders nothing when createdAt is older than 30 days
  - [x]Test: Applies small size class when size="sm"
  - [x]Test: Has accessible text content "New"

- [x] Task 3: Integrate "New" badge into `MerchantListItem` component (AC: #2, #3)
  - [x]Modify `src/features/merchants/components/MerchantListItem/index.tsx`
  - [x]Add `NewMerchantBadge` next to the merchant name:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ Amazon  [New]          [Shopping > Online]    34 txns €1,247 │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [x]Pass `merchant.createdAt` to `NewMerchantBadge`
  - [x]Badge renders inline after merchant name, before category badge
  - [x]No changes to `MerchantListItem` type — `createdAt` was already included in Story 7.1
  - [x]Test: Shows "New" badge for merchants created within 30 days
  - [x]Test: Does not show "New" badge for older merchants
  - [x]Test: Badge does not break row layout

- [x] Task 4: Integrate "New" badge into `MerchantHeader` on detail page (AC: #2, #5)
  - [x]Modify `src/features/merchants/components/MerchantHeader/index.tsx`
  - [x]Add `NewMerchantBadge` prominently next to the merchant name in the header:
    ```
    ← Merchants
    Amazon  [New]
    Default: Shopping > Online
    ```
  - [x]Pass `createdAt` as a new prop to `MerchantHeader`:
    ```typescript
    type MerchantHeaderProps = {
      name: string
      categoryLabel: string
      createdAt: Date
      onBack: () => void
    }
    ```
  - [x]Use `size="default"` for prominent display
  - [x]The "first seen" date is already visible in the stats cards section (Story 7.2), so no additional work for AC #5's "first seen date is still visible"
  - [x]Test: Shows "New" badge for new merchants
  - [x]Test: Does not show "New" badge for established merchants

- [x] Task 5: Integrate "New" indicator into transaction rows (AC: #4)
  - [x]Modify `src/components/TransactionRow/index.tsx` (or equivalent transaction row component)
  - [x]When a transaction has a `merchantId`, look up the merchant's `createdAt` to determine if new
  - [x]Approach: The transaction row likely already receives merchant data (or can derive it). Add `NewMerchantBadge` with `size="sm"` next to the merchant name:
    ```
    │ Jan 18 │ AMZN*1234XYZ  [New] │  €29.99  │ Shopping        │
    ```
  - [x]**Data strategy:** The transaction list view should provide merchant `createdAt` data alongside transactions. Two approaches:
    - **Option A (Recommended):** The transaction list's data hook adds `merchantCreatedAt` to each transaction item by joining with merchants table
    - **Option B:** `NewMerchantBadge` internally uses `useLiveQuery` to look up merchant — less efficient, avoid
  - [x]Use Option A: Extend the transaction list data to include `merchantCreatedAt: Date | null` for each transaction
  - [x]Modify the transaction list hook to join merchant createdAt:
    ```typescript
    // In the transaction list data hook, for each transaction:
    const merchant = tx.merchantId ? merchantsMap.get(tx.merchantId) : null
    return { ...tx, merchantCreatedAt: merchant?.createdAt ?? null }
    ```
  - [x]Only show the badge when `merchantCreatedAt` is present AND `isNewMerchant()` returns true
  - [x]Test: Shows "New" badge next to merchant name for new merchants
  - [x]Test: Does not show badge for transactions without merchants
  - [x]Test: Does not show badge for transactions with established merchants
  - [x]Test: Uses `size="sm"` for compact display

- [x] Task 6: Add "New merchants" filter option to Merchants list (AC: #3)
  - [x]Modify `src/features/merchants/components/MerchantsList/index.tsx`
  - [x]Add a filter toggle or checkbox: "Show new only" alongside existing search and sort controls
  - [x]Implementation approach:
    ```typescript
    const [showNewOnly, setShowNewOnly] = useState(false)

    const filteredMerchants = useMemo(() => {
      let result = merchants
      if (searchQuery) {
        result = result.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      }
      if (showNewOnly) {
        result = result.filter(m => isNewMerchant(m.createdAt))
      }
      return result
    }, [merchants, searchQuery, showNewOnly])
    ```
  - [x]UI: Small toggle button or checkbox in the filter bar, e.g., `[New only]` as a toggle button
  - [x]When active, only merchants where `isNewMerchant(createdAt)` returns true are shown
  - [x]Filter integrates with existing search: both filters apply simultaneously
  - [x]Count updates: "3 new merchants" or "3 of 47 merchants (new only)"
  - [x]Test: Filters to show only new merchants when toggle active
  - [x]Test: Combines with search query
  - [x]Test: Shows updated count when filter active
  - [x]Test: Toggle off restores full list

- [x] Task 7: Write integration tests (AC: all)
  - [x]Test in Merchants list context:
    - Render MerchantsList with a mix of new and old merchants (mock Dexie data)
    - Verify new merchants show "New" badge
    - Verify old merchants do not show "New" badge
    - Toggle "New only" filter, verify only new merchants shown
    - Search + "New only" filter combined
  - [x]Test in Merchant detail context:
    - Render MerchantDetailPage for a new merchant
    - Verify "New" badge appears in header
    - Render MerchantDetailPage for an established merchant
    - Verify no "New" badge
  - [x]Test in Transaction list context:
    - Render TransactionList with transactions linked to new and old merchants
    - Verify "New" badge appears on rows with new merchant
    - Verify no badge on rows with old or no merchant
  - [x]Test badge lifecycle:
    - Mock a merchant with createdAt = 30 days ago → badge visible
    - Mock a merchant with createdAt = 31 days ago → badge not visible

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| New merchant detection | Computed from `createdAt` field | No new tables, no stored flags — pure computation |
| Badge rendering | Self-contained component | `NewMerchantBadge` checks `isNewMerchant()` internally, returns null if not new |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Utilities | camelCase file naming |
| Event handlers | `handle{Event}` naming |
| Props | `{ComponentName}Props` type |

### Data Model Context

**Source: [architecture.md#Data-Model], [Story 7.1 Dev Notes]**

The `merchants` table already has:
- `id`: primary key (UUID)
- `name`: string
- `defaultCategoryId`: string | null
- `createdAt`: Date — **this is the field we use for first-time detection**

**NO schema changes required.** Story 7.1 already ensured `createdAt` is part of both the Dexie schema and the `MerchantListItem` type.

The `transactions` table has:
- `merchantId`: string | null — FK to merchants (indexed)
- `categoryId`: string | null
- `date`: Date
- `amount`: number
- `rawMerchantString`: string

### Detection Logic

The "new merchant" detection is purely computational — no database flag needed:

```typescript
// 30-day threshold from merchant creation
const isNew = (now - merchant.createdAt) <= 30 days
```

**Why NOT store a flag:**
- A stored `isNew` flag would require a scheduled job to update it after 30 days
- Computing from `createdAt` is instant and always accurate
- No stale data risk
- Simpler schema, less mutation surface

### Badge Visual Design

**Source: [ux-design-specification.md], [epics.md#Story-7.3]**

The epics file mentions a "New" badge or indicator. Design approach:

| Context | Style | Placement |
|---------|-------|-----------|
| Merchant list row | `Badge` outline, small, blue/info color | After merchant name, before category badge |
| Merchant detail header | `Badge` outline, default size, blue/info color | Inline with merchant name (h1) |
| Transaction row | `Badge` outline, extra-small, blue/info color | After merchant name, compact to fit 48px row |

**Color choice:** Blue/info (not green/success or yellow/warning) to indicate "informational" status — the merchant is new, not necessarily good or bad. Using `border-blue-500/50 bg-blue-500/10 text-blue-500` for a soft, non-intrusive appearance that doesn't compete with category badges.

**Badge content:** Text "New" (not emoji). While the epics file mentions "🆕", using plain text "New" is cleaner, more professional, and more accessible.

### Previous Story Intelligence

**From Story 7.1 (Merchants List View):**
- `MerchantListItem` type already includes `createdAt: Date` field (explicitly prepared for this story)
- `MerchantListItem` component has a defined row layout with merchant name + category badge + stats
- Inserting a badge between name and category badge is straightforward
- Search and sort controls are in `MerchantsList` component
- `useMerchantsList` hook returns merchants with `createdAt` data
- Keyboard navigation (J/K) and filtering already work

**From Story 7.2 (Merchant Detail Page):**
- `MerchantHeader` component displays name + category — we add badge here
- `MerchantHeader` currently accepts `{ name, categoryLabel, onBack }` — need to add `createdAt` prop
- Stats cards already show "First seen" date — satisfies AC #5 (first seen still visible)
- `useMerchantDetail` hook returns full merchant object including `createdAt`

**From Story 3.1 (Transaction List View):**
- `TransactionRow` component (or equivalent) displays date, merchant string, amount, category
- Adding a small badge after the merchant name requires extending the data passed to each row
- The transaction data hook needs to join merchant `createdAt` info

### Integration Points — Minimal Changes to Existing Components

This story touches 3 existing components with **minimal, additive-only changes**:

| Component | Change | Risk |
|-----------|--------|------|
| `MerchantListItem` | Add `<NewMerchantBadge>` in name area | Low — additive only |
| `MerchantHeader` | Add `createdAt` prop + `<NewMerchantBadge>` | Low — new prop |
| `TransactionRow` | Add `merchantCreatedAt` to data + `<NewMerchantBadge size="sm">` | Medium — requires data hook change |

The transaction row change has medium risk because it requires modifying the transaction list's data fetching to include merchant creation dates. This should be done carefully to avoid performance regression.

### Transaction Row Data Strategy

To show the "New" badge on transaction rows, the transaction list needs merchant `createdAt` data.

**Recommended approach:**

In the transaction list data hook (likely `useTransactions` or similar), create a merchant lookup map:

```typescript
const merchantDetail = useLiveQuery(async () => {
  const allMerchants = await db.merchants.toArray()
  return new Map(allMerchants.map(m => [m.id, m]))
}, [])

// Then for each transaction:
const enrichedTransactions = transactions.map(tx => ({
  ...tx,
  merchantCreatedAt: tx.merchantId ? merchantDetail?.get(tx.merchantId)?.createdAt ?? null : null,
}))
```

**Performance:** Building a Map from merchants (typically <100 entries) is <1ms. The join per transaction is O(1) lookup. Total overhead for 10k transactions: <10ms. Well within the <100ms UI response target.

**Alternative (NOT recommended):** Having `NewMerchantBadge` do its own `useLiveQuery` per row. This would fire hundreds of queries and degrade performance.

### File Structure for This Story

```
src/
├── features/
│   └── merchants/
│       ├── utils/
│       │   ├── isNewMerchant.ts (new)
│       │   └── isNewMerchant.test.ts (new)
│       └── components/
│           ├── NewMerchantBadge/
│           │   ├── index.tsx (new)
│           │   └── NewMerchantBadge.test.tsx (new)
│           ├── MerchantListItem/
│           │   └── index.tsx (modify — add badge)
│           ├── MerchantsList/
│           │   └── index.tsx (modify — add "new only" filter)
│           └── MerchantHeader/
│               └── index.tsx (modify — add createdAt prop + badge)
├── components/
│   └── TransactionRow/
│       └── index.tsx (modify — add small badge for new merchants)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `Badge` | `src/components/ui/badge.tsx` | Badge component for "New" indicator |
| `cn` | `src/lib/utils/cn.ts` (or `@/lib/utils`) | Conditional class names |
| `formatRelativeTime` | Story 7.1 utility | Already used for "last seen" |
| `getCategoryLabel` | Category system (Story 4.1) | Category resolution |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |

### Existing Components — Minimal Changes

| Component | Change | Details |
|-----------|--------|---------|
| `MerchantListItem` | Add badge | Import `NewMerchantBadge`, render after name |
| `MerchantHeader` | Add prop + badge | Add `createdAt` prop, render badge after h1 name |
| `MerchantsList` | Add filter toggle | Add `showNewOnly` state, filter integration |
| `TransactionRow` | Add badge | Add `merchantCreatedAt` to row data, render badge |
| Transaction data hook | Add merchant join | Map merchants by ID, enrich transactions |

### No Existing Components That Should NOT Be Changed

| Component | Reason |
|-----------|--------|
| `MerchantStatsCards` | Already shows "First seen" date — no change needed |
| `MerchantRulesList` | Not related to merchant age |
| `MerchantTransactionList` (on detail page) | Transactions here already show under merchant context — adding badge would be redundant |
| `EditMerchantModal` | Not related to merchant age |
| `RuleEditModal` | Not related to merchant age |
| `CommandPalette` | Not affected |
| Layout/Sidebar | Not affected |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Impact of This Story |
|--------|--------|---------------------|
| Merchant list render | <100ms | `isNewMerchant()` is O(1) per merchant — negligible overhead |
| Transaction list render | <100ms | Merchant map lookup is O(1) per transaction — <10ms for 10k txns |
| Badge render | <1ms | Conditional component, returns null when not applicable |
| "New only" filter | <16ms | Synchronous JS filter, same as search |

### Edge Cases to Handle

1. **Merchant created exactly 30 days ago:** Should still show "New" badge (use `<=` comparison)
2. **Merchant with no `createdAt`:** Treat as not new (return false from `isNewMerchant`). This handles legacy data or edge cases.
3. **Transaction with no merchant:** Don't show any "New" badge — `merchantCreatedAt` will be null
4. **Transaction with deleted merchant:** `merchantId` exists but merchant was deleted — don't crash, just skip badge
5. **All merchants are new:** "New only" filter shows all merchants (same as no filter)
6. **No merchants are new:** "New only" filter shows empty state with message like "No new merchants"
7. **Timezone differences:** Use `Date` object comparison which handles timezone via UTC internally
8. **Browser clock skew:** Not a concern for local-only app — user's clock is the reference

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT store an `isNew` boolean field in the database — compute from `createdAt`
- DO NOT create a scheduled job or timer to update merchant status
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT add date libraries (date-fns, dayjs, moment) — use native JS Date
- DO NOT use emoji ("🆕") in the badge — use text "New" for accessibility and consistency
- DO NOT add `useLiveQuery` inside `NewMerchantBadge` — pass `createdAt` as prop
- DO NOT modify `MerchantStatsCards` — it already shows first seen date
- DO NOT add the "New" badge to the merchant detail page's transaction list — it would be redundant (the header already shows it)

### Validation Checklist

Before marking complete:
- [ ] `isNewMerchant()` utility works correctly with 30-day threshold
- [ ] `NewMerchantBadge` renders "New" for merchants < 30 days, null otherwise
- [ ] Merchants list shows "New" badge on recent merchants
- [ ] Merchants list has "New only" filter toggle
- [ ] "New only" filter combines with search query
- [ ] Merchant detail page header shows "New" badge for recent merchants
- [ ] Transaction rows show small "New" badge for transactions with new merchants
- [ ] Badge is not shown for transactions without merchants
- [ ] Badge disappears after 30 days (test with mocked dates)
- [ ] "First seen" date still visible on merchant detail stats cards
- [ ] No performance regression in merchants list or transaction list
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No new dependencies added
- [ ] Badge styling is visually distinct from category badges (blue/info vs default)
- [ ] Badge uses text "New" (not emoji)
- [ ] `createdAt` is not modified when merchant transactions are updated

### References

- [Source: epics.md#Epic-7-Story-7.3-First-Time-Merchant-Detection]
- [Source: prd.md#FR35 - System can identify first-time merchants (new to the user)]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, merchant data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, shadcn/ui]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Component-Density - 48px row height]
- [Source: ux-design-specification.md#Typography-System - Badge styling]
- [Story 7.1: Merchants List View - MerchantListItem type with createdAt, MerchantsList with search/sort/filter]
- [Story 7.2: Merchant Detail Page - MerchantHeader component, MerchantStatsCards with first seen date]
- [Story 3.1: Transaction List View - TransactionRow component, 48px dense rows]
- [Story 4.1: Category System Setup - getCategoryLabel utility]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fake timers incompatible with async IndexedDB operations in MerchantsList tests — resolved by using real dates relative to `new Date()` instead of `vi.setSystemTime()` for interaction-heavy tests

### Completion Notes List

- Created `isNewMerchant` utility with 30-day threshold, exported `NEW_MERCHANT_THRESHOLD_DAYS` constant
- Created `NewMerchantBadge` self-contained component with `size` prop (`sm`/`default`)
- Integrated badge into `MerchantListItem` (inline after name, before category badge)
- Added `createdAt` prop to `MerchantHeader` and rendered badge prominently next to h1
- Updated `MerchantDetailPage` to pass `createdAt` to `MerchantHeader`
- Added `merchantCreatedAt` prop to `TransactionRow` with `size="sm"` badge
- Built merchant lookup map in `TransactionList` for efficient O(1) per-row lookups
- Added "New only" toggle button to `MerchantsList` toolbar with combined search+filter support
- Updated count label to show "(new only)" suffix when filter is active
- All 974 tests pass (1 pre-existing failure in accounts.test.tsx due to jsdom DOMMatrix, unrelated)

### Change Log

- 2026-02-08: Implemented story 7-3 first-time merchant detection — all 7 tasks completed

### File List

New files:
- src/features/merchants/utils/isNewMerchant.ts
- src/features/merchants/utils/isNewMerchant.test.ts
- src/features/merchants/components/NewMerchantBadge/index.tsx
- src/features/merchants/components/NewMerchantBadge/NewMerchantBadge.test.tsx

Modified files:
- src/features/merchants/components/MerchantListItem/index.tsx
- src/features/merchants/components/MerchantListItem/MerchantListItem.test.tsx
- src/features/merchants/components/MerchantHeader/index.tsx
- src/features/merchants/components/MerchantHeader/MerchantHeader.test.tsx
- src/features/merchants/components/MerchantDetailPage/index.tsx
- src/features/merchants/components/MerchantsList/index.tsx
- src/features/merchants/components/MerchantsList/MerchantsList.test.tsx
- src/components/TransactionRow/index.tsx
- src/components/TransactionRow/TransactionRow.test.tsx
- src/features/transactions/components/TransactionList/index.tsx
