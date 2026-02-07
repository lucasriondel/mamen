# Story 6.1: Spending Breakdown by Category

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see my spending broken down by category on the dashboard**,
So that **I can answer "where does my money go?" at a glance (FR29)**.

## Acceptance Criteria

1. **Given** I have categorized transactions
   **When** I view the Dashboard
   **Then** I see a spending breakdown by category
   **And** each category shows its total amount
   **And** categories are sorted by amount (highest first)

2. **Given** I view the category breakdown
   **When** looking at the visualization
   **Then** I see a clear visual representation (proportional bars or bar chart)
   **And** each category has its assigned color from the UX color palette
   **And** amounts are formatted with currency symbol

3. **Given** I have transactions in multiple categories
   **When** I view the breakdown
   **Then** I see the total spending amount at the top
   **And** each category shows its percentage of total
   **And** subcategories are rolled up into parent categories

4. **Given** I have uncategorized (unmatched) transactions
   **When** I view the breakdown
   **Then** they appear as "Uncategorized" category
   **And** this is visually distinct (muted or warning color)

5. **Given** I have no transactions
   **When** I view the Dashboard
   **Then** I see an empty state with guidance to import statements

6. **Given** I have only income transactions (positive amounts)
   **When** I view the breakdown
   **Then** income is shown separately or excluded from "spending"
   **And** the dashboard focuses on expenses by default

## Tasks / Subtasks

- [ ] Task 1: Create dashboard feature module structure (AC: all)
  - [ ] Create `src/features/dashboard/` directory
  - [ ] Create `src/features/dashboard/index.ts` (feature exports)
  - [ ] Create `src/features/dashboard/hooks/` directory
  - [ ] Create `src/features/dashboard/components/` directory

