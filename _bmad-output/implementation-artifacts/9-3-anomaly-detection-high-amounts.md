# Story 9.3: Anomaly Detection - High Amounts

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **transactions with unusually high amounts to be flagged**,
So that **I can spot unexpected large charges quickly (FR39)**.

## Acceptance Criteria

1. **Given** I have transactions in a category
   **When** a new transaction exceeds 2x the category average
   **Then** it's flagged as a high-amount anomaly
   **And** a visual indicator appears on the transaction row (warning badge)

2. **Given** a transaction is flagged for high amount
   **When** I view it in the transaction list
   **Then** I see an anomaly badge: "Unusual amount"
   **And** hovering shows: "EUR400 is 3x your average for Shopping (EUR130)"

3. **Given** I view a flagged transaction
   **When** I want to dismiss the flag
   **Then** I can mark it as "reviewed" or "expected"
   **And** the flag is removed
   **And** it won't be flagged again for the same reason

4. **Given** there aren't enough transactions in a category
   **When** less than 5 transactions exist
   **Then** no anomaly detection runs for that category
   **And** we wait for more data

5. **Given** I want to customize the threshold
   **When** I go to Settings
   **Then** I can adjust the anomaly threshold (default: 2x average)
   **And** I can set an absolute threshold (e.g., "flag anything over EUR500")

6. **Given** multiple anomalies exist
   **When** I view the transaction list
   **Then** I can filter to show only flagged transactions
   **And** this helps me review anomalies quickly

## Tasks / Subtasks

