# Story 9.1: Subscription Detection Algorithm

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **the system to automatically detect my recurring subscriptions**,
So that **I can see all my recurring charges in one place (FR36)**.

## Acceptance Criteria

1. **Given** I have transactions from the same merchant
   **When** the subscription detection runs
   **Then** transactions are analyzed for recurring patterns
   **And** a subscription is detected if: same merchant, similar amount (+-10%), appearing 2+ times at regular intervals

2. **Given** transactions match subscription criteria
   **When** a subscription is detected
   **Then** it's stored with: merchant, typical amount, frequency (monthly, yearly, weekly), last charge date

3. **Given** a Netflix charge of EUR15.99 appears monthly
   **When** 2+ charges are detected with ~30 day intervals
   **Then** a subscription is created: Netflix, EUR15.99/month

4. **Given** subscription detection runs
   **When** new transactions are imported
   **Then** detection re-runs to find new subscriptions
   **And** existing subscriptions are updated (last charge date)

5. **Given** a subscription stops (no charge for 2+ cycles)
   **When** detection runs
   **Then** the subscription is marked as "possibly cancelled"
   **And** it's still visible but flagged

6. **Given** amount varies slightly (EUR15.99, EUR16.49)
   **When** within +-10% tolerance
   **Then** still detected as same subscription
   **And** "typical amount" shows the average or most recent

7. **Given** irregular intervals (not exactly 30 days)
   **When** variance is within reasonable range (+-5 days for monthly)
   **Then** still detected as subscription
   **And** frequency is approximated

## Tasks / Subtasks