- [ ] Task 2: Create `useSpendingBreakdown` hook (AC: #1, #2, #3, #4, #6)
  - [ ] Create `src/features/dashboard/hooks/useSpendingBreakdown.ts`
  - [ ] Create `src/features/dashboard/hooks/useSpendingBreakdown.test.ts`
  - [ ] Use `useLiveQuery` from Dexie to query transactions reactively
  - [ ] Query logic:
    ```typescript
    // Query all transactions (default: current month — Story 6.2 will add time period selection)
    // For now, show ALL transactions since there's no time filter yet
    const transactions = useLiveQuery(() => db.transactions.toArray())
    ```
  - [ ] Aggregation logic:
    - Group transactions by `categoryId` (parent category)
    - Sum amounts per category (negative amounts = expenses, positive = income)
    - Separate expenses from income
    - Calculate percentage of total for each category
    - Sort by absolute amount descending
    - Include "Uncategorized" for transactions without a category
  - [ ] Return type:
    ```typescript
    type SpendingBreakdownItem = {
      categoryId: string | null
      categoryName: string
      subcategories: { name: string; amount: number }[]
      totalAmount: number
      percentage: number
      color: string
    }

    type SpendingBreakdown = {
      items: SpendingBreakdownItem[]
      totalExpenses: number
      totalIncome: number
      uncategorizedAmount: number
      uncategorizedCount: number
    }
    ```
  - [ ] Map category IDs to display names using category data from Dexie
  - [ ] Assign colors from the category color palette (see Dev Notes)

- [ ] Task 3: Create `CategoryBreakdown` component (AC: #1, #2, #3, #4)
  - [ ] Create `src/features/dashboard/components/CategoryBreakdown/index.tsx`
  - [ ] Create `src/features/dashboard/components/CategoryBreakdown/CategoryBreakdown.test.tsx`
  - [ ] Display total spending at top: "Total Spending: €X,XXX.XX"
  - [ ] Render each category as a row:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │ [Color] Shopping                    €1,200.00  (35%)        │
    │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
    ├─────────────────────────────────────────────────────────────┤
    │ [Color] Dining                        €450.00  (13%)        │
    │ ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
    ├─────────────────────────────────────────────────────────────┤
    │ [Muted] Uncategorized                 €200.00   (6%)        │
    │ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [ ] Each row: category color dot, name, amount (monospace, right-aligned), percentage
  - [ ] Proportional bar showing relative spend per category
  - [ ] "Uncategorized" row uses muted/warning color and is visually distinct
  - [ ] Categories sorted by amount descending
  - [ ] Amounts formatted with `formatCurrency` utility (from `src/lib/utils/formatCurrency.ts`)
  - [ ] Keyboard accessible: Tab to navigate categories, Enter to drill down (wired in Story 6.4)
  - [ ] Focus ring on focused category row (per UX spec: `ring` color)

- [ ] Task 4: Create `SpendingSummary` component (AC: #3, #6)
  - [ ] Create `src/features/dashboard/components/SpendingSummary/index.tsx`
  - [ ] Create `src/features/dashboard/components/SpendingSummary/SpendingSummary.test.tsx`
  - [ ] Display:
    - Total expenses (sum of negative amounts)
    - Optionally show total income if positive transactions exist
    - Number of categories with spending
    - Number of uncategorized transactions (if > 0, show as warning)
  - [ ] Use Card component from shadcn/ui for stats
  - [ ] Amounts in monospace (JetBrains Mono per UX spec)

- [ ] Task 5: Create `DashboardPage` component (AC: #5, all)
  - [ ] Create `src/features/dashboard/components/DashboardPage/index.tsx`
  - [ ] Create `src/features/dashboard/components/DashboardPage/DashboardPage.test.tsx`
  - [ ] Compose `SpendingSummary` + `CategoryBreakdown`
  - [ ] Empty state when no transactions:
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │                   No transactions yet                       │
    │                                                             │
    │     Import bank statements to see your spending breakdown   │
    │                                                             │
    │                  [Import Statements]                        │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘
    ```
  - [ ] "Import Statements" button navigates to Accounts/Import page
  - [ ] Page layout: SpendingSummary at top, CategoryBreakdown below
  - [ ] Breadcrumb shows "Dashboard" (single segment)

- [ ] Task 6: Wire Dashboard route (AC: all)
  - [ ] Modify `src/routes/index.tsx` (Dashboard route — this is the app home page)
  - [ ] Render `DashboardPage` component
  - [ ] Ensure sidebar "Dashboard" nav item is active when on this route

- [ ] Task 7: Write tests (AC: all)
  - [ ] `useSpendingBreakdown.test.ts`:
    - Test: Returns empty breakdown when no transactions
    - Test: Correctly groups expenses by category
    - Test: Separates income from expenses
    - Test: Calculates percentages correctly
    - Test: Includes "Uncategorized" for transactions without category
    - Test: Sorts categories by amount descending
    - Test: Assigns correct colors to categories
  - [ ] `CategoryBreakdown.test.tsx`:
    - Test: Renders category rows with name, amount, percentage
    - Test: Renders proportional bars
    - Test: "Uncategorized" row uses distinct styling
    - Test: Empty state shown when no data
    - Test: Amounts formatted with currency symbol
    - Test: Categories sorted by amount
  - [ ] `SpendingSummary.test.tsx`:
    - Test: Shows total expenses
    - Test: Shows income separately when present
    - Test: Shows uncategorized count as warning
  - [ ] `DashboardPage.test.tsx`:
    - Test: Renders empty state when no transactions
    - Test: Renders SpendingSummary and CategoryBreakdown when data exists
    - Test: "Import Statements" button navigates correctly

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Dashboard Location | `src/features/dashboard/` | Feature module per architecture |
| Visualization | Pure CSS/Tailwind proportional bars | No charting library needed for bars — architecture recommends Recharts only if needed |

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

### Category Color Palette

**Source: [ux-design-specification.md#Category-Colors]**

Assign these CSS custom property colors to categories in order:

```css
--category-1: hsl(212 100% 60%);  /* Blue - first category */
--category-2: hsl(142 76% 46%);   /* Green */
--category-3: hsl(38 92% 55%);    /* Orange */
--category-4: hsl(280 80% 60%);   /* Purple */
--category-5: hsl(0 84% 65%);     /* Red */
--category-6: hsl(180 70% 50%);   /* Cyan */
--category-7: hsl(330 80% 60%);   /* Pink */
--category-8: hsl(60 70% 55%);    /* Yellow */
```

"Uncategorized" uses `hsl(215 20% 65%)` (muted-foreground).

### Income vs Expenses Logic

- Negative amounts = expenses (money going out)
- Positive amounts = income (money coming in)
- Dashboard default view shows expenses only
- Income is shown in a separate section or excluded from the breakdown bars
- If the transaction amount sign convention differs per bank, this should be handled at import time (not in dashboard)

### No Charting Library Yet

The architecture doc says: "Charting library: Add during dashboard implementation (Recharts recommended)". For Story 6.1, **proportional bars built with Tailwind CSS are sufficient**. This avoids adding a dependency for a simple bar visualization. If more complex charts are needed in Stories 6.2-6.4, Recharts can be added then.

Implementation pattern for proportional bars:
```tsx
<div className="h-2 rounded-full bg-muted overflow-hidden">
  <div
    className="h-full rounded-full"
    style={{ width: `${percentage}%`, backgroundColor: color }}
  />
</div>
```

### Dashboard Is the Home Route

**Source: [architecture.md#Project-Structure]**

The `src/routes/index.tsx` file is the Dashboard route. This is the app's home page. The sidebar "Dashboard" navigation item links here.

### Category Data Access

Categories are seeded in Story 4.1 into Dexie. To get category names and map them:
- Query the categories/settings from Dexie
- The category system from Story 4.1 defines parent categories with subcategories
- For the dashboard breakdown, roll up subcategories into parent categories
- The `categoryId` on transactions references the category assigned via rules (Story 4.3+) or manual assignment (Story 4.7)

### Time Period — NOT in This Story

This story shows ALL transactions with no time filter. Story 6.2 adds time period selection (current month default, custom ranges). Do NOT implement time filtering in 6.1 — keep it simple.

### Drill-Down — NOT in This Story

Story 6.4 adds click-to-drill-down on categories. For now, category rows in the breakdown are display-only. However, make them focusable with Tab for keyboard accessibility preparation.

### Month-over-Month — NOT in This Story

Story 6.3 adds comparison with previous period. Do NOT add comparison indicators in 6.1.

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Currency formatting |
| `formatDate` | `src/lib/utils/formatDate.ts` | Date formatting |
| Card | `src/components/ui/card.tsx` | shadcn Card for stats |
| Badge | `src/components/ui/badge.tsx` | Category badges |
| Button | `src/components/ui/button.tsx` | CTA buttons |
| Sidebar | `src/components/Layout/Sidebar.tsx` | Dashboard nav item already exists |
| Breadcrumb | Breadcrumb component (from Story 3.5) | Show "Dashboard" segment |
| TanStack Router | `@tanstack/react-router` | Route navigation |

### Existing Components - NO Changes Needed

| Component | Location | Reason |
|-----------|----------|--------|
| TransactionRow | `src/components/TransactionRow/index.tsx` | Not used on dashboard |
| MerchantAssignmentModal | `src/features/merchants/components/` | Not used on dashboard |
| CommandPalette | `src/components/CommandPalette/index.tsx` | Unchanged |
| useKeyboardNavigation | `src/hooks/useKeyboardNavigation.ts` | Unchanged |
| FocusModeContext | `src/context/FocusModeContext.tsx` | Not used on dashboard |

### Previous Story Intelligence

**No previous story in this epic** — Story 6.1 is the first story in Epic 6. However, previous epics (1-5) establish:

- Dexie database with `transactions`, `merchants`, `rules` tables
- Category system seeded in Story 4.1 with parent/subcategory structure
- Transactions have `categoryId` and `merchantId` fields
- `useLiveQuery` pattern used throughout for reactive data access
- `formatCurrency` utility exists for amount formatting
- Layout with sidebar, breadcrumbs, and routing is fully established
- All 50 previous story creation commits follow the same pattern

### Git Intelligence

All recent commits are story creation commits (no implementation code). Pattern: `feat(story): create story X-Y description`. No implementation patterns to extract from git history.

### Data Flow

```
DashboardPage loads
  |
useSpendingBreakdown hook fires
  |
useLiveQuery queries Dexie transactions table
  |
Aggregation: group by categoryId, sum amounts, calc percentages
  |
Map categoryIds to display names via category data
  |
Assign colors from palette
  |
Sort by amount descending
  |
SpendingSummary renders total + stats
  |
CategoryBreakdown renders sorted category rows with bars
```

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Dashboard render | <100ms (Dexie direct query, no state duplication) |
| Aggregation | Efficient for 10k+ transactions (Dexie indexed queries) |
| Scroll | Not applicable (categories list is short, no virtualization needed) |

### Typography for Amounts

**Source: [ux-design-specification.md#Typography-System]**

- Amounts use monospace font: `font-mono` Tailwind class (JetBrains Mono / Fira Code)
- Tabular numbers for consistent digit width: `tabular-nums`
- Size: `body` (14px / 0.875rem) for category amounts
- Right-aligned amounts

### Project Structure for This Story

```
src/
├── features/
│   └── dashboard/
│       ├── index.ts (new - feature exports)
│       ├── hooks/
│       │   ├── useSpendingBreakdown.ts (new)
│       │   └── useSpendingBreakdown.test.ts (new)
│       └── components/
│           ├── CategoryBreakdown/
│           │   ├── index.tsx (new)
│           │   └── CategoryBreakdown.test.tsx (new)
│           ├── SpendingSummary/
│           │   ├── index.tsx (new)
│           │   └── SpendingSummary.test.tsx (new)
│           └── DashboardPage/
│               ├── index.tsx (new)
│               └── DashboardPage.test.tsx (new)
└── routes/
    └── index.tsx (modify - render DashboardPage)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT duplicate Dexie data in React state — use `useLiveQuery` directly
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT add a charting library (Recharts) unless proportional bars are insufficient
- DO NOT implement time period filtering (that's Story 6.2)
- DO NOT implement drill-down click behavior (that's Story 6.4)
- DO NOT implement month-over-month comparison (that's Story 6.3)
- DO NOT add complex animations or transitions — keep dashboard simple and fast
- DO NOT create a separate API/service layer — query Dexie directly in the hook

### Validation Checklist

Before marking complete:
- [ ] Dashboard shows spending breakdown by category
- [ ] Categories sorted by amount (highest first)
- [ ] Each category shows: color, name, amount, percentage, proportional bar
- [ ] Total spending amount displayed at top
- [ ] "Uncategorized" row appears with distinct styling when unmatched transactions exist
- [ ] Empty state shown when no transactions exist
- [ ] "Import Statements" button navigates correctly
- [ ] Income separated from expenses
- [ ] Amounts formatted with currency symbol and monospace font
- [ ] Dashboard route (`/`) renders DashboardPage
- [ ] Sidebar "Dashboard" nav item active on dashboard route
- [ ] Breadcrumb shows "Dashboard"
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass
- [ ] `useLiveQuery` used for data access (no state duplication)
- [ ] Category colors match UX palette
- [ ] Keyboard accessible (Tab between categories)

### References

- [Source: epics.md#Epic-6-Story-6.1-Spending-Breakdown-by-Category]
- [Source: prd.md#FR29 - User can view spending breakdown by category]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: architecture.md#Gap-Analysis - Charting library: Add during dashboard implementation (Recharts recommended)]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Performance-Requirements]
- [Source: ux-design-specification.md#Category-Colors]
- [Source: ux-design-specification.md#Typography-System]
- [Source: ux-design-specification.md#Visual-Design-Foundation]
- [Source: ux-design-specification.md#Empty-Loading-States]
- [Source: ux-design-specification.md#Design-Direction-Decision - Linear Layout]
- [Story 4.1: Category System Setup - category seeding and structure]
- [Story 4.7: Quick Category Assignment - categoryId on transactions]
- [Story 1.2: Establish Dexie Database Schema - transactions table]
- [Story 1.3: Create App Shell with Linear Layout - sidebar, routing, breadcrumbs]
- [Story 3.5: Breadcrumb Navigation - breadcrumb component patterns]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
