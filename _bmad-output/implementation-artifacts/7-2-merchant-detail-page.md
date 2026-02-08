# Story 7.2: Merchant Detail Page

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see a detailed page for each merchant showing stats, rules, and transactions**,
So that **I can investigate spending and manage rules for that merchant (FR33, FR34)**.

## Acceptance Criteria

1. **Given** I navigate to a merchant detail page
   **When** the page loads
   **Then** I see the merchant name prominently displayed
   **And** the default category is shown below the name
   **And** a back button/breadcrumb allows navigation back to `/merchants`

2. **Given** I view the merchant stats section
   **When** looking at the stats cards
   **Then** I see:
   - Total spent (all time)
   - Transaction count
   - Average transaction amount
   - Monthly average
   - First seen date
   - Last seen date (e.g., "3 days ago")

3. **Given** I view the month-over-month stat
   **When** there's enough data
   **Then** I see: "vs last month: +12%" or "-8%"
   **And** positive change (spending increased) is warning color
   **And** negative change (spending decreased) is success color

4. **Given** I view the Rules section
   **When** the merchant has rules
   **Then** I see all rules for this merchant in a list
   **And** each rule shows: pattern (monospace), match count, category (default or override)
   **And** each rule has an Edit button

5. **Given** I click Edit on a rule
   **When** the edit modal opens
   **Then** I can modify the pattern and category override
   **And** changes are saved with Undo toast

6. **Given** I want to add a new rule to this merchant
   **When** I click "+ Add Rule"
   **Then** a modal opens to add a new rule pattern
   **And** the merchant is pre-selected

7. **Given** I view the Transactions section
   **When** the merchant has transactions
   **Then** I see all transactions for this merchant
   **And** a time filter is available (default: All Time)
   **And** each transaction shows date, raw string, amount, category

8. **Given** the merchant has mixed categories
   **When** some rules have category overrides
   **Then** I see a note: "Mixed categories: X Shopping, Y Subscriptions"
   **And** explanation that override rules cause this (expected behavior)

9. **Given** I use keyboard on the merchant page
   **When** I press various keys
   **Then** `E` opens edit merchant modal (name, default category)
   **And** `D` changes default category
   **And** these shortcuts are shown in the page footer

## Tasks / Subtasks

