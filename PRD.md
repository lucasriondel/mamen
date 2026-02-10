Context

The transactions view currently has two filtering systems: FocusMode (keyboard-toggled: unmatched/month/subscriptions/anomalies) and DrillDown (URL-based category+period
from dashboard). Neither supports user-driven ad-hoc filtering. This plan adds a comprehensive filter toolbar using TanStack Table's columnFilters + getFilteredRowModel()
that layers on top of existing DB-level filters.

Data flow:
Dexie DB → useFilteredTransactions (FocusMode/DrillDown) → TanStack Table data →
columnFilters + getFilteredRowModel() → getSortedRowModel() → virtualizer → rendered rows

Filters to implement
┌────────────────────┬───────────────────┬─────────────────────────────────┬────────────────────────────────────────────────────────────┐
│ Filter │ Column ID │ Filter value shape │ UI │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Description search │ rawMerchantString │ string │ Text input (always visible in toolbar) │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Amount range │ amount │ { min?: number, max?: number } │ Popover with min/max number inputs │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Amount precise │ amount │ number (exact match) │ Same popover, radio toggle range/precise │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Category │ category │ number (categoryId) │ Popover with Command searchable list (reuse useCategories) │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Date exact │ date │ Date │ Popover with Calendar (single mode) │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Date range │ date │ { start?: Date, end?: Date } │ Popover with Calendar (range mode via react-day-picker) │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Year + Month │ date │ { month: number, year: number } │ Popover with Select dropdowns │
├────────────────────┼───────────────────┼─────────────────────────────────┼────────────────────────────────────────────────────────────┤
│ Account(s) │ accountId │ number[] │ Popover with checkbox list │
└────────────────────┴───────────────────┴─────────────────────────────────┴────────────────────────────────────────────────────────────┘
All filters are combinable — TanStack Table applies them with AND logic.

---

Step 1: Install shadcn Calendar ✅

npx shadcn@latest add calendar

Installs react-day-picker + creates src/components/ui/calendar.tsx.

---

Step 2: Create custom filter functions ✅

New file: src/features/transactions/components/TransactionDataTable/filterFns.ts

One function per filter type, signature: (row: Row<Transaction>, columnId: string, filterValue: T) => boolean

- Amount multi-mode — inspects typeof filterValue === 'number' → precise match on Math.abs(amount), else range { min?, max? } comparison
- Date multi-mode — inspects filter value shape: Date instance → exact day match, { start?, end? } → range, { month, year } → month/year match
- categoryFilterFn — matches row.original.categoryId (optionally subcategoryId)
- descriptionFilterFn — case-insensitive includes on rawMerchantString
- accountsFilterFn — checks accountId is in number[]

---

Step 3: Register filter functions on columns ✅

Modify: src/features/transactions/components/TransactionDataTable/columns.tsx

- date column: add filterFn: dateFilterFn
- rawMerchantString column: add filterFn: descriptionFilterFn
- category column: add filterFn: categoryFilterFn
- amount column: add filterFn: amountFilterFn
- Add hidden accountId column: { id: 'accountId', accessorFn: (row) => row.accountId, filterFn: accountsFilterFn, enableHiding: true } — never rendered, only used for
  filtering

---

Step 4: Create filter state hook

New file: src/features/transactions/hooks/useTransactionFilters.ts

Owns all filter state, converts to ColumnFiltersState via useMemo:

type TransactionFilterValues = {
description?: string
amountMode?: 'range' | 'precise'
amountMin?: number
amountMax?: number
amountPrecise?: number
categoryId?: number
subcategoryId?: number
dateMode?: 'exact' | 'range' | 'month'
dateExact?: Date
dateStart?: Date
dateEnd?: Date
monthYear?: { month: number; year: number }
accountIds?: number[]
}

Returns: filterValues, columnFilters, setter functions, clearFilter(group), clearAllFilters(), activeFilterCount, hasActiveFilters.

Mutually exclusive handling within groups (amount range ↔ precise, date exact ↔ range ↔ month).

---

Step 5: Update TanStack Table config

Modify: src/features/transactions/components/TransactionDataTable/index.tsx

1.  Import getFilteredRowModel from @tanstack/react-table
2.  Call useTransactionFilters()
3.  Fetch accounts: const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
4.  Update useReactTable:

- state: { sorting, rowSelection, columnFilters: transactionFilters.columnFilters }
- Add getFilteredRowModel: getFilteredRowModel()

5.  Add transactionFilters.clearAllFilters() to existing effect that clears state on FocusMode/DrillDown changes (~line 250)

---

Step 6: Build filter toolbar UI

New directory: src/features/transactions/components/TransactionFilters/

FilterToolbar.tsx

- Toggle button with Filter icon + active count badge in the table header area
- When expanded: row of filter trigger buttons + description search input
- Active filters: shows "Showing X of Y" + "Clear all" button
- Stays open while any filter is active

AmountFilter.tsx

- Popover with RadioGroup (Range / Precise)
- Range: two number <Input> (min, max)
- Precise: one number <Input>
- Apply / Clear buttons

CategoryFilter.tsx

- Popover with <Command> (cmdk) searchable list
- Parent categories as <CommandGroup> headings, subcategories as <CommandItem>
- Reuses useCategories() hook
- Color dot indicator

DateFilter.tsx

- Popover with RadioGroup (Exact / Range / Month+Year)
- Exact: <Calendar mode="single">
- Range: <Calendar mode="range"> (react-day-picker native range support)
- Month+Year: two <Select> dropdowns
- Apply / Clear buttons

AccountFilter.tsx

- Popover with checkbox list of accounts
- Apply / Clear buttons

index.ts — barrel export

---

Step 7: Integrate toolbar into TransactionDataTable

Modify: src/features/transactions/components/TransactionDataTable/index.tsx

- Add filter toggle button in table header area
- Render <FilterToolbar> between header and column headers, inside flex flex-col h-full wrapper
- Always available (stacks on top of FocusMode filters)
- Props: filters, accounts, totalCount (pre-filter), filteredCount (post-filter)

---

Files summary
┌────────────────────────────────────────────────────────────────────────────┬───────────────────────┐
│ File │ Action │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/components/ui/calendar.tsx │ Created by shadcn CLI │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionDataTable/filterFns.ts │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionDataTable/columns.tsx │ Modified │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionDataTable/index.tsx │ Modified │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/hooks/useTransactionFilters.ts │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/FilterToolbar.tsx │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/AmountFilter.tsx │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/CategoryFilter.tsx │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/DateFilter.tsx │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/AccountFilter.tsx │ New │
├────────────────────────────────────────────────────────────────────────────┼───────────────────────┤
│ src/features/transactions/components/TransactionFilters/index.ts │ New │
└────────────────────────────────────────────────────────────────────────────┴───────────────────────┘

---

Verification

1.  npx shadcn@latest add calendar + npm run build — no type errors
2.  Open /transactions, click Filters toggle, apply each filter individually, verify row count
3.  Stack 3+ filters, verify AND logic
4.  Press M (month) + apply category filter — both stack
5.  Navigate from dashboard with drilldown — column filters clear, toolbar resets
6.  Verify J/K/Enter/Esc/R/C/F/D keyboard shortcuts still work (input fields block via existing tagName === 'INPUT' guard)
7.  Apply filter with many results, scroll to verify virtualizer works
8.  npm test — all existing tests pass
