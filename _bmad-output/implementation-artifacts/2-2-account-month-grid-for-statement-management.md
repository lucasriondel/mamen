# Story 2.2: Account Month Grid for Statement Management

Status: ready-for-dev

## Story

As a **user**,
I want **to see a visual grid of months for each account showing which statements I've imported**,
So that **I can easily track my import coverage and know where to drop new statements**.

## Acceptance Criteria

1. **Given** I have one or more accounts
   **When** I view the Accounts page or Import section
   **Then** I see each account with a horizontal grid of month slots
   **And** the grid shows the current year's months (scrollable if needed)
   **And** imported months show a checkmark and transaction count
   **And** empty months show a dashed border indicating drop target

2. **Given** I am viewing the month grid
   **When** I hover over an empty month slot
   **Then** the slot highlights to indicate it's a drop target
   **And** I see "Drop statement here" or similar hint

3. **Given** I click on an imported month
   **When** I select a month with data
   **Then** I navigate to transactions filtered by that account and month

4. **Given** I want to re-import a month
   **When** I drop a file on an already-imported month
   **Then** I see a confirmation: "Replace X existing transactions?"
   **And** I can confirm or cancel

## Tasks / Subtasks

- [ ] Task 1: Create AccountMonthGrid component (AC: #1, #2)
  - [ ] Create `src/features/import/components/AccountMonthGrid/index.tsx`
  - [ ] Create grid layout showing 12 months horizontally (Jan-Dec)
  - [ ] Use flexbox with horizontal scroll for overflow
  - [ ] Pass accountId as prop for data fetching
  - [ ] Style per UX spec (dashed border for empty, solid for imported)

- [ ] Task 2: Create MonthSlot component (AC: #1, #2)
  - [ ] Create `src/features/import/components/MonthSlot/index.tsx`
  - [ ] Display month name (short format: "Jan", "Feb", etc.)
  - [ ] Show checkmark icon (Lucide: Check) for imported months
  - [ ] Show transaction count below checkmark
  - [ ] Show dashed border and empty state for unimported months
  - [ ] Add hover effect with "Drop here" tooltip
  - [ ] Accept props: month, year, accountId, transactionCount, isImported

- [ ] Task 3: Query transaction counts per account/month (AC: #1)
  - [ ] Create hook `src/features/import/hooks/useAccountMonthData.ts`
  - [ ] Use `useLiveQuery` to get transaction counts grouped by accountId + month
  - [ ] Return: Map of "YYYY-MM" → transactionCount for given accountId
  - [ ] Handle case where no transactions exist (return empty map)

- [ ] Task 4: Implement click navigation to filtered transactions (AC: #3)
  - [ ] Add onClick handler to MonthSlot for imported months
  - [ ] Use TanStack Router to navigate to `/transactions`
  - [ ] Pass search params: `?accountId={id}&month={YYYY-MM}`
  - [ ] Update TransactionsPage to handle these filters (if not already)

- [ ] Task 5: Implement drag-and-drop target styling (AC: #2)
  - [ ] Use React DnD or native drag events for drop zone
  - [ ] Highlight slot on dragover
  - [ ] Show visual feedback (border color change, text update)
  - [ ] Note: Actual import logic is Story 2.3 - this story sets up the UI only

- [ ] Task 6: Implement re-import confirmation dialog (AC: #4)
  - [ ] Use shadcn AlertDialog for confirmation
  - [ ] Show when file dropped on imported month
  - [ ] Display: "This month already has X transactions. Replace them?"
  - [ ] Actions: "Cancel" and "Replace"
  - [ ] Note: Actual replacement logic deferred to Story 2.3

- [ ] Task 7: Integrate AccountMonthGrid into Accounts page (AC: #1)
  - [ ] Update `src/routes/accounts.tsx`
  - [ ] Show AccountMonthGrid below each AccountCard
  - [ ] Or: Create expanded account view with grid
  - [ ] Ensure layout works with multiple accounts

- [ ] Task 8: Add year selector for grid (Enhancement)
  - [ ] Add year selector above grid (default: current year)
  - [ ] Allow navigation to previous/next years
  - [ ] Use Select component from shadcn

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- All queries go directly to Dexie - UI updates automatically via live queries
- Transaction counts should use Dexie's `where().equals().count()` pattern

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming (`handleDrop`, `handleMonthClick`)
- Props types: `{ComponentName}Props`

### UX Design Requirements

**Source: [ux-design-specification.md#Import-Architecture]**

The Account Month Grid is a key UX component described in detail:

```
┌─────────────────────────────────────────────────────────────┐
│ Accounts & Statements                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Main Bank (Checking)                          [+ Add Month] │
│ ┌───────┬───────┬───────┬───────┬───────┬───────┐          │
│ │  Jan  │  Feb  │  Mar  │  Apr  │  May  │  Jun  │          │
│ │  ✓    │  ✓    │  ✓    │  ◌    │  ◌    │  ◌    │          │
│ │  47   │  52   │  38   │       │       │       │          │
│ └───────┴───────┴───────┴───────┴───────┴───────┘          │
│                                                             │
│ ✓ = imported   ◌ = empty (drop statement here)              │
└─────────────────────────────────────────────────────────────┘
```

**Cell States from UX Spec:**

| State | Appearance | Interaction |
|-------|------------|-------------|
| Empty | Dashed border, muted | Drop target, click to browse |
| Drag over | Highlight border, "Drop here" text | Release to import |
| Imported | Solid border, ✓, transaction count | Click to view transactions |
| Processing | Spinner, "Parsing..." | Non-interactive |
| Error | Destructive border, retry icon | Click to retry or browse |

### Data Model Reference

**Source: [architecture.md#Data-Model]**

Transactions have:
```typescript
type Transaction = {
  id?: number
  accountId: number
  date: Date
  amount: number
  rawMerchantString: string
  merchantId?: number
  categoryId?: number
  // ... other fields
}
```

For month grouping, you'll query by `accountId` and extract month from `date`.

### Dexie Query Patterns

**Getting transaction count per month for an account:**
```typescript
import { db } from '@/lib/db'
import { useLiveQuery } from 'dexie-react-hooks'

// Get all transactions for an account, then group by month in JS
const transactions = useLiveQuery(
  () => db.transactions.where('accountId').equals(accountId).toArray(),
  [accountId]
)

// Group by month: "2026-01" format
const monthCounts = useMemo(() => {
  if (!transactions) return new Map<string, number>()

  const counts = new Map<string, number>()
  transactions.forEach(tx => {
    const monthKey = tx.date.toISOString().slice(0, 7) // "YYYY-MM"
    counts.set(monthKey, (counts.get(monthKey) || 0) + 1)
  })
  return counts
}, [transactions])
```

**Alternative - More efficient for large datasets:**
```typescript
// If performance is an issue, consider a compound index
// in schema.ts: '&accountId, date' or similar
// Then use .between() for date range queries
```

### Component Structure

```
src/features/import/
├── components/
│   ├── AccountMonthGrid/
│   │   └── index.tsx
│   ├── MonthSlot/
│   │   └── index.tsx
│   └── ImportDropzone/       # Future: Story 2.3
│       └── index.tsx
├── hooks/
│   ├── useAccountMonthData.ts
│   └── useImport.ts          # Future: Story 2.3
└── index.ts
```

### Styling Guidelines

**Source: [ux-design-specification.md#Visual-Design-Foundation]**

**Month Slot Sizing:**
- Min-width: 80px per cell
- Height: ~80px (fits month name + icon + count)
- Gap between cells: 8px (space-2)
- Border radius: 6px (radius-md)

**Colors:**
- Empty slot border: `border-dashed border-muted`
- Imported slot border: `border-solid border-border`
- Hover (empty): `border-ring` (focus blue)
- Checkmark: `text-success` (green)
- Transaction count: `text-muted-foreground`

**Dark theme tokens (from UX spec):**
```css
--background: hsl(222 47% 4%);
--border: hsl(217 33% 17%);
--muted-foreground: hsl(215 20% 65%);
--success: hsl(142 76% 36%);
--ring: hsl(212 100% 47%);
```

### Drag and Drop Implementation

**For drop zone detection (basic):**
```typescript
const [isDragOver, setIsDragOver] = useState(false)

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault()
  setIsDragOver(true)
}

const handleDragLeave = () => {
  setIsDragOver(false)
}

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault()
  setIsDragOver(false)

  const files = e.dataTransfer.files
  if (files.length > 0) {
    // For now, just trigger the re-import confirmation if month has data
    // Actual import logic is Story 2.3
    onFileDropped(files[0], monthKey)
  }
}
```

### Navigation with TanStack Router

**Navigate to filtered transactions:**
```typescript
import { useNavigate } from '@tanstack/react-router'

const navigate = useNavigate()

const handleMonthClick = (monthKey: string) => {
  navigate({
    to: '/transactions',
    search: {
      accountId: accountId,
      month: monthKey,
    },
  })
}
```

**Note:** TransactionsPage may need updates to read these search params and filter accordingly. This can be done in this story or deferred.

### shadcn Components to Use

- `Card` - For grid container styling
- `Tooltip` - For "Drop statement here" hint on hover
- `AlertDialog` - For re-import confirmation
- `Select` - For year selector
- `Badge` - Optional, for status indicators

### Previous Story Context (Story 2.1)

**AccountCard component exists at:**
- `src/features/accounts/components/AccountCard/index.tsx`

**AccountsPage exists at:**
- `src/routes/accounts.tsx`

**Dexie database instance at:**
- `src/lib/db/index.ts`

**Account type available in:**
- `src/types/account.types.ts`

### Integration Strategy

**Option A: Grid below each AccountCard**
```tsx
<div className="space-y-6">
  {accounts.map(account => (
    <div key={account.id}>
      <AccountCard account={account} />
      <AccountMonthGrid accountId={account.id!} />
    </div>
  ))}
</div>
```

**Option B: Expandable AccountCard with grid inside**
```tsx
<AccountCard account={account} expanded>
  <AccountMonthGrid accountId={account.id!} />
</AccountCard>
```

Choose based on visual preference during implementation.

### Testing Strategy

**Co-located tests pattern:**
- `AccountMonthGrid.test.tsx` next to `index.tsx`
- `MonthSlot.test.tsx` next to `index.tsx`

**Test cases:**
- Renders 12 month slots for current year
- Shows checkmark and count for months with transactions
- Shows empty state for months without transactions
- Hover shows tooltip on empty slot
- Click on imported month triggers navigation
- Drag over shows highlight state
- Drop on imported month shows confirmation dialog

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store transaction counts in React state - derive from `useLiveQuery`
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT implement actual file parsing - that's Story 2.3
- DO NOT add comments/docstrings to existing code you didn't modify

### Edge Cases to Handle

1. **Account with no transactions:** All months show empty state
2. **Many years of data:** Year selector allows navigation
3. **Current year partially elapsed:** Still show all 12 months
4. **Responsive behavior:** Horizontal scroll on smaller screens
5. **Multiple accounts:** Each has independent grid

### Performance Considerations

- Use `useMemo` for month counting to avoid recalculation on every render
- Consider limiting initial query to current year's transactions
- Virtual scrolling not needed (only 12 cells per row)

### Validation Checklist

Before marking complete:
- [ ] AccountMonthGrid shows 12 months in horizontal layout
- [ ] Imported months show checkmark and transaction count
- [ ] Empty months show dashed border
- [ ] Hover on empty month shows tooltip
- [ ] Click on imported month navigates to filtered transactions
- [ ] Drag over empty month highlights the slot
- [ ] Drop on imported month shows confirmation dialog
- [ ] Year selector changes displayed year
- [ ] Grid appears on Accounts page below each account
- [ ] Transaction counts update in real-time (via useLiveQuery)
- [ ] Works with dark theme
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source

### References

- [Source: epics.md#Story-2.2]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: ux-design-specification.md#Import-Architecture]
- [Source: ux-design-specification.md#Account-Month-Grid]
- [Source: project-context.md#Data-Access-MOST-IMPORTANT]
- [shadcn/ui Card](https://ui.shadcn.com/docs/components/card)
- [shadcn/ui AlertDialog](https://ui.shadcn.com/docs/components/alert-dialog)
- [shadcn/ui Tooltip](https://ui.shadcn.com/docs/components/tooltip)
- [TanStack Router Navigation](https://tanstack.com/router/latest/docs/framework/react/guide/navigation)
- [Dexie.js useLiveQuery](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
