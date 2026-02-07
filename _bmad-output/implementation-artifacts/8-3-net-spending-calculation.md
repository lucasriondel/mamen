# Story 8.3: Net Spending Calculation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **linked refunds excluded from my spending totals**,
So that **my category spending reflects what I actually spent (FR21)**.

## Acceptance Criteria

1. **Given** I have a EUR100 purchase and a linked EUR100 refund
   **When** I view the Dashboard category breakdown
   **Then** the category shows net spend (EUR0 for this pair)
   **And** the total spending excludes the refund amount

2. **Given** I have a partial refund (EUR100 purchase, EUR30 refund linked to it)
   **When** I view the Dashboard
   **Then** net spend for that category includes EUR70 (purchase minus refund)

3. **Given** I have an unlinked refund (marked as refund but not linked to a purchase)
   **When** I view the Dashboard
   **Then** the refund is shown separately or as "Refunds" category
   **And** it's not double-counted against spending

4. **Given** I view the Dashboard
   **When** looking at spending totals
   **Then** I can see both gross and net if desired
   **And** default view shows net spending
   **And** a toggle or note indicates "Net of refunds"

5. **Given** I drill down from Dashboard to a category
   **When** viewing the transactions
   **Then** linked refunds are visible but marked as refunds
   **And** the category total shown matches the dashboard (net)

6. **Given** I view the month-over-month comparison
   **When** refunds are involved
   **Then** comparison uses net figures
   **And** changes reflect actual spending changes

## Tasks / Subtasks