- [x] Task 1: Create `useMerchantDetail` hook for data aggregation (AC: #1, #2, #3, #7, #8)
  - [x] Create `src/features/merchants/hooks/useMerchantDetail.ts`
  - [x] Create `src/features/merchants/hooks/useMerchantDetail.test.ts`
  - [x] Accept `merchantId: string` parameter
  - [x] Use `useLiveQuery` to load merchant, rules, and transactions from Dexie:
    ```typescript
    const merchant = await db.merchants.get(merchantId)
    const transactions = await db.transactions.where('merchantId').equals(merchantId).toArray()
    const rules = await db.rules.where('merchantId').equals(merchantId).toArray()
    ```
  - [x] Compute stats:
    ```typescript
    type MerchantStats = {
      totalSpent: number        // Math.abs(sum of negative amounts)
      transactionCount: number  // total transactions
      averageAmount: number     // totalSpent / expense count
      monthlyAverage: number    // totalSpent / distinct months with transactions
      firstSeen: Date | null    // earliest transaction date
      lastSeen: Date | null     // latest transaction date
      monthOverMonth: {
        amount: number          // current month total - previous month total
        percentage: number      // ((current - previous) / previous) * 100
        hasData: boolean        // false if no previous month data
      }
    }
    ```
  - [x] Compute category distribution:
    ```typescript
    type CategoryDistribution = Array<{
      categoryId: string | null
      categoryLabel: string
      count: number
    }>
    ```
  - [x] Compute rule match counts by regex-testing each rule pattern against merchant transactions
  - [x] Accept optional `timePeriod` filter for transactions section:
    ```typescript
    type TimePeriod = 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'all-time'
    ```
  - [x] Return type:
    ```typescript
    type MerchantDetailData = {
      merchant: Merchant | undefined
      stats: MerchantStats
      rules: RuleWithMatchCount[]
      transactions: Transaction[]
      categoryDistribution: CategoryDistribution
      isMixed: boolean
      isLoading: boolean
    }
    ```
  - [x] Test: Returns undefined merchant when ID not found
  - [x] Test: Computes totalSpent correctly (absolute value of negative amounts only)
  - [x] Test: Computes averageAmount as totalSpent / expense count
  - [x] Test: Computes monthlyAverage across distinct months
  - [x] Test: Returns firstSeen and lastSeen dates correctly
  - [x] Test: Computes month-over-month change correctly
  - [x] Test: Returns hasData=false when no previous month data
  - [x] Test: Returns correct category distribution
  - [x] Test: isMixed=true when multiple categories present
  - [x] Test: Filters transactions by timePeriod
  - [x] Test: Returns rule match counts correctly

- [x] Task 2: Create `MerchantHeader` component (AC: #1)
  - [x] Create `src/features/merchants/components/MerchantHeader/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantHeader/MerchantHeader.test.tsx`
  - [x] Display:
    - Back link: "← Merchants" using `useNavigate()` to go to `/merchants`
    - Merchant name as `h1` (`text-2xl font-bold`)
    - Default category as Badge below name (using `getCategoryLabel()`)
    - "Uncategorized" in muted style if no default category
  - [x] Props:
    ```typescript
    type MerchantHeaderProps = {
      name: string
      categoryLabel: string
      onBack: () => void
    }
    ```
  - [x] Test: Renders merchant name and category
  - [x] Test: Calls onBack when back button clicked
  - [x] Test: Shows "Uncategorized" when no category

- [x] Task 3: Create `MerchantStatsCards` component (AC: #2, #3)
  - [x] Create `src/features/merchants/components/MerchantStatsCards/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantStatsCards/MerchantStatsCards.test.tsx`
  - [x] 4-column grid of shadcn `Card` components:
    ```
    ┌─────────────┬─────────────┬─────────────┬─────────────┐
    │ Total Spent │ Transactions│   Average   │  Last Seen  │
    │  €1,247.50  │     34      │   €36.69    │  3 days ago │
    └─────────────┴─────────────┴─────────────┴─────────────┘
    ```
  - [x] Below cards: "Monthly avg: €156.88 | First seen: Jan 2024"
  - [x] Month-over-month line: "vs last month: +€150 (+12%)" or "-€75 (-8%)"
    - Increase: `text-warning` color + `TrendingUp` icon (lucide)
    - Decrease: `text-success` color + `TrendingDown` icon (lucide)
    - No data: "No previous data" in `text-muted-foreground`
  - [x] Use `formatCurrency()` for amounts, `formatRelativeTime()` for last seen
  - [x] Props: `{ stats: MerchantStats }`
  - [x] Responsive: 4 columns desktop, 2 columns tablet, stacked mobile
  - [x] Test: Renders all stat values
  - [x] Test: Correct color for positive/negative month-over-month
  - [x] Test: Handles hasData=false

- [x] Task 4: Create `MerchantRulesList` component (AC: #4, #5, #6)
  - [x] Create `src/features/merchants/components/MerchantRulesList/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantRulesList/MerchantRulesList.test.tsx`
  - [x] Section header: "Matching Rules" with "+ Add" button
  - [x] Each rule row:
    ```
    │ AMZN.*              │ 28 matches │ (default)           │ [Edit] │
    │ AMAZON PRIME.*      │  2 matches │ → Subscriptions     │ [Edit] │
    ```
  - [x] Pattern: `font-mono text-sm`
  - [x] Match count: `text-muted-foreground`
  - [x] Category: "(default)" or "→ CategoryName"
  - [x] Empty state: "No rules defined" with "+ Add Rule" CTA
  - [x] Props:
    ```typescript
    type RuleWithMatchCount = {
      id: number
      pattern: string
      categoryId: string | null
      categoryLabel: string
      matchCount: number
      isDefault: boolean
    }

    type MerchantRulesListProps = {
      rules: RuleWithMatchCount[]
      onEditRule: (ruleId: number) => void
      onAddRule: () => void
    }
    ```
  - [x] Test: Renders rules with pattern, match count, category indicator
  - [x] Test: "(default)" for null categoryId, "→ Name" for overrides
  - [x] Test: Calls onEditRule/onAddRule

- [x] Task 5: Create `RuleEditModal` component (AC: #5, #6)
  - [x] Create `src/features/merchants/components/RuleEditModal/index.tsx`
  - [x] Create `src/features/merchants/components/RuleEditModal/RuleEditModal.test.tsx`
  - [x] Uses shadcn `Dialog`
  - [x] Mode: "edit" (existing rule) or "add" (new rule, when `rule` prop is null)
  - [x] Fields:
    - Pattern input (`font-mono`, regex validated live)
    - Category: radio "Use merchant default" / "Override" with category picker
    - Live match count preview
  - [x] Regex validation: `try { new RegExp(pattern) }` — show inline error if invalid
  - [x] On save (edit): `db.rules.update(ruleId, { pattern, categoryId })` + re-apply + toast with Undo
  - [x] On save (add): `db.rules.add(...)` + apply to matching transactions + toast with Undo
  - [x] On delete (edit only): confirmation → `db.rules.delete(ruleId)` → unlink transactions → toast with Undo
  - [x] Keyboard: Enter to confirm, Esc to cancel
  - [x] Props:
    ```typescript
    type RuleEditModalProps = {
      isOpen: boolean
      onClose: () => void
      merchantId: string
      merchantName: string
      rule: RuleWithMatchCount | null // null = add mode
    }
    ```
  - [x] Test: Edit mode pre-fills, add mode empty
  - [x] Test: Validates regex
  - [x] Test: Shows live match count
  - [x] Test: Save and delete flows

- [x] Task 6: Create `MerchantTransactionList` component (AC: #7, #8)
  - [x] Create `src/features/merchants/components/MerchantTransactionList/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantTransactionList/MerchantTransactionList.test.tsx`
  - [x] Section header: "Transactions" with time period `Select` on right
  - [x] Time periods: This Month, Last Month, Last 3 Months, This Year, All Time (default)
  - [x] Transaction rows: date | raw merchant string | amount (mono) | category badge
  - [x] Row height: 48px (dense), reuse Epic 3 styling patterns
  - [x] Mixed category note when `isMixed`:
    ```
    ⚠ Mixed categories: 32 Shopping, 2 Subscriptions
       This is expected — override rules assign different categories
    ```
  - [x] Empty state: "No transactions for this period"
  - [x] Props:
    ```typescript
    type MerchantTransactionListProps = {
      transactions: Transaction[]
      categoryDistribution: CategoryDistribution
      isMixed: boolean
      timePeriod: TimePeriod
      onTimePeriodChange: (period: TimePeriod) => void
    }
    ```
  - [x] Test: Renders transactions, filters by period, shows/hides mixed note

- [x] Task 7: Create `EditMerchantModal` component (AC: #9)
  - [x] Create `src/features/merchants/components/EditMerchantModal/index.tsx`
  - [x] Create `src/features/merchants/components/EditMerchantModal/EditMerchantModal.test.tsx`
  - [x] shadcn `Dialog` with fields: merchant name (required), default category picker
  - [x] Pre-filled with current data
  - [x] On save: `db.merchants.update(merchantId, { name, defaultCategoryId })` + toast with Undo
  - [x] Props:
    ```typescript
    type EditMerchantModalProps = {
      isOpen: boolean
      onClose: () => void
      merchantId: string
      currentName: string
      currentCategoryId: string | null
    }
    ```
  - [x] Test: Pre-fills, validates name, saves changes

- [x] Task 8: Assemble `MerchantDetailPage` and wire route (AC: all)
  - [x] Create `src/features/merchants/components/MerchantDetailPage/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantDetailPage/MerchantDetailPage.test.tsx`
  - [x] Update `src/routes/merchants/$merchantId.tsx` — replace Story 7.1 placeholder
  - [x] Extract `merchantId` from route params via `useParams()`
  - [x] Compose: Header → StatsCards → RulesList → TransactionList → Footer shortcuts
  - [x] Local state: `timePeriod`, `editingRuleId`, `isAddingRule`, `isEditingMerchant`
  - [x] Keyboard shortcuts (E/D) with input/modal guard
  - [x] Footer: `[E] Edit Merchant  [D] Change Default  [+ Add Rule]`
  - [x] Breadcrumb: "Merchants > {Merchant Name}"
  - [x] Loading: skeleton matching final layout
  - [x] 404: "Merchant not found" with back link
  - [x] Sidebar: "Merchants" stays highlighted (TanStack Router handles `/merchants/*`)

- [x] Task 9: Write integration tests (AC: all)
  - [x] Full page render with mock Dexie data (merchant + rules + transactions)
  - [x] Stats display correctly
  - [x] Edit rule flow: click Edit → modify → save → verify
  - [x] Add rule flow: click "+ Add" → fill → save → verify
  - [x] Time period filter changes transaction list
  - [x] E key opens edit modal, D opens category change
  - [x] Breadcrumb back navigation
  - [x] Mixed categories note appears when applicable
  - [x] 404 for non-existent merchant

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Route Params | TanStack Router `useParams()` | Type-safe extraction of `$merchantId` |
| Stats | Computed on-the-fly from transactions | No pre-computed stats table |
| Mutations | Direct Dexie writes | `db.rules.update()`, `db.merchants.update()` |
| Undo | Toast with 10-second undo window | Command pattern per architecture |

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

**Source: [architecture.md#Data-Model], [Story 7.1 Dev Notes]**

The `merchants` table:
- `id`: primary key (UUID)
- `name`: string
- `defaultCategoryId`: string | null
- `createdAt`: Date

The `transactions` table:
- `merchantId`: string | null — FK to merchants (indexed)
- `categoryId`: string | null
- `date`: Date
- `amount`: number — negative for expenses
- `rawMerchantString`: string

The `rules` table:
- `id`: auto-increment primary key
- `merchantId`: string — FK to merchants (indexed)
- `pattern`: string — regex pattern
- `categoryId`: string | null — category override (null = use merchant default)
- `createdAt`: Date

### Stats Computation Strategy

Single `useLiveQuery` loads merchant + transactions + rules, computes all stats inline:

```typescript
const merchantDetail = useLiveQuery(async () => {
  const merchant = await db.merchants.get(merchantId)
  if (!merchant) return undefined

  const transactions = await db.transactions
    .where('merchantId').equals(merchantId).toArray()
  const rules = await db.rules
    .where('merchantId').equals(merchantId).toArray()

  const expenses = transactions.filter(tx => tx.amount < 0)
  const totalSpent = Math.abs(expenses.reduce((sum, tx) => sum + tx.amount, 0))

  // Rule match counts
  const rulesWithCounts = rules.map(rule => {
    let matchCount = 0
    try {
      const regex = new RegExp(rule.pattern, 'i')
      matchCount = transactions.filter(tx => regex.test(tx.rawMerchantString)).length
    } catch { matchCount = 0 }
    return {
      ...rule, matchCount,
      isDefault: rule.categoryId === null,
      categoryLabel: rule.categoryId ? getCategoryLabel(rule.categoryId) : '(default)',
    }
  })

  // Month-over-month
  const now = new Date()
  const currentMonthExpenses = expenses.filter(tx =>
    tx.date.getMonth() === now.getMonth() && tx.date.getFullYear() === now.getFullYear()
  )
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthExpenses = expenses.filter(tx =>
    tx.date.getMonth() === prevDate.getMonth() && tx.date.getFullYear() === prevDate.getFullYear()
  )
  const currentTotal = Math.abs(currentMonthExpenses.reduce((s, t) => s + t.amount, 0))
  const prevTotal = Math.abs(prevMonthExpenses.reduce((s, t) => s + t.amount, 0))

  // Monthly average
  const distinctMonths = new Set(expenses.map(tx => `${tx.date.getFullYear()}-${tx.date.getMonth()}`))
  const monthlyAverage = distinctMonths.size > 0 ? totalSpent / distinctMonths.size : 0

  // Category distribution
  const catCounts = new Map<string | null, number>()
  for (const tx of transactions) {
    catCounts.set(tx.categoryId, (catCounts.get(tx.categoryId) ?? 0) + 1)
  }
  const categoryDistribution = Array.from(catCounts.entries()).map(([catId, count]) => ({
    categoryId: catId,
    categoryLabel: getCategoryLabel(catId),
    count,
  }))

  return {
    merchant,
    rules: rulesWithCounts,
    transactions,
    stats: {
      totalSpent,
      transactionCount: transactions.length,
      averageAmount: expenses.length > 0 ? totalSpent / expenses.length : 0,
      monthlyAverage,
      firstSeen: transactions.length > 0
        ? new Date(Math.min(...transactions.map(tx => new Date(tx.date).getTime())))
        : null,
      lastSeen: transactions.length > 0
        ? new Date(Math.max(...transactions.map(tx => new Date(tx.date).getTime())))
        : null,
      monthOverMonth: {
        amount: currentTotal - prevTotal,
        percentage: prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0,
        hasData: prevTotal > 0,
      },
    },
    categoryDistribution,
    isMixed: categoryDistribution.length > 1,
  }
}, [merchantId])
```

### Time Period Filtering

```typescript
type TimePeriod = 'this-month' | 'last-month' | 'last-3-months' | 'this-year' | 'all-time'

const filterByTimePeriod = (transactions: Transaction[], period: TimePeriod): Transaction[] => {
  const now = new Date()
  switch (period) {
    case 'this-month':
      return transactions.filter(tx => {
        const d = new Date(tx.date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
    case 'last-month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return transactions.filter(tx => {
        const d = new Date(tx.date)
        return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear()
      })
    }
    case 'last-3-months': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return transactions.filter(tx => new Date(tx.date) >= start)
    }
    case 'this-year':
      return transactions.filter(tx => new Date(tx.date).getFullYear() === now.getFullYear())
    case 'all-time':
    default:
      return transactions
  }
}
```

### Rule Edit/Add Mutation with Undo

```typescript
const handleSaveRule = async (ruleData: { pattern: string; categoryId: string | null }) => {
  if (editingRule) {
    // Edit: store previous state for undo
    const prev = { pattern: editingRule.pattern, categoryId: editingRule.categoryId }
    await db.rules.update(editingRule.id, ruleData)
    toast({
      title: 'Rule updated',
      action: <ToastAction onClick={() => db.rules.update(editingRule.id, prev)}>Undo</ToastAction>,
    })
  } else {
    // Add: insert rule + apply to matching transactions
    const ruleId = await db.rules.add({
      merchantId, ...ruleData, createdAt: new Date(),
    })
    const regex = new RegExp(ruleData.pattern, 'i')
    const matching = await db.transactions
      .filter(tx => !tx.merchantId && regex.test(tx.rawMerchantString))
      .toArray()
    if (matching.length > 0) {
      await db.transactions.bulkUpdate(
        matching.map(tx => ({
          key: tx.id!,
          changes: {
            merchantId,
            categoryId: ruleData.categoryId ?? merchant.defaultCategoryId,
          },
        }))
      )
    }
    toast({
      title: `Rule added: ${matching.length} transactions matched`,
      action: <ToastAction onClick={async () => {
        await db.rules.delete(ruleId)
        // Restore transactions to unmatched
      }}>Undo</ToastAction>,
    })
  }
}
```

### Keyboard Shortcuts

```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (isAnyModalOpen) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  switch (e.key) {
    case 'e':
    case 'E':
      e.preventDefault()
      setIsEditingMerchant(true)
      break
    case 'd':
    case 'D':
      e.preventDefault()
      setIsEditingMerchant(true) // Focus category field after open
      break
  }
}, [isAnyModalOpen])

useEffect(() => {
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [handleKeyDown])
```

### UX Layout

**Source: [ux-design-specification.md#Merchant-Page]**

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Merchants                                                     │
├─────────────────────────────────────────────────────────────────┤
│  Amazon                                                         │
│  Default: Shopping > Online                                     │
│                                                                 │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│  │ Total Spent │ Transactions│   Average   │  Last Seen  │     │
│  │  €1,247.50  │     34      │   €36.69    │  3 days ago │     │
│  └─────────────┴─────────────┴─────────────┴─────────────┘     │
│  Monthly avg: €156.88    │    vs last month: +12%               │
│  First seen: Jan 2024                                           │
│                                                                 │
│  Matching Rules                                      [+ Add]    │
│  ───────────────────────────────────────────────────────────    │
│  │ AMZN.*              │ 28 matches │ (default)      │ [Edit]│  │
│  │ AMAZON\.COM.*       │  4 matches │ (default)      │ [Edit]│  │
│  │ AMAZON PRIME.*      │  2 matches │ → Subscriptions│ [Edit]│  │
│                                                                 │
│  Transactions                                   [All Time ▼]    │
│  ───────────────────────────────────────────────────────────    │
│  │ Jan 18 │ AMZN*1234XYZ      │  €29.99  │ Shopping        │   │
│  │ Jan 15 │ AMZN*5678ABC      │  €15.00  │ Shopping        │   │
│  │ Jan 12 │ AMAZON PRIME      │  €14.99  │ Subscriptions   │   │
│  │ Jan 08 │ AMAZON.COM/BILL   │  €42.50  │ Shopping        │   │
│                                                                 │
│  ⚠ Mixed categories: 32 Shopping, 2 Subscriptions              │
│     This is expected — override rules assign different          │
│     categories                                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [E] Edit Merchant    [D] Change Default    [+ Add Rule]        │
└─────────────────────────────────────────────────────────────────┘
```

**Styling tokens:**
- Merchant name: `text-2xl font-bold`
- Category badge: shadcn `Badge`
- Stats card values: `font-mono text-xl font-semibold` for amounts
- Stats card labels: `text-sm text-muted-foreground`
- Rule patterns: `font-mono text-sm`
- Rule rows: ~40px height, hover reveals Edit
- Transaction rows: 48px (dense mode), same patterns as Epic 3
- Footer shortcuts: `text-xs text-muted-foreground` with `<kbd>` badges
- Section gaps: `space-8` (32px)
- Card padding: `space-6` (24px)
- Month-over-month increase: `text-destructive` + `TrendingUp` (lucide)
- Month-over-month decrease: `text-green-500` + `TrendingDown` (lucide)

### Project Structure Notes

**New files:**
```
src/
├── routes/merchants/$merchantId.tsx (update — replace Story 7.1 placeholder)
├── features/merchants/
│   ├── components/
│   │   ├── MerchantDetailPage/     index.tsx + test
│   │   ├── MerchantHeader/         index.tsx + test
│   │   ├── MerchantStatsCards/     index.tsx + test
│   │   ├── MerchantRulesList/      index.tsx + test
│   │   ├── MerchantTransactionList/ index.tsx + test
│   │   ├── RuleEditModal/          index.tsx + test
│   │   └── EditMerchantModal/      index.tsx + test
│   └── hooks/
│       ├── useMerchantDetail.ts + test
```

**Existing files — NO changes needed:**

| Component | Reason |
|-----------|--------|
| Layout/Sidebar | Already handles `/merchants/*` active state |
| MerchantsPage (list) | Independent — Story 7.1 |
| MerchantListItem | Independent — Story 7.1 |
| useMerchantsList | Independent — Story 7.1 |
| CommandPalette | Independent |

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` | `src/lib/db/index.ts` | Dexie instance |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `getCategoryLabel` | Category system (Story 4.1) | Category ID → "Category > Sub" |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |
| `formatRelativeTime` | Story 7.1 utility | "3 days ago" |
| Badge, Card, Dialog, Select, Button, toast, Input | `src/components/ui/` | shadcn components |
| Breadcrumb pattern | Story 3.5 | Navigation breadcrumbs |

### Previous Story Intelligence (7.1)

Patterns to follow from Story 7.1:
- `MerchantListItem` type includes `createdAt` for future 7.3 badge
- `getCategoryLabel()` returns "Category > Subcategory" format
- `formatRelativeTime()` for relative dates
- `formatCurrency()` for monetary amounts
- Keyboard guard: check `document.activeElement` before handling shortcuts
- `useLiveQuery` with inline async function
- Route placeholder `$merchantId.tsx` already exists — just replace contents

### Performance Requirements

| Metric | Target |
|--------|--------|
| Page load | <100ms after route transition |
| Stats computation | <50ms (single merchant, <500 txns) |
| Rule match counts | <50ms (regex test per rule) |
| Time period filter | <16ms (synchronous JS) |
| Modal open | <16ms |

### Edge Cases

1. **Merchant not found:** "Merchant not found" + back link
2. **0 transactions:** Stats show zeros, empty transaction list
3. **0 rules:** "No rules defined" + "+ Add Rule" CTA
4. **Invalid regex in saved rule:** Show "0 matches" + error indicator, allow editing to fix
5. **1 transaction:** averageAmount = totalSpent, monthlyAverage = totalSpent
6. **0 expenses (only positive):** totalSpent = 0, guard division by zero
7. **All same category:** isMixed = false, hide mixed note
8. **Rule matches 0 transactions:** Show "0 matches", don't hide rule
9. **Very long merchant name:** Allow wrapping on detail page (unlike truncation in list)
10. **Concurrent edits:** `useLiveQuery` auto-updates on Dexie changes

### Anti-Patterns to AVOID

- DO NOT store detail data in React state — use `useLiveQuery`
- DO NOT create aggregate stats tables — compute on the fly
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT add date libraries — use native JS
- DO NOT add charting libraries — use Card components with text
- DO NOT modify Story 7.1 components
- DO NOT add virtualization unless >500 transactions per merchant

### References

- [Source: epics.md#Epic-7-Story-7.2-Merchant-Detail-Page]
- [Source: prd.md#FR33 - Merchant detail page showing all transactions]
- [Source: prd.md#FR34 - Total spent and transaction count per merchant]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface]
- [Source: architecture.md#Frontend-Architecture - TanStack Router useParams()]
- [Source: architecture.md#Project-Structure - routes/merchants/$merchantId]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, TanStack Router ^1.153]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: ux-design-specification.md#Merchant-Page - Full wireframe]
- [Source: ux-design-specification.md#Keyboard-Patterns - E/D shortcuts]
- [Source: ux-design-specification.md#Modal-Patterns - Dialog structure]
- [Source: ux-design-specification.md#Feedback-Patterns - Toast with undo]
- [Source: ux-design-specification.md#Typography-System - JetBrains Mono]
- [Source: ux-design-specification.md#Color-System - Warning/success colors]
- [Story 7.1: Merchants List View - formatRelativeTime, getCategoryLabel, route placeholder]
- [Story 4.1: Category System Setup - DEFAULT_CATEGORIES, getCategoryLabel()]
- [Story 4.3: Create Merchant with Rule - Rule creation patterns]
- [Story 4.6: View and Manage Rules - Rule edit/delete with undo]
- [Story 3.5: Breadcrumb Navigation - Breadcrumb integration]
- [Story 3.1: Transaction List View - 48px dense row styling]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation.

### Completion Notes List

- Created `useMerchantDetail` hook with comprehensive stats computation (totalSpent, averageAmount, monthlyAverage, firstSeen, lastSeen, month-over-month, category distribution, rule match counts, time period filtering)
- Created `MerchantHeader` component with back navigation, merchant name, and category badge
- Created `MerchantStatsCards` component with 4-column responsive grid showing stats, monthly average, first seen, and month-over-month trend with color-coded indicators
- Created `MerchantDetailRules` component (new name to avoid conflict with existing `MerchantRulesList` from Story 4.4) with rule list, match counts, category indicators, edit/add buttons
- Created `RuleDetailModal` component supporting both edit and add modes with regex validation, category override picker, live match preview, and delete functionality
- Created `MerchantTransactionList` component with time period Select filter, transaction rows, and mixed categories warning note
- Created `EditMerchantModal` component with name editing, category picker, and undo toast
- Assembled `MerchantDetailPage` composing all components with keyboard shortcuts (E/D), local state management, loading skeleton, and 404 handling
- Updated route file `merchants.$merchantId.tsx` to render the detail page
- Updated `useBreadcrumbs` hook to resolve merchant names for `/merchants/$merchantId` paths
- Reused existing services: `useRuleMutations`, `addRuleToMerchant`, `undoAddRule` from rules feature
- All existing tests (951) continue to pass — no regressions

### Implementation Notes

- Story specified IDs as `string` but actual DB uses auto-increment `number` IDs — adapted accordingly
- Story specified `categoryId: string | null` on rules but actual type is `categoryOverride?: number` — adapted
- Named the detail rules component `MerchantDetailRules` instead of overwriting existing `MerchantRulesList` from Story 4.4 which is used by `MerchantAssignmentModal`
- No `getCategoryLabel()` utility exists — built category labels inline using category map pattern from `useMerchantsList`
- No `Skeleton` UI component existed — used `animate-pulse` with `bg-muted` divs

### File List

**New files:**
- src/features/merchants/hooks/useMerchantDetail.ts
- src/features/merchants/hooks/useMerchantDetail.test.ts
- src/features/merchants/components/MerchantHeader/index.tsx
- src/features/merchants/components/MerchantHeader/MerchantHeader.test.tsx
- src/features/merchants/components/MerchantStatsCards/index.tsx
- src/features/merchants/components/MerchantStatsCards/MerchantStatsCards.test.tsx
- src/features/merchants/components/MerchantDetailRules/index.tsx
- src/features/merchants/components/MerchantDetailRules/MerchantDetailRules.test.tsx
- src/features/merchants/components/RuleDetailModal/index.tsx
- src/features/merchants/components/RuleDetailModal/RuleDetailModal.test.tsx
- src/features/merchants/components/MerchantTransactionList/index.tsx
- src/features/merchants/components/MerchantTransactionList/MerchantTransactionList.test.tsx
- src/features/merchants/components/EditMerchantModal/index.tsx
- src/features/merchants/components/EditMerchantModal/EditMerchantModal.test.tsx
- src/features/merchants/components/MerchantDetailPage/index.tsx
- src/features/merchants/components/MerchantDetailPage/MerchantDetailPage.test.tsx

**Modified files:**
- src/routes/merchants.$merchantId.tsx (replaced placeholder with MerchantDetailPage)
- src/hooks/useBreadcrumbs.ts (added merchant name resolution for detail route)

**Change Log:**
- 2026-02-08: Implemented Story 7.2 — Merchant Detail Page with all 9 tasks complete