- [ ] Task 1: Add `subscriptions` table to Dexie schema (AC: #2)
  - [ ] Modify `src/lib/db/schema.ts` to add `subscriptions` table
  - [ ] Add schema version migration in `src/lib/db/migrations.ts`
  - [ ] Table schema:
    ```typescript
    subscriptions: '++id, merchantId, status'
    ```
  - [ ] Create `src/types/subscription.types.ts`:
    ```typescript
    type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'
    type SubscriptionStatus = 'active' | 'possibly-cancelled'

    type Subscription = {
      id?: number
      merchantId: number
      merchantName: string           // Denormalized for display efficiency
      typicalAmount: number          // Average or most recent charge amount
      frequency: SubscriptionFrequency
      intervalDays: number           // Detected average interval in days
      lastChargeDate: string         // ISO date of most recent detected charge
      firstChargeDate: string        // ISO date of earliest detected charge
      chargeCount: number            // Number of detected recurring charges
      status: SubscriptionStatus
      transactionIds: number[]       // IDs of transactions matched to this subscription
      detectedAt: string             // ISO date when first detected
      updatedAt: string              // ISO date of last detection update
    }
    ```
  - [ ] Create `src/lib/schemas/subscription.schema.ts` with Zod validation
  - [ ] Test: Schema migration applies cleanly
  - [ ] Test: Subscription records can be created and queried

- [ ] Task 2: Implement subscription detection service (AC: #1, #3, #6, #7)
  - [ ] Create `src/features/subscriptions/services/subscriptionDetector.ts`
  - [ ] Create `src/features/subscriptions/services/subscriptionDetector.test.ts`
  - [ ] Core algorithm:
    ```typescript
    export const detectSubscriptions = async (): Promise<Subscription[]> => {
      // 1. Get all merchants with 2+ transactions
      // 2. For each merchant, get all transactions sorted by date (ascending)
      // 3. Group transactions by similar amounts (+-10% tolerance)
      // 4. For each amount group with 2+ transactions, analyze intervals
      // 5. Detect frequency pattern from intervals
      // 6. If pattern matches, create/update subscription
    }
    ```
  - [ ] Amount similarity check (+-10% tolerance):
    ```typescript
    const areAmountsSimilar = (a: number, b: number): boolean => {
      const avg = (Math.abs(a) + Math.abs(b)) / 2
      return Math.abs(Math.abs(a) - Math.abs(b)) / avg <= 0.1
    }
    ```
  - [ ] Group transactions by amount clusters:
    ```typescript
    // Sort transactions by amount, then cluster adjacent amounts within 10%
    // Each cluster = potential subscription group
    ```
  - [ ] Interval analysis for frequency detection:
    ```typescript
    type IntervalPattern = {
      frequency: SubscriptionFrequency
      avgIntervalDays: number
      isRegular: boolean  // Within tolerance
    }

    const FREQUENCY_RANGES = {
      weekly: { min: 5, max: 9, target: 7, tolerance: 2 },
      monthly: { min: 25, max: 35, target: 30, tolerance: 5 },
      yearly: { min: 350, max: 380, target: 365, tolerance: 15 },
    }

    const detectFrequency = (dates: string[]): IntervalPattern | null => {
      // 1. Calculate intervals between consecutive dates
      // 2. Compute average interval
      // 3. Match against FREQUENCY_RANGES
      // 4. Check that most intervals fall within tolerance
      // 5. Return pattern or null if no match
    }
    ```
  - [ ] Minimum 2 transactions required for detection (per FR36 spec)
  - [ ] Typical amount calculation: use median of matched amounts (more robust than average for outliers)
  - [ ] Test: 3 monthly Netflix charges (EUR15.99) at ~30 day intervals -> detected as monthly subscription
  - [ ] Test: 2 yearly charges (EUR99.99) at ~365 day intervals -> detected as yearly subscription
  - [ ] Test: Weekly charges detected correctly
  - [ ] Test: Amounts within +-10% still detected (EUR15.99, EUR16.49 -> same subscription)
  - [ ] Test: Amounts outside +-10% tolerance -> separate subscriptions or not detected
  - [ ] Test: Irregular intervals within tolerance (28, 31, 30 days) -> still monthly
  - [ ] Test: Irregular intervals outside tolerance (15, 45, 20 days) -> not detected
  - [ ] Test: Single transaction per merchant -> no subscription detected
  - [ ] Test: Merchant with 2 different subscriptions (e.g., Apple: monthly iCloud + yearly Apple One)
  - [ ] Test: Only expenses (negative amounts) considered; income/refunds excluded

- [ ] Task 3: Implement subscription persistence and update logic (AC: #2, #4)
  - [ ] Add to `subscriptionDetector.ts`:
    ```typescript
    export const runDetection = async (): Promise<{
      created: number
      updated: number
      markedCancelled: number
    }> => {
      const detected = await detectSubscriptions()

      // For each detected subscription:
      // 1. Check if existing subscription for same merchantId + frequency exists
      // 2. If exists: update lastChargeDate, typicalAmount, chargeCount, transactionIds
      // 3. If new: create subscription record
      // 4. Handle "possibly cancelled" logic (Task 4)

      return { created, updated, markedCancelled }
    }
    ```
  - [ ] Upsert logic: Match by `merchantId` + `frequency` to avoid duplicates
  - [ ] Update fields on re-detection: `lastChargeDate`, `typicalAmount`, `chargeCount`, `transactionIds`, `updatedAt`
  - [ ] Store all matched `transactionIds` for drill-down in Story 9.2
  - [ ] Test: First detection creates new subscription records
  - [ ] Test: Re-running detection updates existing subscriptions (not duplicates)
  - [ ] Test: New transactions extend existing subscription (increased chargeCount, updated lastChargeDate)
  - [ ] Test: Transaction IDs list grows as new charges are detected

- [ ] Task 4: Implement "possibly cancelled" detection (AC: #5)
  - [ ] Add cancellation logic to `runDetection`:
    ```typescript
    const checkCancelled = (sub: Subscription): boolean => {
      const daysSinceLastCharge = daysBetween(sub.lastChargeDate, today())
      const expectedInterval = sub.intervalDays
      // Cancelled if no charge for 2+ expected cycles
      return daysSinceLastCharge > expectedInterval * 2
    }
    ```
  - [ ] When a subscription is detected as "possibly cancelled":
    - Update `status` to `'possibly-cancelled'`
    - Do NOT delete the subscription (user may still want to see it)
  - [ ] When a subscription was "possibly-cancelled" but new charge appears:
    - Update `status` back to `'active'`
    - This handles cases like yearly subscriptions with long gaps
  - [ ] Test: Monthly subscription with no charge for 65+ days -> possibly-cancelled
  - [ ] Test: Yearly subscription with no charge for 730+ days -> possibly-cancelled
  - [ ] Test: Possibly-cancelled subscription reactivated when new charge detected
  - [ ] Test: Active subscription with recent charge -> stays active

- [ ] Task 5: Integrate detection with transaction import flow (AC: #4)
  - [ ] Modify the import completion flow to trigger detection
  - [ ] After transactions are imported (CSV or PDF), call `runDetection()`
  - [ ] Detection should run asynchronously (non-blocking) after import:
    ```typescript
    // In the import flow (src/features/import/)
    // After transactions are saved to Dexie:
    // Don't await — let it run in background
    runDetection().then(result => {
      if (result.created > 0) {
        toast({
          title: `${result.created} subscription(s) detected`,
          description: 'View in Subscriptions',
        })
      }
    })
    ```
  - [ ] Detection only runs on merchants that have transactions (not all merchants)
  - [ ] Detection results are saved to Dexie, so `useLiveQuery` on subscriptions table auto-updates UI
  - [ ] Test: Import triggers detection
  - [ ] Test: Detection runs non-blocking (import toast appears before detection completes)
  - [ ] Test: New subscription detected after import shows notification toast
  - [ ] Test: No toast when no new subscriptions detected

- [ ] Task 6: Create `useSubscriptions` hook (AC: #2)
  - [ ] Create `src/features/subscriptions/hooks/useSubscriptions.ts`
  - [ ] Create `src/features/subscriptions/hooks/useSubscriptions.test.ts`
  - [ ] Hook provides reactive access to subscription data:
    ```typescript
    export const useSubscriptions = () => {
      const subscriptions = useLiveQuery(
        () => db.subscriptions.toArray()
      )

      const active = subscriptions?.filter(s => s.status === 'active') ?? []
      const possiblyCancelled = subscriptions?.filter(s => s.status === 'possibly-cancelled') ?? []

      const monthlyTotal = active
        .filter(s => s.frequency === 'monthly')
        .reduce((sum, s) => sum + Math.abs(s.typicalAmount), 0)

      const yearlyTotal = active.reduce((sum, s) => {
        switch (s.frequency) {
          case 'monthly': return sum + Math.abs(s.typicalAmount) * 12
          case 'yearly': return sum + Math.abs(s.typicalAmount)
          case 'weekly': return sum + Math.abs(s.typicalAmount) * 52
        }
      }, 0)

      return {
        subscriptions: subscriptions ?? [],
        active,
        possiblyCancelled,
        monthlyTotal,
        yearlyTotal,
        count: active.length,
        isLoading: subscriptions === undefined,
      }
    }
    ```
  - [ ] Test: Returns empty arrays when no subscriptions
  - [ ] Test: Correctly separates active from possibly-cancelled
  - [ ] Test: Monthly total sums only active monthly subscriptions
  - [ ] Test: Yearly total normalizes all frequencies to yearly
  - [ ] Test: isLoading true while query pending, false after

- [ ] Task 7: Update S key focus mode to use real data (AC: #4)
  - [ ] Modify `src/hooks/useFocusMode.ts` (or wherever S key subscription placeholder lives from Story 5.5)
  - [ ] Replace the placeholder "Subscription detection coming soon" with real subscription filter:
    ```typescript
    // When S key pressed and subscriptions exist:
    // Filter transactions to those whose IDs appear in any subscription's transactionIds
    // When no subscriptions detected:
    // Show empty state: "No subscriptions detected yet. Import more statements."
    ```
  - [ ] The S key toggle behavior remains the same (press S to activate, press S again to deactivate)
  - [ ] Filtered transaction list shows only transactions that belong to detected subscriptions
  - [ ] Sidebar "Subscriptions" item shows count of active subscriptions
  - [ ] Test: S key with subscriptions filters to subscription transactions
  - [ ] Test: S key without subscriptions shows appropriate empty state
  - [ ] Test: S key toggle on/off works correctly

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Create `src/features/subscriptions/services/subscriptionDetector.integration.test.ts`
  - [ ] Full scenario: Create merchant, add 3 monthly transactions, run detection -> subscription created
  - [ ] Amount tolerance: 3 charges (EUR15.99, EUR16.49, EUR15.99), all within 10% -> single subscription with median amount
  - [ ] Multi-frequency: Apple merchant with monthly (EUR2.99) and yearly (EUR99.99) -> 2 separate subscriptions
  - [ ] Cancellation: Monthly sub, no charge for 65 days -> marked possibly-cancelled
  - [ ] Reactivation: Possibly-cancelled sub, new charge imported -> back to active
  - [ ] Import trigger: Import CSV, verify detection ran and subscription created
  - [ ] No false positives: 2 transactions from same merchant, 90 days apart -> not monthly (interval too irregular)
  - [ ] Minimum threshold: Single transaction from merchant -> no subscription
  - [ ] Refund exclusion: Refund transactions (isRefund=true) excluded from detection
  - [ ] S key integration: Subscriptions exist -> S key filters transactions correctly

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| New Table | `subscriptions` in Dexie | Stores detected subscription records |
| Detection Service | Pure function in `src/features/subscriptions/services/` | Feature module pattern |
| Integration | Triggered after import, results saved to Dexie | `useLiveQuery` auto-updates UI |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Feature modules | Self-contained under `src/features/subscriptions/` |

### Data Model — New `subscriptions` Table

**Source: [architecture.md#Data-Model]**

The architecture lists 5 tables: `accounts`, `transactions`, `merchants`, `rules`, `settings`. This story adds a 6th table: `subscriptions`.

**Schema addition:**
```typescript
// In src/lib/db/schema.ts — new version
subscriptions: '++id, merchantId, status'
```

**Subscription record fields:**
- `id` (auto-increment): Primary key
- `merchantId` (indexed): Foreign key to merchants table
- `merchantName`: Denormalized for display (avoids extra query)
- `typicalAmount`: Median charge amount from detected transactions
- `frequency`: 'weekly' | 'monthly' | 'yearly'
- `intervalDays`: Average detected interval between charges
- `lastChargeDate`: ISO date of most recent charge
- `firstChargeDate`: ISO date of earliest charge
- `chargeCount`: Number of matched transactions
- `status`: 'active' | 'possibly-cancelled'
- `transactionIds`: Array of matched transaction IDs
- `detectedAt`: ISO date of first detection
- `updatedAt`: ISO date of last update

**Key constraint:** Subscriptions are unique per `merchantId + frequency`. A merchant can have multiple subscriptions if they charge at different frequencies (e.g., monthly iCloud + yearly Apple One).

### Detection Algorithm Design

**Frequency Detection Ranges:**

| Frequency | Target Days | Min | Max | Tolerance |
|-----------|-------------|-----|-----|-----------|
| Weekly | 7 | 5 | 9 | +-2 days |
| Monthly | 30 | 25 | 35 | +-5 days |
| Yearly | 365 | 350 | 380 | +-15 days |

**Algorithm steps:**
1. Query all merchants that have 2+ transactions
2. For each merchant, get transactions sorted by date (ascending), excluding refunds
3. Group transactions into amount clusters (each pair within +-10%)
4. For each cluster with 2+ transactions:
   a. Calculate intervals between consecutive transaction dates
   b. Compute average interval
   c. Match average against frequency ranges
   d. Verify consistency: at least 70% of intervals fall within the tolerance
5. If pattern matches, create/update subscription record

**Amount clustering approach:**
- Sort transactions by absolute amount
- Walk through sorted list, grouping adjacent items where each pair is within 10%
- This handles gradual price increases (EUR15.99 -> EUR16.49 -> EUR16.99) as one group

**Typical amount:** Use median of the cluster (robust against outliers). If only 2 transactions, use the more recent amount.

### UX Design Considerations

**Source: [epics.md#Epic-9, ux-design-specification.md]**

- FR36: Detection criteria = same merchant + similar amount (+-10%) + 2+ occurrences + regular intervals
- FR37/FR38: View/details implemented in Story 9.2 (next story)
- S key focus mode: Epic 5 Story 5.5 created a placeholder. This story replaces it with real subscription filtering.
- Toast notification after import when new subscriptions detected

### Previous Story Intelligence

**From Story 8.3 (most recent story file):**
- The project is in planning phase — all stories are `ready-for-dev`, no implementation code exists yet
- Recent commits are all story creation
- Story files follow a consistent pattern with detailed tasks, code snippets, test lists, and anti-patterns
- Previous stories use `useLiveQuery` for all data access — this story follows the same pattern
- Dexie schema changes are done via versioned migrations in `src/lib/db/migrations.ts`

**From Story 5.5 (Focus Mode - Subscriptions Placeholder):**
- Established S key binding that shows "Subscription detection coming soon"
- This story (9.1) replaces that placeholder with real data
- The toggle behavior (S to activate, S to deactivate) should be preserved

**From Story 8.1/8.2 (Refund Handling):**
- Transaction fields: `isRefund`, `linkedTransactionId`
- IMPORTANT: Subscription detection must exclude refund transactions (`isRefund === true`) from analysis. Only expenses (negative amounts, not refunds) should be considered for recurring pattern detection.

### Git Intelligence

Recent commits are all story creation (no implementation yet). The project is in planning phase — all stories in sprint status are at `ready-for-dev` or `backlog`. No implementation code exists yet to analyze for patterns.

### File Structure for This Story

```
src/
+-- lib/
|   +-- db/
|       +-- schema.ts (modify — add subscriptions table)
|       +-- migrations.ts (modify — add schema version)
+-- types/
|   +-- subscription.types.ts (new)
+-- lib/
|   +-- schemas/
|       +-- subscription.schema.ts (new)
+-- features/
|   +-- subscriptions/
|       +-- services/
|       |   +-- subscriptionDetector.ts (new)
|       |   +-- subscriptionDetector.test.ts (new)
|       |   +-- subscriptionDetector.integration.test.ts (new)
|       +-- hooks/
|       |   +-- useSubscriptions.ts (new)
|       |   +-- useSubscriptions.test.ts (new)
|       +-- index.ts (new — feature exports)
+-- hooks/
|   +-- useFocusMode.ts (modify — replace S key placeholder with real filter)
+-- features/
    +-- import/
        +-- hooks/
            +-- useImport.ts (modify — trigger detection after import)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `toast` | `src/components/ui/toast.tsx` | Import notification |
| `cn` | `@/lib/utils` | Conditional class names |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount display |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `src/lib/db/schema.ts` | Add `subscriptions` table | Low — additive schema change |
| `src/lib/db/migrations.ts` | Add new version | Low — standard Dexie migration |
| `src/hooks/useFocusMode.ts` | Replace S key placeholder | Low — swap placeholder for real filter |
| Import hook/service | Add `runDetection()` call after import | Low — non-blocking async call |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `TransactionRow/index.tsx` | No visual changes for subscriptions in this story |
| `Sidebar.tsx` | Subscriptions count updated via `useLiveQuery` (existing pattern) — full UI changes in 9.2 |
| `CommandPalette` | No new commands in this story |
| Dashboard components | No subscription data on dashboard in this story |
| Merchant pages | No subscription indicators in this story |
| `refundService.ts` | Subscription detection only reads transaction data |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Impact of This Story |
|--------|--------|---------------------|
| Detection time | <5s for 500 transactions (NFR5-inspired) | Detection runs asynchronously after import |
| Import response | Not blocked | Detection is fire-and-forget, doesn't block import completion |
| S key filter | <100ms | `useLiveQuery` with indexed `transactionIds` lookup |
| Subscription query | <100ms | Simple `db.subscriptions.toArray()` — small table |

**Detection algorithm performance:**
- Group by merchant: O(n) where n = total transactions
- For each merchant: Sort by date O(m log m) where m = merchant's transactions
- Amount clustering: O(m) per merchant
- Interval analysis: O(m) per merchant
- Total: O(n log m) — well within 5s for 10k transactions with 100 merchants

**Optimization: Only analyze merchants with 2+ transactions.** Skip merchants with a single transaction (they can't have subscriptions). This is the most impactful optimization since many merchants will have only 1-2 transactions.

### Edge Cases to Handle

1. **Merchant with exactly 2 transactions:** Minimum for detection. If interval matches a frequency range, detect it. The confidence is lower, but FR36 says "2+ times."
2. **Same merchant, different amounts:** Group into clusters by amount. EUR9.99 and EUR99.99 are separate clusters (>10% difference). Each cluster analyzed independently.
3. **Refund transactions:** Exclude any transaction where `isRefund === true`. Refunds are not charges.
4. **Income transactions:** Exclude positive amounts that are NOT refunds (income). Only negative amounts (expenses) are potential subscription charges.
5. **Bi-weekly charges:** Falls between weekly (7 days) and monthly (30 days). With target ~14 days, this doesn't match any defined range. Could be detected as "irregular weekly" if intervals cluster around 14 days. For MVP, not detected — this is acceptable.
6. **Quarterly charges:** ~90 days, doesn't match any range. Not detected in MVP. Could be added as future enhancement.
7. **Price increase mid-subscription:** If amount changes gradually (EUR15.99 -> EUR16.49 -> EUR16.99), amount clustering with 10% tolerance handles this. Each consecutive pair is within 10%.
8. **Merchant with no rules:** A merchant without rules can still have transactions assigned to it. Subscription detection works on merchant ID, not rules.
9. **Deleted merchant:** If a merchant is deleted, its subscriptions should also be cleaned up. Add a note for the delete merchant flow (future concern, not this story).
10. **Empty database:** Detection returns empty results, no subscriptions created. No errors.
11. **Transactions without a merchant (unmatched):** Skip unmatched transactions — subscription detection requires a merchant (FR36 says "same merchant").
12. **Multiple subscriptions per merchant:** Possible (e.g., Apple: monthly iCloud + yearly Apple One). Different amount clusters + different frequencies = different subscriptions.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT duplicate subscription data in React state — use `useLiveQuery` on subscriptions table
- DO NOT make detection synchronous/blocking during import — run async
- DO NOT pre-compute subscription data in a separate store — Dexie is the source of truth
- DO NOT add external libraries for date math — use simple date arithmetic (days between = ms difference / 86400000)
- DO NOT add a charting library for this story — no visualization in 9.1 (that's 9.2)
- DO NOT modify transaction schema — subscriptions are a separate table, not fields on transactions
- DO NOT detect subscriptions from unmatched transactions — only transactions with a merchantId

### Scope Boundaries

**In scope (this story):**
- `subscriptions` Dexie table + schema migration
- `Subscription` type + Zod schema
- `subscriptionDetector` service with detection algorithm
- `useSubscriptions` hook for reactive data access
- Integration with import flow (trigger detection after import)
- Replace S key focus mode placeholder with real subscription transaction filter
- Toast notification when new subscriptions detected

**Out of scope (Story 9.2 and beyond):**
- Subscriptions list view UI (9.2)
- Subscription detail with charge history (9.2)
- Monthly/yearly cost summary display (9.2)
- Sort/filter subscriptions (9.2)
- Manual subscription confirmation/dismissal
- High-amount anomaly detection (9.3)
- New merchant anomaly detection (9.4)
- Duplicate anomaly detection (9.5)
- Subscription cost alerts or notifications
- Export subscription data

### Validation Checklist

Before marking complete:
- [ ] `subscriptions` table added to Dexie schema with proper migration
- [ ] `Subscription` type defined with all required fields
- [ ] Zod schema validates subscription records
- [ ] Detection algorithm finds recurring transactions from same merchant
- [ ] Amount tolerance +-10% works correctly
- [ ] Monthly frequency detected (25-35 day intervals)
- [ ] Yearly frequency detected (350-380 day intervals)
- [ ] Weekly frequency detected (5-9 day intervals)
- [ ] Minimum 2 transactions required for detection
- [ ] Typical amount uses median of cluster
- [ ] "Possibly cancelled" detected when 2+ cycles missed
- [ ] Reactivation works when new charge appears
- [ ] Detection triggered after import (non-blocking)
- [ ] Toast shown when new subscriptions detected
- [ ] Existing subscriptions updated (not duplicated) on re-detection
- [ ] S key focus mode uses real subscription data
- [ ] S key shows appropriate message when no subscriptions
- [ ] Refund transactions excluded from detection
- [ ] Unmatched transactions excluded from detection
- [ ] Multiple subscriptions per merchant handled (different frequencies)
- [ ] Performance: Detection <5s for 500 transactions
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No unnecessary external dependencies added

### Project Structure Notes

- All new code under `src/features/subscriptions/` — matching the architecture's feature module pattern
- Schema changes in `src/lib/db/` — consistent with data layer architecture
- Types in `src/types/` — consistent with existing type files
- Integration point: Import flow triggers detection (small modification to existing import code)
- S key focus mode modification in shared hooks (small modification to existing code)

### References

- [Source: epics.md#Epic-9-Story-9.1-Subscription-Detection-Algorithm]
- [Source: prd.md#FR36 - System can detect recurring transactions (same merchant, similar amount +-10%, 2+ times at regular intervals)]
- [Source: prd.md#FR37 - User can view all detected subscriptions (Story 9.2)]
- [Source: prd.md#FR38 - User can see subscription amounts and frequency (Story 9.2)]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, data model]
- [Source: architecture.md#Project-Structure - src/features/subscriptions/ for detection logic]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI, <5s processing]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Story 5.5: Focus Mode - Subscriptions Placeholder (S Key) - S key binding to replace]
- [Story 8.1: Mark Transaction as Refund - isRefund field to exclude from detection]
- [Story 8.3: Net Spending Calculation - Pattern for hooks, useLiveQuery aggregation]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