- [ ] Task 1: Create `useNetSpending` hook for net spending calculation logic (AC: #1, #2, #3)
  - [ ] Create `src/features/dashboard/hooks/useNetSpending.ts`
  - [ ] Create `src/features/dashboard/hooks/useNetSpending.test.ts`
  - [ ] Hook takes time period (start date, end date) and returns aggregated spending data:
    ```typescript
    type CategorySpending = {
      categoryId: string
      categoryName: string
      grossSpending: number    // Sum of all expenses (negative amounts, absolute value)
      linkedRefunds: number    // Sum of refunds linked to purchases in this category
      netSpending: number      // grossSpending - linkedRefunds
      transactionCount: number
    }

    type SpendingSummary = {
      categories: CategorySpending[]
      totalGross: number
      totalLinkedRefunds: number
      totalNet: number
      orphanRefunds: number    // Unlinked refunds shown separately
    }
    ```
  - [ ] Query logic using `useLiveQuery`:
    ```typescript
    const spending = useLiveQuery(async () => {
      // 1. Get all transactions in the time period
      const transactions = await db.transactions
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray()

      // 2. Separate into expenses, linked refunds, orphan refunds
      const expenses = transactions.filter(t => t.amount < 0 && !t.isRefund)
      const linkedRefunds = transactions.filter(t => t.isRefund && t.linkedTransactionId)
      const orphanRefunds = transactions.filter(t => t.isRefund && !t.linkedTransactionId)

      // 3. For linked refunds, attribute the refund to the purchase's category
      //    (refund inherits category via Story 8.2 linking)
      // 4. Group expenses by categoryId, subtract linked refunds per category
      // 5. Return SpendingSummary
    }, [startDate, endDate])
    ```
  - [ ] Linked refund attribution: A linked refund's amount offsets the category of its linked purchase. Use the refund's `categoryId` (inherited from purchase in Story 8.2) for grouping.
  - [ ] Orphan refund handling: Refunds marked as refund but not linked appear as a separate "Refunds" entry, not subtracted from any category.
  - [ ] Edge case: If a linked refund's purchase is outside the time period, still count the refund against the purchase's category (refund date is what matters for period filtering).
  - [ ] Edge case: Zero spending after refund (full refund) — category shows EUR0.00, not hidden.
  - [ ] Test: Full refund pair (EUR100 purchase + EUR100 refund) results in EUR0 net for category
  - [ ] Test: Partial refund (EUR100 purchase + EUR30 refund) results in EUR70 net
  - [ ] Test: Orphan refunds appear as separate entry, not subtracted from categories
  - [ ] Test: Multiple categories with refunds calculate independently
  - [ ] Test: Gross totals are correct (sum of absolute expense amounts)
  - [ ] Test: Net totals are correct (gross minus linked refunds)
  - [ ] Test: Empty time period returns all zeros
  - [ ] Test: Transactions outside time period are excluded
  - [ ] Test: Linked refund with purchase outside time period still counted in refund's period

- [ ] Task 2: Update `SpendingChart` / `CategoryBreakdown` to use net spending (AC: #1, #2, #4)
  - [ ] Modify `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [ ] Replace direct transaction aggregation with `useNetSpending` hook
  - [ ] Default display: Show net spending per category (gross - linked refunds)
  - [ ] Add "Net of refunds" indicator near the total:
    ```typescript
    <span className="text-xs text-muted-foreground">Net of refunds</span>
    ```
  - [ ] Add gross/net toggle (optional per AC #4):
    ```typescript
    type SpendingView = 'net' | 'gross'

    // Toggle button or segmented control near the total
    <div className="flex items-center gap-2">
      <Button
        variant={view === 'net' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setView('net')}
      >
        Net
      </Button>
      <Button
        variant={view === 'gross' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setView('gross')}
      >
        Gross
      </Button>
    </div>
    ```
  - [ ] When "Gross" selected: Show raw category totals without refund offsets
  - [ ] When "Net" selected (default): Show category totals with refund offsets applied
  - [ ] Category list: Each row shows the selected view's amount
  - [ ] Percentage calculation: Based on whichever view is active
  - [ ] Sort order: Categories sorted by amount (highest first) based on active view
  - [ ] Test: Default view shows net spending amounts
  - [ ] Test: Toggle to gross shows raw spending amounts
  - [ ] Test: "Net of refunds" label visible in net mode
  - [ ] Test: Percentages recalculate when toggling views
  - [ ] Test: Sort order uses active view's amounts

- [ ] Task 3: Handle orphan refunds display on Dashboard (AC: #3)
  - [ ] Modify `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [ ] When orphan refunds exist (refunds not linked to any purchase):
    - Show a separate "Refunds (unlinked)" row at the bottom of the category list
    - Use a distinct visual style (muted, different from regular categories)
    - Display total orphan refund amount as a positive number (money returned)
    ```typescript
    {spending.orphanRefunds > 0 && (
      <div className="text-muted-foreground border-t pt-2 mt-2">
        <span>Refunds (unlinked)</span>
        <span className="text-green-500">+{formatCurrency(spending.orphanRefunds)}</span>
      </div>
    )}
    ```
  - [ ] Orphan refunds are NOT included in the total spending figure
  - [ ] Orphan refunds are NOT included in category percentages
  - [ ] Test: Orphan refunds row appears when unlinked refunds exist
  - [ ] Test: Orphan refunds row hidden when no unlinked refunds
  - [ ] Test: Orphan refund amount shown as positive (green)
  - [ ] Test: Orphan refunds not included in total or percentages

- [ ] Task 4: Update drill-down to show net totals (AC: #5)
  - [ ] Modify the drill-down navigation from Dashboard category to Transactions page
  - [ ] When drilling down from a category on the Dashboard:
    - Pass the net total as context (so the category header matches the dashboard)
    - Linked refunds in that category are visible in the transaction list
    - Refund transactions show their "Refund" badge (from Story 8.1)
    - The category total displayed at the top of the filtered view matches the dashboard's net figure
  - [ ] Add a small summary bar at the top of the filtered transaction list:
    ```typescript
    // When viewing transactions for a drilled-down category
    <div className="text-sm text-muted-foreground mb-2">
      {grossAmount !== netAmount && (
        <span>
          Gross: {formatCurrency(grossAmount)} |
          Refunds: -{formatCurrency(refundAmount)} |
          <strong>Net: {formatCurrency(netAmount)}</strong>
        </span>
      )}
    </div>
    ```
  - [ ] If there are no refunds in the category, the summary bar is hidden (no noise)
  - [ ] Refund transactions in the list are visually distinct (Refund badge from 8.1, link icon from 8.2)
  - [ ] Test: Drill-down shows net total matching dashboard
  - [ ] Test: Gross/refund/net breakdown shown when refunds exist in category
  - [ ] Test: No breakdown shown when no refunds in category
  - [ ] Test: Refund transactions visible in drill-down with badges

- [ ] Task 5: Update month-over-month comparison to use net figures (AC: #6)
  - [ ] Modify `src/features/dashboard/components/` (month-over-month comparison component)
  - [ ] The comparison component currently calculates totals for current and previous period
  - [ ] Replace raw totals with net totals from `useNetSpending`:
    - Current period: `useNetSpending(currentStart, currentEnd)`
    - Previous period: `useNetSpending(prevStart, prevEnd)`
  - [ ] Comparison calculation:
    ```typescript
    const currentNet = currentSpending.totalNet
    const previousNet = previousSpending.totalNet
    const change = currentNet - previousNet
    const changePercent = previousNet !== 0
      ? ((change / previousNet) * 100)
      : 0
    ```
  - [ ] Per-category comparison also uses net figures:
    - Each category shows its net change vs previous period
    - Refunds in either period affect the comparison correctly
  - [ ] Edge case: If a refund in the current period is linked to a purchase from the previous period, the refund still counts in the current period's net (based on refund transaction date)
  - [ ] Test: Month-over-month uses net totals, not gross
  - [ ] Test: Category-level comparison uses net figures
  - [ ] Test: Refund in current period reduces current period's net spending
  - [ ] Test: Full refund results in lower spending shown in comparison
  - [ ] Test: No previous data still shows "No previous data" gracefully

- [ ] Task 6: Write integration tests (AC: all)
  - [ ] Full scenario: Create purchase (-100), create refund (+100), link them, view dashboard → category shows EUR0 net
  - [ ] Partial refund: Purchase (-100), refund (+30), link → category shows EUR70 net
  - [ ] Orphan refund: Mark refund without linking → appears as "Refunds (unlinked)" on dashboard
  - [ ] Mixed categories: Multiple categories with different refund amounts → each calculates independently
  - [ ] Gross toggle: Switch to gross → shows raw amounts without refund offsets
  - [ ] Drill-down: Click category → filtered transactions show gross/refund/net summary
  - [ ] Month-over-month: Two months with different refund patterns → comparison uses net figures
  - [ ] Time period filter: Change period → net spending recalculates for new period
  - [ ] No refunds: Dashboard works normally when no refunds exist (no regression)
  - [ ] All refunded: Every transaction in a category has a linked refund → category shows EUR0

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Schema changes | None — reuses `isRefund` + `linkedTransactionId` from Story 8.1 | No new fields needed |
| Aggregation | In-memory calculation within `useLiveQuery` callback | Dexie query fetches, JS aggregates |
| State management | Hook returns computed data, components render | No intermediate state stores |

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

### Data Model — No New Fields Required

**Source: [Story 8.1 — Data Model Changes]**

Story 8.1 adds `isRefund` (boolean) and `linkedTransactionId` (string | null) to the `transactions` table. Story 8.2 adds category inheritance logic. This story (8.3) only reads these fields — no schema changes or migrations needed.

**Key fields used for calculation:**
- `transaction.amount`: Negative = expense, positive = income/refund
- `transaction.isRefund`: Whether this transaction is marked as a refund
- `transaction.linkedTransactionId`: ID of the linked purchase (for linked refunds) or linked refund (for purchases)
- `transaction.categoryId`: Category assignment (inherited from purchase for linked refunds via Story 8.2)
- `transaction.date`: For time period filtering

### Calculation Logic

**Net spending per category:**
```
Net = Sum(expenses in category) + Sum(linked refunds attributed to category)
```

Where:
- Expenses are transactions with `amount < 0` and `isRefund === false`
- Linked refunds are transactions with `isRefund === true` and `linkedTransactionId !== null`
- Linked refunds use their own `categoryId` (inherited from purchase in Story 8.2) for category attribution
- Amounts: Expenses are negative (e.g., -100), refunds are positive (e.g., +30)
- Net = |sum of expenses| - sum of linked refunds = 100 - 30 = 70

**Orphan refunds (unlinked):**
- Transactions with `isRefund === true` and `linkedTransactionId === null`
- Shown as a separate entry, not subtracted from any category
- These are refunds the user marked but didn't link to a specific purchase

**Gross vs Net:**
- Gross = Sum of all expenses (|negative amounts|), ignoring refunds entirely
- Net = Gross minus linked refunds attributed per category
- Default view is Net

### UX Design — Dashboard with Refunds

**Source: [ux-design-specification.md], [epics.md#Story-8.3]**

The dashboard already has:
- Category breakdown (Story 6.1)
- Time period selection (Story 6.2)
- Month-over-month comparison (Story 6.3)
- Drill-down to transactions (Story 6.4)

This story modifies the calculation layer underneath these existing components. The UI changes are minimal:
- Add "Net of refunds" indicator
- Add gross/net toggle
- Add orphan refunds row
- Add gross/refund/net summary in drill-down
- Update comparison to use net figures

### Previous Story Intelligence

**From Story 8.1 (Mark Transaction as Refund — F Key):**
- Established `isRefund` and `linkedTransactionId` fields on transactions table
- Created `refundService.ts` with `linkRefund` and `markAsOrphanRefund`
- Added "Refund" badge to `TransactionRow`
- Data model: negative = expense, positive = refund

**From Story 8.2 (Link Refund to Original Purchase):**
- Enhanced `linkRefund` with category inheritance (refund inherits purchase's categoryId)
- Added `unlinkRefund` and `replaceLinkRefund` services
- Made Link2 icon clickable for navigation
- Key for 8.3: Linked refunds have the same categoryId as their purchase, so grouping by categoryId correctly attributes refunds to categories

**From Story 6.1 (Spending Breakdown by Category):**
- Established the `CategoryBreakdown` component
- Uses Dexie `useLiveQuery` for data fetching
- Groups transactions by `categoryId`
- Shows total and percentage per category
- **This is the primary component to modify**

**From Story 6.3 (Month-over-Month Comparison):**
- Calculates totals for current and previous period
- Shows change as amount and percentage
- Per-category changes displayed
- **Needs to switch from gross to net calculation**

**From Story 6.4 (Drill-Down to Transactions):**
- Navigates from category click to filtered transaction list
- Preserves time period filter
- Shows category total at top
- **Needs to show net total and refund breakdown**

### Git Intelligence

Recent commits are all story creation (no implementation yet). The project is in planning phase — all stories in sprint status are at `ready-for-dev` or `backlog`. No implementation code exists yet to analyze for patterns.

### File Structure for This Story

```
src/
+-- features/
|   +-- dashboard/
|       +-- hooks/
|       |   +-- useNetSpending.ts (new)
|       |   +-- useNetSpending.test.ts (new)
|       +-- components/
|           +-- CategoryBreakdown/
|           |   +-- index.tsx (modify — use net spending, add toggle, orphan refunds)
|           |   +-- CategoryBreakdown.test.tsx (modify — add net spending tests)
|           +-- SpendingChart/ or MonthComparison/
|               +-- index.tsx (modify — use net figures for comparison)
|               +-- *.test.tsx (modify — add net comparison tests)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount formatting |
| `formatDate` | `src/lib/utils/formatDate.ts` | Date formatting |
| `Button` | `src/components/ui/button.tsx` | Gross/net toggle |
| `Badge` | `src/components/ui/badge.tsx` | Refund badge (already on rows from 8.1) |
| `cn` | `@/lib/utils` | Conditional class names |
| CategoryBreakdown | `src/features/dashboard/components/CategoryBreakdown/index.tsx` | Existing component to modify |
| Month comparison component | `src/features/dashboard/components/` | Existing comparison to modify |
| Drill-down navigation | Existing from Story 6.4 | Category → transactions routing |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `CategoryBreakdown/index.tsx` | Switch to net spending data, add toggle, add orphan row | Medium — core display change |
| Month comparison component | Switch to net totals | Low — calculation change only |
| Drill-down filtered transactions view | Add gross/refund/net summary bar | Low — additive UI |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `transaction.types.ts` | No new fields |
| `transaction.schema.ts` | No new Zod fields |
| `db/schema.ts` | No schema changes |
| `db/migrations.ts` | No new migrations |
| `RefundLinkModal` | Separate concern (Story 8.1/8.2) |
| `refundService.ts` | Read-only use of existing data |
| `useKeyboardNavigation.ts` | No new shortcuts |
| `TransactionRow/index.tsx` | Refund badge already handles display |
| Sidebar | No new navigation items |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Impact of This Story |
|--------|--------|---------------------|
| Dashboard render | <100ms | Aggregation inside useLiveQuery callback — single DB query + in-memory calc |
| Toggle switch | <50ms | Re-render with different data view (no new query) |
| Drill-down | <100ms | Existing navigation + small summary computation |
| Period change | <100ms | New useLiveQuery with different date params triggers re-fetch |

**Aggregation performance:** For 10k transactions, a single `db.transactions.where('date').between(...)` returns the filtered set in <10ms (Dexie indexed). In-memory grouping and summation is O(n) on the filtered set, typically <5ms. Total: well under 100ms.

**Optimization:** Compute both gross and net in a single pass. Store both in the hook's return value. Toggling between views is a pure re-render (no new data fetch).

### Edge Cases to Handle

1. **No refunds at all:** Dashboard works exactly as before — net equals gross. Toggle is optional (could hide it when no refunds exist to avoid confusion).
2. **All transactions refunded:** Categories show EUR0.00 net. Total shows EUR0.00. This is correct — user got all their money back.
3. **Orphan refunds only (no linked refunds):** No net calculation changes to categories. Only the orphan refunds row appears separately.
4. **Refund larger than purchase:** Possible for partial returns or pricing adjustments. Net for the category could go negative. Display the negative net as a credit/surplus.
5. **Refund in different time period than purchase:** The refund's transaction date determines which period it falls in. A January refund for a December purchase appears in January's net figures.
6. **Category changed after linking:** If user manually changes a refund's category after it was inherited from the purchase, the refund's new category is used for net calculation. This is correct — the refund offsets the category it's assigned to.
7. **Unmatched transactions (no category):** Unmatched transactions (and their linked refunds) appear in the "Uncategorized" bucket. Net calculation still applies.
8. **Income transactions (positive, not refunds):** Positive amounts where `isRefund === false` are income, not refunds. These should be excluded from spending calculations entirely (or shown separately as "Income").
9. **Toggle state persistence:** The gross/net toggle is UI-only state. Default to "net" on each visit. No need to persist in settings.
10. **Orphan refund with a category:** If an orphan refund has a categoryId (manually assigned), still show it in the "Refunds (unlinked)" row, not in the category's net calculation. Only linked refunds offset categories.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT create new schema fields or migrations — this story only reads existing data
- DO NOT pre-compute or cache net spending in a separate Dexie table — compute on the fly via `useLiveQuery`
- DO NOT duplicate aggregated data in Zustand or React state — the hook returns computed values directly
- DO NOT create a separate "refund" dashboard page — integrate into existing dashboard
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT import or modify `refundService.ts` — this story is read-only on refund data
- DO NOT use a charting library for the gross/net toggle — use simple shadcn Button components
- DO NOT add a date library — use existing `formatDate` utility

### Scope Boundaries

**In scope (this story):**
- `useNetSpending` hook for net spending calculation
- Modify `CategoryBreakdown` to use net spending by default
- Gross/net toggle on dashboard
- "Net of refunds" indicator
- Orphan refunds displayed separately
- Drill-down shows gross/refund/net summary when refunds exist
- Month-over-month comparison uses net figures

**Out of scope (not planned):**
- Automatic refund detection (not planned)
- Refund-specific dashboard page or widget
- Refund history timeline
- Export with refund details (Story 10.1 scope)
- Refund notifications or alerts

### Validation Checklist

Before marking complete:
- [ ] `useNetSpending` hook calculates net spending correctly per category
- [ ] Full refunds (EUR100 + EUR100) result in EUR0 net for category
- [ ] Partial refunds (EUR100 + EUR30) result in EUR70 net for category
- [ ] Orphan refunds appear as separate "Refunds (unlinked)" row
- [ ] Orphan refunds not included in category totals or percentages
- [ ] Default view shows net spending
- [ ] Gross/net toggle switches between views
- [ ] "Net of refunds" indicator visible in net mode
- [ ] Drill-down shows gross/refund/net summary bar when refunds exist
- [ ] Drill-down category total matches dashboard net figure
- [ ] Month-over-month comparison uses net totals
- [ ] Per-category comparison uses net figures
- [ ] Time period changes recalculate net spending
- [ ] Income transactions excluded from spending (or shown separately)
- [ ] Dashboard works normally when no refunds exist (no regression)
- [ ] Performance: Dashboard renders in <100ms with 10k transactions
- [ ] No schema changes or new migrations
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No new external dependencies

### Project Structure Notes

- Alignment with unified project structure: All new code in `src/features/dashboard/` — matching the architecture's feature-based organization
- Only one new file: `useNetSpending.ts` (+ test) — everything else modifies existing dashboard components
- No new shared components or utilities needed
- Read-only dependency on Story 8.1/8.2 data model (no modifications to transaction services)

### References

- [Source: epics.md#Epic-8-Story-8.3-Net-Spending-Calculation]
- [Source: prd.md#FR21 - System can exclude linked refunds from category spending totals]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, transaction data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, shadcn/ui]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Dashboard-Design - Category breakdown layout]
- [Story 8.1: Mark Transaction as Refund (F Key) - Schema: isRefund, linkedTransactionId fields]
- [Story 8.2: Link Refund to Original Purchase - Category inheritance, unlink/replace services]
- [Story 6.1: Spending Breakdown by Category - CategoryBreakdown component, aggregation pattern]
- [Story 6.2: Time Period Selection - Period picker, date range filtering]
- [Story 6.3: Month-over-Month Comparison - Comparison calculation, change display]
- [Story 6.4: Drill-Down to Transactions - Category → filtered transactions navigation]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
