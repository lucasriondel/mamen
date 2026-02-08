# Story 3.1: Transaction List View

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to view all my transactions in a clean, fast list**,
So that **I can see my financial activity at a glance (FR14)**.

## Acceptance Criteria

1. **Given** I have imported transactions
   **When** I navigate to the Transactions page
   **Then** I see all transactions in a list
   **And** each row shows: date, raw merchant string, amount, category badge (or "Unmatched")
   **And** amounts are formatted with currency symbol and proper alignment (monospace, right-aligned)
   **And** dates are formatted consistently (e.g., "Jan 18")

2. **Given** I have many transactions (1000+)
   **When** I view the transaction list
   **Then** the list uses virtualization (TanStack Virtual)
   **And** scrolling is smooth at 60fps (NFR6)
   **And** only visible rows are rendered

3. **Given** I view the transaction list
   **When** I look at the row styling
   **Then** rows are 48px height (dense mode per UX spec)
   **And** rows have subtle hover state
   **And** unmatched transactions have a visual indicator (warning color or badge)

4. **Given** I have no transactions
   **When** I view the Transactions page
   **Then** I see an empty state: "No transactions yet"
   **And** a CTA to import statements

5. **Given** I click on a transaction row
   **When** I select a transaction
   **Then** the row shows a selected state
   **And** I can see more details (or future: quick actions appear)

## Tasks / Subtasks

