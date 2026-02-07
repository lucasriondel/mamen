# Story 9.2: Subscriptions View (S Key)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see all my detected subscriptions in a dedicated view**,
So that **I can audit my recurring charges and cancel forgotten ones (FR37, FR38)**.

## Acceptance Criteria

1. **Given** I press `S` or click "Subscriptions" in sidebar
   **When** the Subscriptions view loads
   **Then** I see a list of all detected subscriptions
   **And** the S key focus mode is now active (replaces placeholder from Story 5.5)

2. **Given** I view the subscriptions list
   **When** looking at each subscription
   **Then** I see: merchant name, amount, frequency (monthly/yearly/weekly), last charge date
   **And** subscriptions are sorted by amount (highest first) by default

3. **Given** I view the subscriptions summary
   **When** at the top of the view
   **Then** I see total monthly subscription cost
   **And** I see total yearly subscription cost (monthly x 12 + yearly + weekly x 52)
   **And** I see count of active subscriptions

4. **Given** I click on a subscription
   **When** viewing details
   **Then** I see all transactions that are part of this subscription
   **And** I see the charge history with dates and amounts
   **And** I can navigate to the merchant page

5. **Given** a subscription is marked "possibly cancelled"
   **When** viewing the list
   **Then** it appears with a muted/inactive style
   **And** a badge shows "Possibly cancelled"

6. **Given** I view the subscriptions list
   **When** I want to sort or filter
   **Then** I can sort by: amount, frequency, last charge, merchant name
   **And** I can filter by: frequency (monthly, yearly, all), status (active, cancelled, all)

7. **Given** no subscriptions are detected
   **When** I view the Subscriptions view
   **Then** I see an empty state: "No subscriptions detected yet"
   **And** guidance: "Import more statements to detect recurring charges"

## Tasks / Subtasks