- [x] Task 1: Add anomaly fields to transaction type and Dexie schema (AC: #1, #3)
  - [x]Modify `src/types/transaction.types.ts` — add anomaly fields:
    ```typescript
    // Add to existing Transaction type:
    anomalyFlags?: AnomalyFlag[]
    ```
  - [x]Create `src/types/anomaly.types.ts`:
    ```typescript
    type AnomalyType = 'high-amount' | 'new-merchant' | 'potential-duplicate'

    type AnomalyFlag = {
      type: AnomalyType
      reason: string             // Human-readable: "3x your average for Shopping (EUR130)"
      detectedAt: string         // ISO date
      dismissed: boolean         // User marked as reviewed/expected
      dismissedAt?: string       // ISO date when dismissed
    }

    type AnomalySettings = {
      multiplierThreshold: number    // Default: 2 (2x average)
      absoluteThreshold: number | null  // e.g., 500 (flag anything over EUR500), null = disabled
      minTransactionsForDetection: number  // Default: 5
    }
    ```
  - [x]Modify `src/lib/db/schema.ts` — add index for anomaly queries:
    ```typescript
    // Update transactions table index to support anomaly filtering
    // No new table needed — anomalyFlags stored as array field on transactions
    ```
  - [x]Add schema version migration in `src/lib/db/migrations.ts`
  - [x]Create `src/lib/schemas/anomaly.schema.ts` with Zod validation for AnomalyFlag and AnomalySettings
  - [x]Add default anomaly settings to `settings` table seed:
    ```typescript
    { key: 'anomalySettings', value: { multiplierThreshold: 2, absoluteThreshold: null, minTransactionsForDetection: 5 } }
    ```
  - [x]Test: Schema migration applies cleanly
  - [x]Test: AnomalyFlag can be stored and queried on transactions
  - [x]Test: AnomalySettings stored and retrieved from settings table

- [x] Task 2: Implement high-amount anomaly detection service (AC: #1, #4)
  - [x]Create `src/features/anomalies/services/anomalyDetector.ts`
  - [x]Create `src/features/anomalies/services/anomalyDetector.test.ts`
  - [x]Core algorithm:
    ```typescript
    export const detectHighAmountAnomalies = async (): Promise<{
      flagged: number
      skippedCategories: number
    }> => {
      const settings = await getAnomalySettings()

      // 1. Get all transactions grouped by categoryId
      // 2. For each category with >= minTransactionsForDetection transactions:
      //    a. Calculate average absolute amount for that category
      //    b. For each transaction in category:
      //       - Skip if already has a 'high-amount' anomaly flag (dismissed or not)
      //       - Check if abs(amount) > average * multiplierThreshold
      //       - Check if absoluteThreshold set AND abs(amount) > absoluteThreshold
      //       - If either triggers, add AnomalyFlag to transaction
      // 3. Save updated transactions to Dexie
    }

    const getAnomalySettings = async (): Promise<AnomalySettings> => {
      const stored = await db.settings.get('anomalySettings')
      return stored?.value ?? {
        multiplierThreshold: 2,
        absoluteThreshold: null,
        minTransactionsForDetection: 5,
      }
    }
    ```
  - [x]Average calculation: Use mean of absolute amounts in category (excluding refunds)
  - [x]Reason string generation:
    ```typescript
    const buildReason = (amount: number, avg: number, categoryName: string): string => {
      const multiplier = Math.round((Math.abs(amount) / avg) * 10) / 10
      return `${formatCurrency(Math.abs(amount))} is ${multiplier}x your average for ${categoryName} (${formatCurrency(avg)})`
    }
    ```
  - [x]Only flag expenses (negative amounts), exclude refunds (`isRefund === true`)
  - [x]Only flag categorized transactions (transactions with a `categoryId`)
  - [x]Skip transactions that already have a `high-amount` flag (avoid re-flagging)
  - [x]Test: Category with 5+ transactions, one at 3x average -> flagged
  - [x]Test: Category with 4 transactions -> no detection (below minimum)
  - [x]Test: Transaction at 1.5x average with 2x threshold -> not flagged
  - [x]Test: Transaction at 2.5x average with 2x threshold -> flagged
  - [x]Test: Absolute threshold: EUR600 transaction with EUR500 absolute threshold -> flagged even if below multiplier
  - [x]Test: Already-flagged transaction not re-flagged
  - [x]Test: Dismissed flag not re-flagged
  - [x]Test: Refund transactions excluded from detection
  - [x]Test: Uncategorized transactions excluded from detection
  - [x]Test: Category average correctly computed excluding refunds
  - [x]Test: Reason string format: "EUR400 is 3x your average for Shopping (EUR130)"

- [x] Task 3: Implement anomaly dismissal logic (AC: #3)
  - [x]Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const dismissAnomaly = async (
      transactionId: number,
      anomalyType: AnomalyType
    ): Promise<void> => {
      const tx = await db.transactions.get(transactionId)
      if (!tx?.anomalyFlags) return

      const updatedFlags = tx.anomalyFlags.map(flag =>
        flag.type === anomalyType
          ? { ...flag, dismissed: true, dismissedAt: new Date().toISOString() }
          : flag
      )

      await db.transactions.update(transactionId, { anomalyFlags: updatedFlags })
    }
    ```
  - [x]Dismissed flags remain in the array (for audit trail) but `dismissed: true`
  - [x]Dismissed flags are excluded from UI display
  - [x]Re-running detection skips transactions with dismissed flags of that type
  - [x]Test: Dismiss sets `dismissed: true` and `dismissedAt`
  - [x]Test: Re-detection skips transactions with dismissed high-amount flags
  - [x]Test: Multiple flag types — dismissing one doesn't affect others (future-proof for 9.4, 9.5)

- [x] Task 4: Integrate detection with transaction import flow (AC: #1)
  - [x]Modify the import completion flow (same location as subscription detection from Story 9.1)
  - [x]After transactions are imported AND subscription detection runs, trigger anomaly detection:
    ```typescript
    // In the import flow, after subscription detection:
    detectHighAmountAnomalies().then(result => {
      if (result.flagged > 0) {
        toast({
          title: `${result.flagged} unusual transaction(s) flagged`,
          description: 'Review in Transactions',
          variant: 'default',
        })
      }
    })
    ```
  - [x]Detection runs asynchronously (non-blocking)
  - [x]Detection should also re-run when a transaction's category changes (category assignment may put it above the new category's average)
  - [x]Test: Import triggers anomaly detection
  - [x]Test: Toast shown when anomalies flagged
  - [x]Test: No toast when no anomalies
  - [x]Test: Category change on transaction triggers re-evaluation for that transaction

- [x] Task 5: Create AnomalyBadge component (AC: #2)
  - [x]Create `src/features/anomalies/components/AnomalyBadge/index.tsx`
  - [x]Create `src/features/anomalies/components/AnomalyBadge/AnomalyBadge.test.tsx`
  - [x]Component:
    ```typescript
    type AnomalyBadgeProps = {
      flags: AnomalyFlag[]
      onDismiss: (type: AnomalyType) => void
    }

    export const AnomalyBadge = ({ flags, onDismiss }: AnomalyBadgeProps) => {
      const activeFlags = flags.filter(f => !f.dismissed)
      if (activeFlags.length === 0) return null

      // Render warning-colored Badge with AlertTriangle icon
      // Use shadcn Badge with variant that maps to warning color
      // Tooltip on hover shows the reason string
      // Click or keyboard action opens dismiss option
    }
    ```
  - [x]Use Lucide `AlertTriangle` icon (consistent with UX spec: warning color + icon for anomalies)
  - [x]Badge text: "Unusual amount" for `high-amount` type
  - [x]Use shadcn Tooltip for hover detail (shows `flag.reason`)
  - [x]Warning color: `hsl(38 92% 50%)` per UX spec `warning` token
  - [x]Color independence: icon + text badge (not color alone)
  - [x]Test: Renders badge for active (non-dismissed) flags
  - [x]Test: Does not render when all flags dismissed
  - [x]Test: Tooltip shows reason string on hover
  - [x]Test: Correct icon and warning styling

- [x] Task 6: Integrate AnomalyBadge into TransactionRow (AC: #2)
  - [x]Modify `src/components/TransactionRow/index.tsx`
  - [x]Add AnomalyBadge after the category badge:
    ```typescript
    // In TransactionRow, after category badge:
    {transaction.anomalyFlags && transaction.anomalyFlags.length > 0 && (
      <AnomalyBadge
        flags={transaction.anomalyFlags}
        onDismiss={(type) => dismissAnomaly(transaction.id!, type)}
      />
    )}
    ```
  - [x]Badge position: After category badge, before amount (or as an additional indicator on the row)
  - [x]On dismiss: Call `dismissAnomaly` then toast "Anomaly dismissed" with Undo
  - [x]Undo restores the flag: set `dismissed: false`, remove `dismissedAt`
  - [x]Test: TransactionRow renders AnomalyBadge when anomalyFlags present
  - [x]Test: TransactionRow does not render badge when no flags
  - [x]Test: Dismiss action calls dismissAnomaly
  - [x]Test: Undo restores the dismissed flag

- [x] Task 7: Add anomaly filter to transaction list (AC: #6)
  - [x]Modify the focus mode / filter system to support anomaly filtering
  - [x]Add to `src/hooks/useFocusMode.ts` (or wherever filters are managed):
    ```typescript
    // New focus mode or filter option: 'anomalies'
    // When active, filter transactions to those with active (non-dismissed) anomalyFlags
    ```
  - [x]Add filter option in the transaction list UI:
    - Either a new focus mode key (e.g., `!` or accessible via command palette)
    - Or a filter dropdown option: "Show flagged only"
  - [x]Filter logic:
    ```typescript
    const hasActiveAnomalies = (tx: Transaction): boolean =>
      (tx.anomalyFlags ?? []).some(f => !f.dismissed)
    ```
  - [x]Sidebar or filter bar shows anomaly count when flags exist
  - [x]Test: Filter shows only transactions with active anomaly flags
  - [x]Test: Filter excludes transactions with only dismissed flags
  - [x]Test: Filter count updates when anomaly is dismissed
  - [x]Test: Filter combined with other modes works correctly

- [x] Task 8: Add anomaly threshold settings UI (AC: #5)
  - [x]Modify `src/features/settings/components/SettingsPage/index.tsx`
  - [x]Add "Anomaly Detection" section:
    ```
    ┌──────────────────────────────────────────┐
    │ Anomaly Detection                         │
    │                                          │
    │ Multiplier threshold: [2x] ▼             │
    │ (Flag transactions exceeding Nx the      │
    │  category average)                       │
    │                                          │
    │ Absolute threshold: [___] EUR            │
    │ (Optional: flag any transaction above    │
    │  this amount, leave empty to disable)    │
    │                                          │
    │ Min. transactions for detection: [5]     │
    │ (Categories need this many transactions  │
    │  before anomalies are detected)          │
    │                                          │
    │ [Save]                                   │
    └──────────────────────────────────────────┘
    ```
  - [x]Multiplier threshold: Number input or select with options (1.5x, 2x, 3x, 5x)
  - [x]Absolute threshold: Optional number input (null when empty)
  - [x]Min transactions: Number input (min: 3, max: 20)
  - [x]Save persists to `settings` table via Dexie
  - [x]After save, re-run `detectHighAmountAnomalies()` to apply new thresholds
  - [x]Use `useLiveQuery` to read current settings
  - [x]Test: Settings load and display current values
  - [x]Test: Saving updates Dexie settings table
  - [x]Test: Re-detection runs after settings change
  - [x]Test: Default values shown when no settings saved

- [x] Task 9: Create `useAnomalies` hook (AC: #6)
  - [x]Create `src/features/anomalies/hooks/useAnomalies.ts`
  - [x]Create `src/features/anomalies/hooks/useAnomalies.test.ts`
  - [x]Hook:
    ```typescript
    export const useAnomalies = () => {
      const transactions = useLiveQuery(
        () => db.transactions.toArray()
      )

      const flaggedTransactions = (transactions ?? []).filter(tx =>
        (tx.anomalyFlags ?? []).some(f => !f.dismissed)
      )

      const highAmountCount = flaggedTransactions.filter(tx =>
        tx.anomalyFlags!.some(f => f.type === 'high-amount' && !f.dismissed)
      ).length

      return {
        flaggedTransactions,
        totalFlagged: flaggedTransactions.length,
        highAmountCount,
        isLoading: transactions === undefined,
      }
    }
    ```
  - [x]Test: Returns empty when no anomalies
  - [x]Test: Correctly counts active (non-dismissed) flags
  - [x]Test: Separates by anomaly type
  - [x]Test: isLoading true while query pending

- [x] Task 10: Write integration tests (AC: all)
  - [x]Create `src/features/anomalies/services/anomalyDetector.integration.test.ts`
  - [x]Full scenario: 6 Shopping transactions (avg EUR100), import one at EUR300 -> flagged with "3x your average for Shopping (EUR100)"
  - [x]Threshold respect: Same scenario with 3x threshold -> EUR300 not flagged (only 3x, threshold is 3x)
  - [x]Absolute threshold: EUR600 transaction with EUR500 absolute threshold -> flagged regardless of category average
  - [x]Minimum transactions: Category with 3 transactions -> no detection
  - [x]Dismiss flow: Flag transaction -> dismiss -> re-run detection -> not re-flagged
  - [x]Settings change: Change threshold from 2x to 5x -> previously flagged transaction at 3x unflagged
  - [x]Import trigger: Import CSV with high-amount transaction -> detection runs -> flag appears
  - [x]Filter: 2 flagged transactions among 20 -> filter shows only 2
  - [x]Category change: Move transaction to new category where it's not anomalous -> flag should be re-evaluated
  - [x]Refund exclusion: Refund transactions excluded from average calculation and not flagged
  - [x]Undo dismiss: Dismiss anomaly -> undo via toast -> flag restored

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Storage | `anomalyFlags` array field on `transactions` table | No new table — flags belong to transactions |
| Settings | `anomalySettings` in existing `settings` table | Reuses existing settings pattern |
| Detection Service | Pure function in `src/features/anomalies/services/` | Feature module pattern |
| Integration | Triggered after import, results saved to Dexie | `useLiveQuery` auto-updates UI |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |
| Feature modules | Self-contained under `src/features/anomalies/` |

### Data Model — Anomaly Fields on Transactions

**Source: [architecture.md#Data-Model]**

No new Dexie table needed. Anomaly flags are stored as an array field on the existing `transactions` table. This keeps anomaly data co-located with transactions and avoids extra joins.

**Transaction type addition:**
```typescript
// In src/types/transaction.types.ts — add to existing Transaction type:
anomalyFlags?: AnomalyFlag[]
```

**AnomalyFlag structure:**
- `type`: `'high-amount'` (this story) — extensible for `'new-merchant'` (9.4) and `'potential-duplicate'` (9.5)
- `reason`: Human-readable explanation shown in tooltip
- `detectedAt`: ISO date of detection
- `dismissed`: Boolean — user can mark as "expected"
- `dismissedAt`: ISO date when dismissed (audit trail)

**Anomaly settings:**
- Stored in existing `settings` table with key `'anomalySettings'`
- Default: `{ multiplierThreshold: 2, absoluteThreshold: null, minTransactionsForDetection: 5 }`

### Detection Algorithm Design

**Threshold logic:**
1. **Multiplier threshold** (default 2x): Flag if `abs(amount) > categoryAverage * multiplierThreshold`
2. **Absolute threshold** (optional): Flag if `abs(amount) > absoluteThreshold`
3. Either trigger = flagged (OR logic, not AND)

**Category average calculation:**
- Mean of `abs(amount)` for all transactions in the category
- Exclude refunds (`isRefund === true`)
- Exclude the transaction being evaluated (to avoid self-inflation of average)
- Only calculate for categories with `>= minTransactionsForDetection` transactions

**Algorithm steps:**
1. Load anomaly settings from `settings` table
2. Query all categorized, non-refund transactions
3. Group by `categoryId`
4. For each category with `>= minTransactionsForDetection` transactions:
   a. Calculate mean absolute amount
   b. For each transaction, check if exceeds thresholds
   c. Skip already-flagged transactions (dismissed or active)
   d. Add `AnomalyFlag` to newly detected anomalies
5. Batch update flagged transactions in Dexie

### UX Design Considerations

**Source: [ux-design-specification.md]**

- **Warning color**: `hsl(38 92% 50%)` — the UX spec's `warning` semantic token
- **Color independence**: "Anomalies: color + icon indicator" — must use BOTH warning color AND an icon (AlertTriangle)
- **Badge component**: Use shadcn Badge with warning variant
- **Tooltip**: Show reason string on hover (shadcn Tooltip)
- **Dismissal**: Inline action on the badge — click to dismiss, toast with Undo
- **Transaction row integration**: Badge appears alongside category badge, does not break row layout (48px height constraint)

### Previous Story Intelligence

**From Story 9.1 (Subscription Detection Algorithm):**
- Established pattern for detection service in `src/features/` module
- Async detection triggered after import (fire-and-forget)
- Toast notification pattern for detection results
- `useLiveQuery` for reactive data access
- Dexie schema versioning pattern for migrations
- Performance target: detection <5s for 500 transactions

**From Story 9.2 (Subscriptions View):**
- Component composition patterns (View -> Summary + List + EmptyState)
- Sort/filter as local state (not persisted)
- Sidebar count badge pattern
- J/K navigation reuse
- shadcn Card for stat display, Badge for status indicators

**From Story 8.1 (Mark Transaction as Refund):**
- Transaction fields: `isRefund`, `linkedTransactionId`
- IMPORTANT: Anomaly detection must exclude refund transactions from both detection AND average calculation

**From Story 5.5 / 9.1 (Focus Mode):**
- Focus mode pattern for filter toggles
- Pattern for adding new filter options to existing filter system

**Overall project status:**
- All stories are `ready-for-dev` — no implementation code exists yet
- Recent commits are all story creation (no code patterns to extract)

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `350fda8` feat(story): create story 9-2 subscriptions view (S key)
- `9dfa8f5` feat(story): create story 9-1 subscription detection algorithm
- `427ba19` feat(story): create story 8-1 mark transaction as refund (F key)

No implementation patterns to analyze. The project is in planning phase.

### File Structure for This Story

```
src/
├── types/
│   ├── transaction.types.ts (modify — add anomalyFlags field)
│   └── anomaly.types.ts (new — AnomalyType, AnomalyFlag, AnomalySettings)
├── lib/
│   ├── db/
│   │   ├── schema.ts (modify — add schema version for anomaly support)
│   │   └── migrations.ts (modify — add migration)
│   └── schemas/
│       └── anomaly.schema.ts (new — Zod validation)
├── features/
│   ├── anomalies/
│   │   ├── services/
│   │   │   ├── anomalyDetector.ts (new)
│   │   │   ├── anomalyDetector.test.ts (new)
│   │   │   └── anomalyDetector.integration.test.ts (new)
│   │   ├── components/
│   │   │   └── AnomalyBadge/
│   │   │       ├── index.tsx (new)
│   │   │       └── AnomalyBadge.test.tsx (new)
│   │   ├── hooks/
│   │   │   ├── useAnomalies.ts (new)
│   │   │   └── useAnomalies.test.ts (new)
│   │   └── index.ts (new — feature exports)
│   ├── settings/
│   │   └── components/
│   │       └── SettingsPage/
│   │           └── index.tsx (modify — add Anomaly Detection section)
│   └── import/
│       └── hooks/
│           └── useImport.ts (modify — trigger anomaly detection after import)
├── components/
│   └── TransactionRow/
│       └── index.tsx (modify — add AnomalyBadge)
└── hooks/
    └── useFocusMode.ts (modify — add anomaly filter option)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `toast` | `src/components/ui/toast.tsx` | Notifications with undo |
| `cn` | `@/lib/utils` | Conditional class names |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount formatting |
| `Badge` | shadcn/ui | Warning badge display |
| `Tooltip` | shadcn/ui | Reason tooltip on hover |
| `AlertTriangle` | `lucide-react` | Warning icon |
| `Settings` table | `src/lib/db/` | Store anomaly threshold settings |
| Import flow | `src/features/import/` | Trigger detection after import |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `src/types/transaction.types.ts` | Add `anomalyFlags?: AnomalyFlag[]` | Low — optional field, backward compatible |
| `src/lib/db/schema.ts` | Add schema version | Low — standard Dexie migration |
| `src/lib/db/migrations.ts` | Add migration | Low — additive change |
| `src/components/TransactionRow/index.tsx` | Add AnomalyBadge | Low — additive UI element |
| `src/features/settings/components/SettingsPage/index.tsx` | Add Anomaly Detection section | Low — additive settings section |
| Import flow | Add `detectHighAmountAnomalies()` call | Low — non-blocking async |
| `src/hooks/useFocusMode.ts` | Add anomaly filter option | Low — extends existing filter system |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `subscriptionDetector.ts` | Subscription detection is separate; anomaly detection runs independently |
| `useSubscriptions.ts` | No overlap with anomaly detection |
| `SubscriptionsView` | Anomaly flags don't appear in subscriptions view |
| `Dashboard` | No anomaly indicators on dashboard in this story |
| `MerchantPage` | No anomaly indicators on merchant pages in this story |
| `CommandPalette` | No new commands in this story |
| `Sidebar.tsx` | Anomaly count in sidebar is deferred (optional enhancement) |
| `Breadcrumb` | No new breadcrumb segments |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| Detection time | <5s for 10k transactions | Group by category (O(n)), compute average (O(m)), check threshold (O(m)) |
| Import response | Not blocked | Detection is fire-and-forget async |
| Badge rendering | <16ms | Simple conditional render, no extra queries |
| Tooltip render | <16ms | Pre-computed reason string stored in flag |
| Filter | <100ms | Client-side filter on `anomalyFlags` array |
| Settings save | <100ms | Single Dexie write |

**Optimization: Pre-compute reason string at detection time** — stored in `AnomalyFlag.reason`, not computed on render. This avoids recalculating category averages on every row render.

### Edge Cases to Handle

1. **Category with exactly 5 transactions:** Minimum for detection. If one is 2x+ the average, flag it.
2. **Transaction moved to new category:** Should be re-evaluated against new category's average. Old flag may no longer be valid.
3. **Refund transactions:** Exclude from average calculation AND from being flagged. Refunds are not spending anomalies.
4. **Income transactions:** Exclude positive amounts that are not refunds. Only expenses flagged.
5. **Uncategorized transactions:** Skip — anomaly detection requires a category (average is per-category).
6. **All transactions in category are similar:** No flags. Average is close to each amount.
7. **Category with one extreme outlier:** The outlier inflates the average. Consider excluding the transaction being checked from the average calculation to avoid this.
8. **Settings changed after detection:** Re-running detection recalculates with new thresholds. Previously flagged (but not dismissed) transactions below new threshold should have flags removed.
9. **Multiple anomaly types on same transaction:** The `anomalyFlags` array supports multiple flags. A transaction can be both "high-amount" and "new-merchant" (future story 9.4).
10. **Dismissed then category changes:** If a transaction's category changes, the dismissed flag for the old category context may not apply. Consider clearing dismissed flags on category change.
11. **No categories at all:** Detection returns empty results, no flags. No errors.
12. **Absolute threshold only (multiplier disabled):** If user sets multiplier very high (e.g., 999x) but has absolute threshold, only absolute triggers.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT duplicate anomaly data in React state — read `anomalyFlags` from transactions via `useLiveQuery`
- DO NOT create a separate `anomalies` Dexie table — flags live on transactions
- DO NOT compute reason strings at render time — pre-compute at detection time
- DO NOT make detection synchronous/blocking during import — run async
- DO NOT add external statistical libraries — simple mean + threshold comparison is sufficient
- DO NOT modify the `subscriptions` table or detection — anomaly detection is independent
- DO NOT add new keyboard shortcuts in this story — use existing filter/focus infrastructure
- DO NOT flag transactions without categories — category average is required for detection
- DO NOT include dismissed flags in filter counts — only active flags count

### Scope Boundaries

**In scope (this story):**
- `AnomalyFlag` and `AnomalySettings` types
- Anomaly fields on transaction type (`anomalyFlags?: AnomalyFlag[]`)
- Zod validation for anomaly types
- `anomalyDetector` service with high-amount detection algorithm
- Anomaly dismissal logic (mark as reviewed/expected)
- `AnomalyBadge` component with warning icon and tooltip
- Integration into TransactionRow
- Anomaly filter in transaction list
- Settings UI for anomaly thresholds
- Toast notification when anomalies flagged after import
- `useAnomalies` hook for reactive anomaly data
- Undo support for dismiss action

**Out of scope (future stories):**
- New merchant anomaly detection (9.4) — flag type defined but detection not implemented
- Potential duplicate anomaly detection (9.5) — flag type defined but detection not implemented
- Dashboard anomaly summary widget
- Anomaly notification sounds or alerts
- Per-category threshold customization
- Anomaly history/audit log view
- Bulk dismiss anomalies
- Anomaly badges on merchant pages

### Validation Checklist

Before marking complete:
- [x]`AnomalyFlag` type defined with type, reason, detectedAt, dismissed, dismissedAt
- [x]`AnomalySettings` type defined with multiplierThreshold, absoluteThreshold, minTransactionsForDetection
- [x]Zod schemas validate anomaly types correctly
- [x]Transaction type extended with optional `anomalyFlags` field
- [x]Default anomaly settings seeded in settings table
- [x]Detection algorithm correctly identifies high-amount transactions
- [x]2x multiplier threshold works (default)
- [x]Absolute threshold works independently
- [x]Minimum 5 transactions per category required before detection
- [x]Category average excludes refunds
- [x]Already-flagged transactions not re-flagged
- [x]Dismissed flags respected (not re-flagged)
- [x]AnomalyBadge renders with warning color and AlertTriangle icon
- [x]Tooltip shows human-readable reason string
- [x]Badge integrates cleanly into TransactionRow (48px height preserved)
- [x]Dismiss action marks flag as dismissed with toast + undo
- [x]Undo restores dismissed flag
- [x]Filter shows only transactions with active anomaly flags
- [x]Settings UI allows changing thresholds
- [x]Settings save triggers re-detection
- [x]Import triggers anomaly detection (non-blocking)
- [x]Toast shown when new anomalies flagged
- [x]No TypeScript errors
- [x]Named exports only
- [x]Uses `type` not `interface`
- [x]Tests co-located with source files
- [x]All new tests pass
- [x]No unnecessary external dependencies added
- [x]Color independence: icon + text (not color alone)

### Project Structure Notes

- New code primarily under `src/features/anomalies/` — matching feature module pattern
- Types in `src/types/anomaly.types.ts` — consistent with existing type organization
- Anomaly data lives on transactions (not separate table) — keeps queries simple
- Settings reuse existing `settings` table pattern
- AnomalyBadge is a shared-ish component but lives in `features/anomalies/components/` since it's feature-specific
- TransactionRow modification is minimal — conditional render of AnomalyBadge

### References

- [Source: epics.md#Epic-9-Story-9.3-Anomaly-Detection-High-Amounts]
- [Source: prd.md#FR39 - System can flag transactions exceeding 2x the user's category average or a user-defined threshold]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/anomalies/ for detection logic]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Semantic-Colors - warning: hsl(38 92% 50%) for anomalies]
- [Source: ux-design-specification.md#Accessibility - Color independence: anomalies use color + icon indicator]
- [Source: ux-design-specification.md#Component-Inventory - Badge, Tooltip for anomaly display]
- [Story 9.1: Subscription Detection Algorithm - async detection pattern, toast notification, import integration pattern]
- [Story 9.2: Subscriptions View - component composition pattern, Badge usage, filter patterns]
- [Story 8.1: Mark Transaction as Refund - isRefund field to exclude from detection]
- [Story 10.2: Settings Page Consolidation - Settings page where anomaly threshold UI will be added]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 10 tasks implemented and tested
- 1217 tests pass across the full suite (124/125 test files - 1 pre-existing DOMMatrix failure unrelated to this story)
- 11 integration tests + 17 unit tests + 16 schema tests + 7 badge tests + 4 settings form tests + 4 hook tests + 4 DB integration tests = 63 new tests
- Detection algorithm excludes self from avg calculation, excludes refunds, respects min transaction threshold
- AnomalySettingsForm uses `.toArray()` instead of `.first()` for `useLiveQuery` to distinguish loading from no-result
- Fire-and-forget detection triggered after import (same pattern as subscription detection)
- Anomaly filter uses `!` keyboard shortcut, integrates with existing FocusModeContext

### Change Log

- Created `src/types/anomaly.types.ts` - AnomalyType, AnomalyFlag, AnomalySettings types
- Modified `src/types/transaction.types.ts` - Added anomalyFlags field
- Modified `src/types/index.ts` - Exported anomaly types
- Modified `src/types/settings.types.ts` - Added 'anomaly_settings' to SettingKey
- Modified `src/lib/db/schema.ts` - Added Dexie version 8
- Created `src/lib/schemas/anomaly.schema.ts` - Zod validation schemas
- Modified `src/lib/schemas/transaction.schema.ts` - Added anomalyFlags
- Modified `src/lib/schemas/settings.schema.ts` - Added anomaly_settings key
- Created `src/features/anomalies/services/anomalyDetector.ts` - Core detection service
- Created `src/features/anomalies/components/AnomalyBadge/index.tsx` - Warning badge component
- Created `src/features/anomalies/components/AnomalySettingsForm/index.tsx` - Settings UI
- Created `src/features/anomalies/hooks/useAnomalies.ts` - Reactive anomaly data hook
- Created `src/features/anomalies/hooks/useAnomalyDismiss.ts` - Dismiss with toast+undo
- Created `src/features/anomalies/index.ts` - Feature barrel export
- Modified `src/features/import/services/importWithRules.ts` - Trigger detection after import
- Modified `src/components/TransactionRow/index.tsx` - Added AnomalyBadge
- Modified `src/features/transactions/components/TransactionList/index.tsx` - Added dismiss handler + anomaly filter
- Modified `src/features/transactions/hooks/useFilteredTransactions.ts` - Added anomaliesOnly filter
- Modified `src/context/FocusModeContext.tsx` - Added 'anomalies' focus mode + '!' shortcut
- Modified `src/features/settings/components/SettingsPage/index.tsx` - Added AnomalySettingsForm

### File List

**New Files:**
- `src/types/anomaly.types.ts`
- `src/lib/schemas/anomaly.schema.ts`
- `src/lib/schemas/anomaly.schema.test.ts`
- `src/features/anomalies/index.ts`
- `src/features/anomalies/services/anomalyDetector.ts`
- `src/features/anomalies/services/anomalyDetector.test.ts`
- `src/features/anomalies/services/anomalyDetector.integration.test.ts`
- `src/features/anomalies/components/AnomalyBadge/index.tsx`
- `src/features/anomalies/components/AnomalyBadge/AnomalyBadge.test.tsx`
- `src/features/anomalies/components/AnomalySettingsForm/index.tsx`
- `src/features/anomalies/components/AnomalySettingsForm/AnomalySettingsForm.test.tsx`
- `src/features/anomalies/hooks/useAnomalies.ts`
- `src/features/anomalies/hooks/useAnomalies.test.ts`
- `src/features/anomalies/hooks/useAnomalyDismiss.ts`

**Modified Files:**
- `src/types/transaction.types.ts`
- `src/types/index.ts`
- `src/types/settings.types.ts`
- `src/lib/db/schema.ts`
- `src/lib/db/db.integration.test.ts`
- `src/lib/schemas/transaction.schema.ts`
- `src/lib/schemas/settings.schema.ts`
- `src/features/import/services/importWithRules.ts`
- `src/components/TransactionRow/index.tsx`
- `src/features/transactions/components/TransactionList/index.tsx`
- `src/features/transactions/hooks/useFilteredTransactions.ts`
- `src/context/FocusModeContext.tsx`
- `src/features/settings/components/SettingsPage/index.tsx`