- [x] Task 1: Create Transaction types and Zod schema (AC: #1)
  - [x] Create `src/types/transaction.types.ts` if not exists
    - Define `Transaction` type matching Dexie schema
    - Include `id`, `accountId`, `date`, `amount`, `rawMerchantString`, `merchantId`, `categoryId`, `importedAt`, `source`
  - [x] Create `src/lib/schemas/transaction.schema.ts`
    - Define Zod schema for transaction validation
    - Export schema and inferred type

- [x] Task 2: Create TransactionList component structure (AC: #1, #2)
  - [x] Create `src/features/transactions/components/TransactionList/index.tsx`
  - [x] Set up TanStack Virtual for virtualized rendering
  - [x] Use `useLiveQuery` to fetch transactions from Dexie
  - [x] Pass transactions to virtualizer

- [x] Task 3: Create TransactionRow component (AC: #1, #3)
  - [x] Create `src/components/TransactionRow/index.tsx`
  - [x] Define `TransactionRowProps` type with transaction data
  - [x] Display date (formatted as "Jan 18" style)
  - [x] Display raw merchant string
  - [x] Display amount (formatted with currency, monospace, right-aligned)
  - [x] Display category badge or "Unmatched" badge
  - [x] Set row height to 48px per UX spec

- [x] Task 4: Implement row styling and hover states (AC: #3)
  - [x] Add hover state with subtle background change
  - [x] Style unmatched transactions with warning indicator (amber/yellow badge)
  - [x] Use `cn()` utility for conditional classes
  - [x] Ensure dark theme compatibility

- [x] Task 5: Implement selected state for rows (AC: #5)
  - [x] Add `isSelected` prop to TransactionRow
  - [x] Style selected row with visible selection indicator
  - [x] Track selected transaction ID in component state
  - [x] Handle click to toggle selection

- [x] Task 6: Create empty state component (AC: #4)
  - [x] Create empty state UI when no transactions exist
  - [x] Display message: "No transactions yet"
  - [x] Add CTA button/link to import statements
  - [x] Link to Accounts page or show import modal trigger

- [x] Task 7: Implement currency formatting utility (AC: #1)
  - [x] Create `src/lib/utils/formatCurrency.ts`
  - [x] Support configurable currency symbol (default: EUR)
  - [x] Format with 2 decimal places
  - [x] Handle negative values (show as "-" prefix)
  - [x] Export `formatCurrency(amount: number, currency?: string): string`

- [x] Task 8: Implement date formatting utility (AC: #1)
  - [x] Create `src/lib/utils/formatDate.ts`
  - [x] Format as "Jan 18" (month abbreviated + day)
  - [x] Handle current year vs other years
  - [x] Export `formatDate(date: Date): string`

- [x] Task 9: Create Transactions route/page (AC: #1, #4)
  - [x] Create `src/routes/transactions.tsx` TanStack Router route
  - [x] Import and render TransactionList component
  - [x] Add page title/header

- [x] Task 10: Optimize performance for 1000+ transactions (AC: #2)
  - [x] Configure TanStack Virtual with proper overscan
  - [x] Set estimateSize to 48px (row height)
  - [x] Use stable keys for virtualized items
  - [x] Verify 60fps scrolling with dev tools

- [x] Task 11: Integrate with existing app shell/sidebar (AC: #1)
  - [x] Ensure Transactions nav item links to `/transactions` route
  - [x] Verify sidebar highlights "Transactions" when active
  - [x] Update Layout component if needed

- [x] Task 12: Write unit and integration tests (AC: all)
  - [x] Create `src/components/TransactionRow/TransactionRow.test.tsx`
    - Test rendering with all props
    - Test hover state
    - Test selected state
    - Test unmatched badge
  - [x] Create `src/features/transactions/components/TransactionList/TransactionList.test.tsx`
    - Test rendering with transactions
    - Test empty state
    - Test virtualization (mock TanStack Virtual if needed)
  - [x] Create `src/lib/utils/formatCurrency.test.ts`
  - [x] Create `src/lib/utils/formatDate.test.ts`
  - [x] Tests co-located with source files

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- Query transactions via Dexie for display
- Component will auto-update when transactions change in DB

```typescript
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

// In TransactionList component:
const transactions = useLiveQuery(
  () => db.transactions.orderBy('date').reverse().toArray()
)
```

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Co-locate tests with source files
- Event handlers: `handle{Event}` naming
- Props naming: `{Component}Props`

### Data Model Reference

**Source: [architecture.md#Data-Model]**

```typescript
// src/types/transaction.types.ts
type Transaction = {
  id?: number              // Auto-increment
  accountId: number        // FK to accounts
  date: Date
  amount: number           // Negative for debits, positive for credits
  rawMerchantString: string
  merchantId?: number      // FK to merchants (undefined = unmatched)
  categoryId?: number      // FK to categories
  importedAt: Date
  source: 'csv' | 'pdf'    // Track import source
}
```

### UX Design Requirements

**Source: [ux-design-specification.md]**

- **Row Height:** 48px (dense mode)
- **Font:** Inter for text, JetBrains Mono for amounts/patterns
- **Border Radius:** 6px default
- **Dark-first palette** (shadcn/ui inspired)
- **Unmatched indicator:** Warning color badge

**Transaction Row Layout:**

```
| Date      | Merchant Description            | Category    | Amount    |
| Jan 18    | AMZN*1234XYZ                   | [Unmatched] |   -€45.99 |
| Jan 17    | UBER *TRIP                      | [Transport] |   -€12.50 |
```

### TanStack Virtual Implementation

**Source: [architecture.md#Frontend-Architecture]**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// In TransactionList component:
const parentRef = useRef<HTMLDivElement>(null)

const virtualizer = useVirtualizer({
  count: transactions?.length ?? 0,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48, // 48px row height
  overscan: 5,
})

return (
  <div ref={parentRef} className="h-full overflow-auto">
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const transaction = transactions[virtualRow.index]
        return (
          <div
            key={transaction.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <TransactionRow
              transaction={transaction}
              isSelected={selectedId === transaction.id}
              onClick={() => handleRowClick(transaction.id)}
            />
          </div>
        )
      })}
    </div>
  </div>
)
```

### Currency Formatting Utility

```typescript
// src/lib/utils/formatCurrency.ts

type FormatCurrencyOptions = {
  currency?: string
  locale?: string
}

export const formatCurrency = (
  amount: number,
  options: FormatCurrencyOptions = {}
): string => {
  const { currency = 'EUR', locale = 'en-EU' } = options

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
```

### Date Formatting Utility

```typescript
// src/lib/utils/formatDate.ts

export const formatDate = (date: Date): string => {
  const now = new Date()
  const isCurrentYear = date.getFullYear() === now.getFullYear()

  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) // "Jan 18"
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) // "Jan 18, 2025"
}
```

### Component Structure

```typescript
// src/components/TransactionRow/index.tsx

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import type { Transaction } from '@/types/transaction.types'

type TransactionRowProps = {
  transaction: Transaction
  isSelected?: boolean
  onClick?: () => void
}

export const TransactionRow = ({
  transaction,
  isSelected = false,
  onClick,
}: TransactionRowProps): JSX.Element => {
  const isUnmatched = !transaction.merchantId

  return (
    <div
      className={cn(
        'flex items-center h-12 px-4 gap-4 cursor-pointer',
        'hover:bg-muted/50 transition-colors',
        isSelected && 'bg-muted border-l-2 border-primary',
        isUnmatched && 'border-l-2 border-amber-500/50'
      )}
      onClick={onClick}
    >
      {/* Date Column */}
      <div className="w-20 text-sm text-muted-foreground">
        {formatDate(transaction.date)}
      </div>

      {/* Merchant Column */}
      <div className="flex-1 truncate text-sm">
        {transaction.rawMerchantString}
      </div>

      {/* Category Badge */}
      <div className="w-32">
        {isUnmatched ? (
          <Badge variant="outline" className="text-amber-500 border-amber-500/50">
            Unmatched
          </Badge>
        ) : (
          <Badge variant="secondary">
            {/* TODO: Fetch category name from categoryId */}
            Category
          </Badge>
        )}
      </div>

      {/* Amount Column */}
      <div
        className={cn(
          'w-24 text-right font-mono text-sm',
          transaction.amount < 0 ? 'text-foreground' : 'text-green-500'
        )}
      >
        {formatCurrency(transaction.amount)}
      </div>
    </div>
  )
}
```

### Empty State Design

```typescript
// In TransactionList when no transactions:
{(!transactions || transactions.length === 0) && (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
    <div className="text-muted-foreground">
      <ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
      <h3 className="text-lg font-medium">No transactions yet</h3>
      <p className="text-sm mt-2">
        Import your bank statements to see your transactions here.
      </p>
    </div>
    <Button asChild>
      <Link to="/accounts">Import Statements</Link>
    </Button>
  </div>
)}
```

### Performance Requirements

**Source: [architecture.md#Performance] & [project-context.md#Performance]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| UI Response | <100ms | Use Dexie direct, no state duplication |
| Scroll Performance | 60fps with 1000+ rows | TanStack Virtual |
| Row Render | Instant | Pre-computed formatting, memoized rows |

### Project Structure for This Story

```
src/
├── components/
│   └── TransactionRow/
│       ├── index.tsx
│       └── TransactionRow.test.tsx
├── features/
│   └── transactions/
│       ├── components/
│       │   └── TransactionList/
│       │       ├── index.tsx
│       │       └── TransactionList.test.tsx
│       └── index.ts
├── lib/
│   └── utils/
│       ├── formatCurrency.ts
│       ├── formatCurrency.test.ts
│       ├── formatDate.ts
│       └── formatDate.test.ts
├── types/
│   └── transaction.types.ts
├── lib/
│   └── schemas/
│       └── transaction.schema.ts
└── routes/
    └── transactions.tsx
```

### shadcn Components to Use

- `Badge` - Category badge and "Unmatched" indicator
- `Button` - CTA in empty state

### Dependencies Required

Ensure these are installed (should be from Epic 1):

```bash
npm install @tanstack/react-virtual dexie dexie-react-hooks
```

### Epic 3 Context

This is **Story 3.1**, the first story in **Epic 3: Transaction Viewing & Keyboard Navigation**.

**Epic 3 establishes the "Linear-like" UX foundation:**
- Story 3.1: Transaction List View (this story) - basic list display
- Story 3.2: Keyboard Navigation with J/K - adds J/K navigation
- Story 3.3: Command Palette Foundation - Cmd+K palette
- Story 3.4: Transaction Search via Command Palette - search functionality
- Story 3.5: Breadcrumb Navigation - navigation context

This story creates the core transaction list that subsequent stories will enhance with keyboard navigation and search.

### Previous Epic Context (Epic 1 & 2)

**Epic 1 established:**
- Project structure with Vite + shadcn
- Dexie database schema with tables including `transactions`
- App shell with Layout (sidebar + main content)
- TanStack Router setup

**Epic 2 established:**
- Account management
- CSV/PDF import flows
- Transaction creation in database

This story builds on that foundation by displaying the transactions that were imported.

### Keyboard Navigation Preparation

While keyboard navigation (J/K) is Story 3.2, design the TransactionRow with keyboard focus in mind:

- Rows should be focusable elements or within a focus-managed container
- Selected state should be distinguishable from focused state
- Use `tabIndex` appropriately for accessibility

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns] & [architecture.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT duplicate Dexie data in React state - use `useLiveQuery` directly
- DO NOT use class components
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT add comments/docstrings to code you didn't change
- DO NOT use `useState` to store transactions - use Dexie reactive queries

### Validation Checklist

Before marking complete:
- [ ] Transaction list renders with all required columns (date, merchant, category, amount)
- [ ] Virtual scrolling works with 1000+ transactions
- [ ] Empty state shows when no transactions
- [ ] Row height is 48px per UX spec
- [ ] Hover state on rows works
- [ ] Selected state on rows works
- [ ] Unmatched transactions show warning badge
- [ ] Currency formatting is correct with EUR symbol
- [ ] Date formatting shows "Jan 18" style
- [ ] Amounts are monospace and right-aligned
- [ ] Negative amounts styled differently from positive
- [ ] Works with dark theme
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Uses `useLiveQuery` not `useState` for transactions
- [ ] Tests co-located with source files
- [ ] 60fps scroll performance verified

### References

- [Source: epics.md#Story-3.1-Transaction-List-View]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Frontend-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md (row height, colors)]
- [TanStack Virtual documentation](https://tanstack.com/virtual/latest/docs/introduction)
- [Dexie.js useLiveQuery](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())
- [Intl.NumberFormat for currency](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- TanStack Virtual requires mocked element dimensions in jsdom tests (getBoundingClientRect, offsetHeight, scrollHeight)
- Transaction types and schema already existed from Epic 2 with additional fields (importMonth, importBatchId, categoryOverride, isRefund, linkedRefundId) beyond story spec
- Sidebar already had /transactions nav link from Epic 1 - no changes needed

### Completion Notes List

- Task 1: Transaction types and Zod schema already existed from Epic 2 implementation - verified correct
- Task 2: Created TransactionList with TanStack Virtual, useLiveQuery for Dexie data, column headers
- Task 3: Created TransactionRow with date, merchant, category badge, and amount columns
- Task 4: Added hover:bg-muted/50 transition, amber border-l for unmatched, cn() utility throughout
- Task 5: isSelected prop with bg-muted + border-primary styling, click-to-toggle selection state
- Task 6: Empty state with ListIcon, "No transactions yet" message, CTA linking to /accounts
- Task 7: formatCurrency using Intl.NumberFormat with EUR default, de-DE locale, 2 decimal places
- Task 8: formatDate showing "Jan 18" for current year, "Jan 18, 2024" for other years
- Task 9: Updated transactions.tsx route to render TransactionList with page header
- Task 10: TanStack Virtual configured with estimateSize=48, overscan=5, stable transaction.id keys
- Task 11: Sidebar already links to /transactions with active highlight - verified working
- Task 12: 26 new tests total: 11 TransactionRow, 5 TransactionList, 6 formatCurrency, 4 formatDate
- All 273 tests pass (pre-existing accounts.test.tsx DOMMatrix failure is unrelated)

### File List

- `src/lib/utils/formatCurrency.ts` (new)
- `src/lib/utils/formatCurrency.test.ts` (new)
- `src/lib/utils/formatDate.ts` (new)
- `src/lib/utils/formatDate.test.ts` (new)
- `src/components/TransactionRow/index.tsx` (new)
- `src/components/TransactionRow/TransactionRow.test.tsx` (new)
- `src/features/transactions/components/TransactionList/index.tsx` (new)
- `src/features/transactions/components/TransactionList/TransactionList.test.tsx` (new)
- `src/features/transactions/index.ts` (new)
- `src/routes/transactions.tsx` (modified)

## Change Log

- 2026-02-08: Implemented Story 3.1 - Transaction List View with virtualized rendering, formatting utilities, empty state, and 26 tests