- [ ] Task 1: Create SubscriptionRow component (AC: #2, #5)
  - [ ] Create `src/features/subscriptions/components/SubscriptionRow/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionRow/SubscriptionRow.test.tsx`
  - [ ] Row displays:
    ```
    [Merchant Name]    [EUR15.99/mo]    [Last: Jan 18]    [Active badge]
    ```
  - [ ] Frequency display: "mo" for monthly, "yr" for yearly, "wk" for weekly
  - [ ] Amount formatted using existing `formatCurrency` utility
  - [ ] "Possibly cancelled" subscriptions: muted text/opacity + Badge variant="secondary" showing "Possibly cancelled"
  - [ ] Active subscriptions: normal styling
  - [ ] Row is clickable (expands to detail or navigates)
  - [ ] Keyboard focus support (J/K navigation reuse from Story 3.2)
  - [ ] Test: Renders merchant name, amount, frequency, last charge date
  - [ ] Test: Active subscription renders with normal styling
  - [ ] Test: Possibly-cancelled subscription renders with muted styling and badge
  - [ ] Test: Click triggers detail view

- [ ] Task 2: Create SubscriptionsSummary component (AC: #3)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsSummary/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionsSummary/SubscriptionsSummary.test.tsx`
  - [ ] Layout (3 stat cards in a row):
    ```
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Monthly Cost  │  │ Yearly Cost   │  │ Active Subs  │
    │ EUR89.97     │  │ EUR1,179.64  │  │ 7            │
    └──────────────┘  └──────────────┘  └──────────────┘
    ```
  - [ ] Use shadcn Card component for each stat
  - [ ] Get data from `useSubscriptions` hook (created in Story 9.1):
    - `monthlyTotal` for Monthly Cost card
    - `yearlyTotal` for Yearly Cost card
    - `count` for Active Subs card
  - [ ] Format amounts with `formatCurrency`
  - [ ] Test: Renders 3 stat cards with correct values
  - [ ] Test: Shows EUR0.00 / 0 when no subscriptions

- [ ] Task 3: Create SubscriptionDetail component (AC: #4)
  - [ ] Create `src/features/subscriptions/components/SubscriptionDetail/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionDetail/SubscriptionDetail.test.tsx`
  - [ ] Display as an expandable section below the row (or a modal/panel — use expandable for keyboard-first UX):
    ```
    ┌─────────────────────────────────────────────────┐
    │ Netflix                              EUR15.99/mo │
    │ ─────────────────────────────────────────────── │
    │ Status: Active                                   │
    │ First charge: 2025-06-18                         │
    │ Last charge: 2026-01-18                          │
    │ Charges detected: 8                              │
    │                                                  │
    │ Charge History:                                  │
    │   Jan 18, 2026   EUR15.99                        │
    │   Dec 18, 2025   EUR15.99                        │
    │   Nov 19, 2025   EUR16.49                        │
    │   ...                                            │
    │                                                  │
    │ [View Merchant →]                                │
    └─────────────────────────────────────────────────┘
    ```
  - [ ] Charge history: Load transactions by `subscription.transactionIds` from Dexie
    ```typescript
    const transactions = useLiveQuery(
      () => db.transactions.where('id').anyOf(subscription.transactionIds).toArray(),
      [subscription.transactionIds]
    )
    ```
  - [ ] Sort transactions by date descending (most recent first)
  - [ ] "View Merchant" link navigates to merchant detail page (Story 7.2) using TanStack Router:
    ```typescript
    const navigate = useNavigate()
    // onClick:
    navigate({ to: '/merchants/$merchantId', params: { merchantId: String(subscription.merchantId) } })
    ```
  - [ ] Test: Renders subscription metadata (status, dates, charge count)
  - [ ] Test: Renders charge history with correct transaction dates and amounts
  - [ ] Test: "View Merchant" link navigates to merchant page
  - [ ] Test: Handles empty transactionIds gracefully

- [ ] Task 4: Create SubscriptionsList component with sort/filter (AC: #1, #2, #6)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsList/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionsList/SubscriptionsList.test.tsx`
  - [ ] Layout:
    ```
    ┌──────────────────────────────────────────────────┐
    │ [Sort: Amount ▼]  [Filter: All frequencies ▼]    │
    │                   [Filter: All statuses ▼]       │
    ├──────────────────────────────────────────────────┤
    │ SubscriptionRow - Netflix     EUR15.99/mo  Active│
    │ SubscriptionRow - Spotify     EUR9.99/mo   Active│
    │ SubscriptionRow - iCloud      EUR2.99/mo   Active│
    │ SubscriptionRow - Gym         EUR49.99/mo  Canc. │
    └──────────────────────────────────────────────────┘
    ```
  - [ ] Use `useSubscriptions` hook from Story 9.1 for data
  - [ ] Sort options (via shadcn Select or DropdownMenu):
    - Amount (highest first) — default
    - Amount (lowest first)
    - Merchant name (A-Z)
    - Last charge (most recent first)
    - Frequency
  - [ ] Filter by frequency (via shadcn Select):
    - All (default)
    - Monthly
    - Yearly
    - Weekly
  - [ ] Filter by status:
    - All (default)
    - Active only
    - Possibly cancelled only
  - [ ] Sorting and filtering are local state (useState) — not persisted
  - [ ] Use client-side sort/filter on the array from `useSubscriptions` — no extra Dexie queries needed
  - [ ] Expand/collapse detail on row click or Enter key
  - [ ] J/K keyboard navigation between subscription rows (reuse `useKeyboardNavigation` pattern)
  - [ ] Test: Renders list of subscriptions
  - [ ] Test: Default sort is by amount descending
  - [ ] Test: Changing sort re-orders list
  - [ ] Test: Filter by frequency shows only matching
  - [ ] Test: Filter by status shows only matching
  - [ ] Test: Combined filter + sort works correctly
  - [ ] Test: Empty list shows empty state

- [ ] Task 5: Create SubscriptionsEmptyState component (AC: #7)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsEmptyState/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionsEmptyState/SubscriptionsEmptyState.test.tsx`
  - [ ] Display:
    ```
    ┌─────────────────────────────────┐
    │          [Repeat icon]          │
    │                                 │
    │   No subscriptions detected yet │
    │                                 │
    │   Import more statements to     │
    │   detect recurring charges      │
    │                                 │
    │   [View All Transactions]       │
    └─────────────────────────────────┘
    ```
  - [ ] Replaces SubscriptionsPlaceholder from Story 5.5 (same messaging but slightly different — this is the real empty state for when detection exists but found nothing)
  - [ ] Use Lucide `Repeat` icon
  - [ ] "View All Transactions" button clears subscriptions focus mode
  - [ ] Follow same empty state pattern as InboxZeroEmpty from Story 4.2
  - [ ] Test: Renders empty state message
  - [ ] Test: "View All Transactions" button clears focus mode

- [ ] Task 6: Replace SubscriptionsPlaceholder with real view in TransactionList (AC: #1)
  - [ ] Modify `src/features/transactions/components/TransactionList/index.tsx`
  - [ ] Replace the placeholder check from Story 5.5:
    ```typescript
    // BEFORE (Story 5.5):
    if (activeFilters.has('subscriptions')) {
      return <SubscriptionsPlaceholder />
    }

    // AFTER (Story 9.2):
    if (activeFilters.has('subscriptions')) {
      return <SubscriptionsView />
    }
    ```
  - [ ] `SubscriptionsView` is a wrapper that renders:
    - `SubscriptionsSummary` (stat cards at top)
    - `SubscriptionsList` (list with sort/filter)
    - Or `SubscriptionsEmptyState` if no subscriptions
  - [ ] The `SubscriptionsPlaceholder` component from Story 5.5 can be deleted (or left as dead code — deletion preferred)
  - [ ] Test: S key now shows real subscriptions view instead of placeholder
  - [ ] Test: S key with no subscriptions shows SubscriptionsEmptyState (not old placeholder)

- [ ] Task 7: Create SubscriptionsView wrapper component (AC: #1, #3, #6, #7)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsView/index.tsx`
  - [ ] Create `src/features/subscriptions/components/SubscriptionsView/SubscriptionsView.test.tsx`
  - [ ] Composes:
    ```typescript
    export const SubscriptionsView = () => {
      const { subscriptions, isLoading } = useSubscriptions()

      if (isLoading) {
        return <SubscriptionsViewSkeleton />
      }

      if (subscriptions.length === 0) {
        return <SubscriptionsEmptyState />
      }

      return (
        <div>
          <SubscriptionsSummary />
          <SubscriptionsList />
        </div>
      )
    }
    ```
  - [ ] Loading state: Use skeleton components matching final layout (shadcn Skeleton)
  - [ ] Test: Loading state renders skeleton
  - [ ] Test: No subscriptions renders empty state
  - [ ] Test: With subscriptions renders summary + list

- [ ] Task 8: Update sidebar subscription count (AC: #1)
  - [ ] Modify `src/components/Layout/Sidebar.tsx`
  - [ ] Add active subscription count next to "S Subscriptions":
    ```
    S Subscriptions (7)
    ```
  - [ ] Use `useSubscriptions` hook to get `count`
  - [ ] Only show count when > 0 (hide when no subscriptions)
  - [ ] Test: Count shown when subscriptions exist
  - [ ] Test: Count hidden when no subscriptions

- [ ] Task 9: Write integration tests (AC: all)
  - [ ] Create `src/features/subscriptions/components/SubscriptionsView/SubscriptionsView.integration.test.tsx`
  - [ ] Full flow: Create subscriptions in Dexie -> press S -> summary + list rendered
  - [ ] Sort: Change sort to "Merchant name" -> list re-orders alphabetically
  - [ ] Filter: Filter to "Monthly only" -> only monthly subscriptions shown, summary recalculates
  - [ ] Detail: Click subscription row -> charge history shown with correct transactions
  - [ ] Navigate: Click "View Merchant" -> navigates to merchant detail page
  - [ ] Possibly cancelled: Subscription with status "possibly-cancelled" renders muted with badge
  - [ ] Empty state: No subscriptions in Dexie -> press S -> empty state shown
  - [ ] Sidebar count: 3 active subscriptions -> sidebar shows "S Subscriptions (3)"
  - [ ] Keyboard: J/K navigates between subscription rows, Enter expands detail
  - [ ] Combined filter: S + M both active -> subscriptions view takes precedence (same as Story 5.5 behavior)

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | `useSubscriptions` hook (from Story 9.1) using `useLiveQuery` | No state duplication, Dexie is source of truth |
| UI Components | shadcn Card, Badge, Select, DropdownMenu, Skeleton | Consistent with existing UI patterns |
| Sort/Filter State | Local `useState` in SubscriptionsList | UI-only, not persisted |
| Detail Transactions | `useLiveQuery` with `db.transactions.where('id').anyOf(ids)` | Load on demand when detail expanded |
| Navigation | TanStack Router `useNavigate` for merchant page link | Type-safe routing |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |
| Props types | `{ComponentName}Props` |

### Dependency on Story 9.1

This story depends entirely on Story 9.1 which provides:
- `subscriptions` Dexie table with detected subscription records
- `Subscription` type in `src/types/subscription.types.ts`
- `useSubscriptions` hook in `src/features/subscriptions/hooks/useSubscriptions.ts` returning:
  - `subscriptions: Subscription[]`
  - `active: Subscription[]`
  - `possiblyCancelled: Subscription[]`
  - `monthlyTotal: number`
  - `yearlyTotal: number`
  - `count: number`
  - `isLoading: boolean`
- S key focus mode placeholder (from Story 5.5) already wired up

### Dependency on Story 5.5

Story 5.5 established:
- S key binding in `useKeyboardNavigation` calling `toggleFocusMode('subscriptions')`
- `FocusModeContext` with `activeFilters: Set<FocusMode>` including 'subscriptions'
- Sidebar "S Subscriptions" item with highlight state
- `SubscriptionsPlaceholder` component (to be replaced by this story)
- Breadcrumb "Transactions > Subscriptions" segment
- Combined filter behavior (subscriptions + month, subscriptions + unmatched)

**What this story changes:** Only the rendering when `activeFilters.has('subscriptions')` — swap `SubscriptionsPlaceholder` for `SubscriptionsView`. All keyboard, sidebar, and breadcrumb infrastructure stays as-is.

### Dependency on Story 7.2

Story 7.2 provides the merchant detail page at route `/merchants/$merchantId`. The "View Merchant" link in `SubscriptionDetail` navigates there.

### Subscription Type Reference (from Story 9.1)

```typescript
type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'
type SubscriptionStatus = 'active' | 'possibly-cancelled'

type Subscription = {
  id?: number
  merchantId: number
  merchantName: string
  typicalAmount: number
  frequency: SubscriptionFrequency
  intervalDays: number
  lastChargeDate: string        // ISO date
  firstChargeDate: string       // ISO date
  chargeCount: number
  status: SubscriptionStatus
  transactionIds: number[]
  detectedAt: string            // ISO date
  updatedAt: string             // ISO date
}
```

### Previous Story Intelligence

**From Story 9.1 (Subscription Detection Algorithm):**
- `subscriptions` table schema: `'++id, merchantId, status'`
- `useSubscriptions` hook provides all computed values (monthlyTotal, yearlyTotal, count)
- `transactionIds` array on each subscription links to actual transactions for charge history
- Unique constraint: `merchantId + frequency` (one merchant can have multiple subscriptions at different frequencies)
- Status values: `'active'` and `'possibly-cancelled'`
- Detection runs asynchronously after import — `useLiveQuery` auto-updates UI

**From Story 5.5 (Focus Mode - Subscriptions Placeholder):**
- S key handler: `case 's': toggleFocusMode('subscriptions')`
- TransactionList check: `if (activeFilters.has('subscriptions')) { return <SubscriptionsPlaceholder /> }`
- Combined filter: When subscriptions is active, subscriptions view takes precedence regardless of other active filters
- Sidebar click: Same as pressing S (toggle)
- Selection cleared on focus mode change

**From Story 6.1 (Spending Breakdown by Category):**
- Card component pattern for stat display — reuse for subscription summary cards
- Pattern: shadcn Card with title + value layout

**From Story 7.1 (Merchants List View):**
- List view pattern with sort/filter controls
- J/K navigation between rows
- Expandable detail pattern
- shadcn Select for sort/filter dropdowns

### Git Intelligence

Recent commits are all story creation (no implementation code yet). All stories are `ready-for-dev` or `backlog`. No implementation patterns to extract.

### File Structure for This Story

```
src/
├── features/
│   ├── subscriptions/
│   │   ├── components/
│   │   │   ├── SubscriptionRow/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── SubscriptionRow.test.tsx (new)
│   │   │   ├── SubscriptionsSummary/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── SubscriptionsSummary.test.tsx (new)
│   │   │   ├── SubscriptionDetail/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── SubscriptionDetail.test.tsx (new)
│   │   │   ├── SubscriptionsList/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── SubscriptionsList.test.tsx (new)
│   │   │   ├── SubscriptionsEmptyState/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── SubscriptionsEmptyState.test.tsx (new)
│   │   │   ├── SubscriptionsView/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   ├── SubscriptionsView.test.tsx (new)
│   │   │   │   └── SubscriptionsView.integration.test.tsx (new)
│   │   │   └── SubscriptionsPlaceholder/ (DELETE — replaced by SubscriptionsView)
│   │   └── index.ts (modify — add new component exports)
│   └── transactions/
│       └── components/
│           └── TransactionList/
│               └── index.tsx (modify — swap placeholder for SubscriptionsView)
└── components/
    └── Layout/
        └── Sidebar.tsx (modify — add subscription count badge)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `useSubscriptions` | `src/features/subscriptions/hooks/useSubscriptions.ts` | Reactive subscription data (from Story 9.1) |
| `db` (Dexie instance) | `src/lib/db/index.ts` | Direct transaction queries for charge history |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries for charge history |
| `useFocusMode` | `src/context/FocusModeContext.tsx` | Focus mode state + toggleFocusMode |
| `useKeyboardNavigation` | `src/hooks/useKeyboardNavigation.ts` | J/K navigation (already supports S key) |
| `useNavigate` | `@tanstack/react-router` | Navigate to merchant page |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount display formatting |
| `cn` | `@/lib/utils` | Conditional class names |
| `Card` | shadcn/ui | Stat cards in summary |
| `Badge` | shadcn/ui | Status badges (active, possibly-cancelled) |
| `Select` | shadcn/ui | Sort/filter dropdowns |
| `Skeleton` | shadcn/ui | Loading state |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `useKeyboardNavigation.ts` | S key already wired from Story 5.5 |
| `FocusModeContext.tsx` | 'subscriptions' already in FocusMode type |
| `Breadcrumb` | Already shows "Subscriptions" segment from Story 5.5 |
| `subscriptionDetector.ts` | Detection logic not touched by this UI story |
| `useSubscriptions.ts` | Hook from Story 9.1 provides everything needed |
| `CommandPalette` | No new commands in this story |
| `TransactionRow` | Individual transaction rows not affected |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| S key toggle | <100ms | Already handled by FocusModeContext (Story 5.5) |
| Subscription list render | <100ms | Small dataset (<100 subscriptions typically), no virtualization needed |
| Summary calculation | <16ms | Pre-computed in `useSubscriptions` hook (Story 9.1) |
| Charge history load | <100ms | `useLiveQuery` with indexed ID lookup |
| Sort/filter | <16ms | Client-side array operations on small dataset |

**No TanStack Virtual needed:** Subscription lists are inherently small (users rarely have >50 subscriptions). Simple array mapping is sufficient.

### Edge Cases to Handle

1. **No subscriptions detected:** Show SubscriptionsEmptyState with guidance to import more statements
2. **All subscriptions possibly cancelled:** Summary shows EUR0.00 for totals (only active subscriptions counted)
3. **Single subscription:** List works with 1 item, summary shows its cost
4. **Subscription with empty transactionIds:** Detail shows "No charge history available" — defensive edge case
5. **Very large amounts:** formatCurrency handles large numbers correctly
6. **Merchant deleted but subscription remains:** Show merchantName (denormalized) even if merchant no longer exists
7. **Mixed frequencies:** Summary correctly normalizes (monthly x12, weekly x52, yearly x1) for yearly total
8. **Filter results in empty list:** Show "No subscriptions match filters" (not the SubscriptionsEmptyState)
9. **Loading state:** Skeleton matching summary cards + list rows while `useLiveQuery` resolves

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT duplicate subscription data from `useSubscriptions` into local state — the hook provides everything
- DO NOT create separate Dexie queries when `useSubscriptions` already computes totals
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT add external charting/visualization libraries — this is a list view, not a chart
- DO NOT modify the detection algorithm — this is a UI-only story
- DO NOT add subscription creation/deletion UI — subscriptions are auto-detected only
- DO NOT use TanStack Virtual for the subscription list — too few items to justify
- DO NOT add new keyboard shortcuts — S key already works from Story 5.5
- DO NOT modify breadcrumb — already shows "Subscriptions" from Story 5.5
- DO NOT persist sort/filter preferences to Dexie — keep as local state

### Scope Boundaries

**In scope (this story):**
- SubscriptionRow component (display each subscription)
- SubscriptionsSummary component (monthly/yearly cost, active count)
- SubscriptionDetail component (charge history, merchant link)
- SubscriptionsList component (list with sort/filter)
- SubscriptionsEmptyState component (no subscriptions)
- SubscriptionsView wrapper component (orchestrates above)
- Replace SubscriptionsPlaceholder with SubscriptionsView in TransactionList
- Sidebar subscription count badge
- Delete SubscriptionsPlaceholder component

**Out of scope (future stories):**
- Manual subscription confirmation/dismissal
- Subscription cost alerts or notifications
- Export subscription data
- Dashboard subscription widget
- Subscription editing or manual creation
- High-amount anomaly detection (Story 9.3)
- New merchant anomaly detection (Story 9.4)
- Duplicate anomaly detection (Story 9.5)

### Validation Checklist

Before marking complete:
- [ ] S key shows real subscriptions view (not placeholder)
- [ ] Subscriptions list displays merchant name, amount, frequency, last charge
- [ ] Default sort is by amount (highest first)
- [ ] Sort options work: amount, merchant name, last charge, frequency
- [ ] Filter by frequency works: all, monthly, yearly, weekly
- [ ] Filter by status works: all, active, possibly cancelled
- [ ] Summary shows monthly total, yearly total, active count
- [ ] Click subscription row shows charge history detail
- [ ] Charge history shows correct transactions with dates and amounts
- [ ] "View Merchant" navigates to merchant detail page
- [ ] "Possibly cancelled" subscriptions show muted style + badge
- [ ] Empty state shown when no subscriptions detected
- [ ] Sidebar shows subscription count next to "S Subscriptions"
- [ ] Loading skeleton shown while data loads
- [ ] J/K keyboard navigation works between subscription rows
- [ ] Enter key expands subscription detail
- [ ] Combined filters (S+M) show subscriptions view (takes precedence)
- [ ] SubscriptionsPlaceholder from Story 5.5 deleted
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No unnecessary external dependencies added

### Project Structure Notes

- All new components under `src/features/subscriptions/components/` — matching feature module pattern
- No new database changes — uses existing `subscriptions` table from Story 9.1
- No new hooks — uses `useSubscriptions` from Story 9.1
- Minimal modifications to existing code: TransactionList (swap placeholder) and Sidebar (add count)
- S key infrastructure (keyboard, context, breadcrumb) entirely from Story 5.5 — no changes

### References

- [Source: epics.md#Epic-9-Story-9.2-Subscriptions-View-S-Key]
- [Source: prd.md#FR37 - User can view all detected subscriptions in a dedicated view]
- [Source: prd.md#FR38 - User can see subscription amounts and frequency]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, no state duplication]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/subscriptions/ for UI components]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, shadcn/ui, TanStack Router]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#View-Modes - S key toggles Subscriptions view]
- [Source: ux-design-specification.md#Keyboard-Patterns - J/K navigation, view switching]
- [Source: ux-design-specification.md#Sidebar-Navigation - Focus Modes section with S Subscriptions]
- [Source: ux-design-specification.md#Component-Density - Transaction row 48px, cards, badges]
- [Story 9.1: Subscription Detection Algorithm - subscriptions table, Subscription type, useSubscriptions hook, transactionIds]
- [Story 5.5: Focus Mode - Subscriptions Placeholder (S Key) - S key binding, FocusModeContext, sidebar, breadcrumb, SubscriptionsPlaceholder to replace]
- [Story 7.2: Merchant Detail Page - /merchants/$merchantId route for "View Merchant" link]
- [Story 7.1: Merchants List View - List view pattern with sort/filter, J/K navigation, expandable detail]
- [Story 6.1: Spending Breakdown by Category - Card stat display pattern]
- [Story 3.2: Keyboard Navigation with J/K - useKeyboardNavigation, input field guard]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
