# Story 9.5: Anomaly Detection - Potential Duplicates

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **potential duplicate transactions to be flagged**,
So that **I can catch accidental double charges and avoid counting the same expense twice (FR41)**.

## Acceptance Criteria

1. **Given** transactions exist with same amount, same merchant, within 3 days
   **When** potential duplicates are detected
   **Then** both transactions are flagged as "Potential duplicate"
   **And** a visual indicator appears on both rows

2. **Given** transactions are flagged as potential duplicates
   **When** I view one of them
   **Then** I see: "Potential duplicate of transaction on [date]"
   **And** I can click to view/compare the other transaction

3. **Given** I review potential duplicates
   **When** they're actually legitimate (e.g., two coffees same day)
   **Then** I can dismiss the flag: "Not a duplicate"
   **And** the flag is removed from both transactions
   **And** similar transactions won't be flagged again

4. **Given** I confirm a duplicate
   **When** it's actually a double charge
   **Then** I can mark one as "Duplicate - exclude"
   **And** the excluded transaction doesn't count toward spending
   **And** a note is added for reference

5. **Given** duplicate detection runs
   **When** transactions are imported
   **Then** detection runs automatically
   **And** flags are applied without user action

6. **Given** I want to see all potential duplicates
   **When** I filter the transaction list
   **Then** I can filter to show only "Potential duplicates"
   **And** I can review and resolve them efficiently

## Tasks / Subtasks

- [x] Task 1: Implement potential-duplicate detection service (AC: #1, #5)
  - [x] Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const detectPotentialDuplicates = async (): Promise<{
      flagged: number
      pairs: number
    }> => {
      // 1. Query all transactions, grouped by merchantId
      // 2. For each merchant group, sort by date
      // 3. For each pair of transactions in the group:
      //    - Check if same amount (exact match)
      //    - Check if dates within 3 days of each other
      //    - Skip if either already has 'potential-duplicate' flag (dismissed or active)
      //    - Skip if pair was previously dismissed (check dismissedPairId)
      // 4. For each detected pair:
      //    - Add AnomalyFlag { type: 'potential-duplicate', reason, detectedAt, dismissed: false, linkedTransactionId }
      //    - Flag BOTH transactions in the pair, cross-referencing each other
      // 5. Batch update flagged transactions in Dexie
    }
    ```
  - [x] Extend `AnomalyFlag` type with optional `linkedTransactionId`:
    ```typescript
    // In src/types/anomaly.types.ts - add to AnomalyFlag:
    linkedTransactionId?: number  // For potential-duplicate: the ID of the other transaction in the pair
    ```
  - [x] Matching criteria: same `merchantId` AND same `amount` (exact) AND dates within 3 calendar days
  - [x] Also match unmatched transactions: same raw merchant string AND same amount AND dates within 3 days
  - [x] Reason string: `"Same amount (EUR29.99) as transaction on [date] at [merchant]"`
  - [x] Flag BOTH transactions in the pair (bidirectional linking)
  - [x] Skip if either transaction already has a `potential-duplicate` flag (avoid re-flagging)
  - [x] Skip if the pair was previously dismissed (check `linkedTransactionId` match in dismissed flags)
  - [x] Handle chains: If A matches B and B matches C, flag A-B and B-C as separate pairs (B gets two flags)
  - [x] Use constant: `const DUPLICATE_WINDOW_DAYS = 3`
  - [x] Exclude refund transactions (`isRefund === true`)
  - [x] Test: Two transactions same merchant, same amount, 1 day apart -> both flagged
  - [x] Test: Two transactions same merchant, same amount, 4 days apart -> NOT flagged
  - [x] Test: Two transactions same merchant, different amounts -> NOT flagged
  - [x] Test: Two transactions different merchants, same amount, same date -> NOT flagged
  - [x] Test: Unmatched transactions: same raw string, same amount, 2 days apart -> both flagged
  - [x] Test: Already-flagged pair not re-flagged
  - [x] Test: Dismissed pair not re-flagged
  - [x] Test: Chain A-B-C: B gets two flags (one for A, one for C)
  - [x] Test: Reason string format: "Same amount (EUR29.99) as transaction on Jan 15 at Starbucks"
  - [x] Test: Both transactions in pair have linkedTransactionId pointing to each other
  - [x] Test: Refund transactions excluded from detection

- [x] Task 2: Implement duplicate confirmation and exclusion (AC: #4)
  - [x] Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const confirmDuplicate = async (
      transactionId: number,
      action: 'exclude' | 'keep'
    ): Promise<void> => {
      if (action === 'exclude') {
        // 1. Mark transaction as excluded: { isDuplicateExcluded: true }
        // 2. Dismiss the potential-duplicate flag on this transaction
        // 3. Dismiss the potential-duplicate flag on the linked transaction
        // 4. Add note: "Excluded as duplicate of transaction on [date]"
      } else {
        // 'keep' = not a duplicate, just dismiss both flags
        await dismissDuplicateAnomaly(transactionId)
      }
    }
    ```
  - [x] Add `isDuplicateExcluded?: boolean` field to Transaction type
  - [x] Add `duplicateNote?: string` field to Transaction type for reference
  - [x] Excluded transactions: still visible in list but visually muted and excluded from spending calculations
  - [x] Dashboard spending: exclude transactions where `isDuplicateExcluded === true`
  - [x] Test: Confirm exclude sets `isDuplicateExcluded: true` on transaction
  - [x] Test: Confirm exclude dismisses flags on BOTH transactions
  - [x] Test: Excluded transaction does not count in dashboard spending totals
  - [x] Test: Excluded transaction shows muted in list
  - [x] Test: Confirm keep dismisses flags on both but does NOT exclude from spending
  - [x] Test: Note added: "Excluded as duplicate of transaction on [date]"
  - [x] Test: Undo restores both flags and removes `isDuplicateExcluded`

- [x] Task 3: Implement dismiss with pair awareness (AC: #3)
  - [x] Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const dismissDuplicateAnomaly = async (
      transactionId: number
    ): Promise<void> => {
      const tx = await db.transactions.get(transactionId)
      if (!tx?.anomalyFlags) return

      const dupFlag = tx.anomalyFlags.find(
        f => f.type === 'potential-duplicate' && !f.dismissed
      )
      if (!dupFlag) return

      // Dismiss on this transaction
      await dismissAnomaly(transactionId, 'potential-duplicate')

      // Also dismiss on the linked transaction
      if (dupFlag.linkedTransactionId) {
        await dismissAnomaly(dupFlag.linkedTransactionId, 'potential-duplicate')
      }
    }
    ```
  - [x] When dismissing a potential-duplicate flag, automatically dismiss on BOTH sides
  - [x] Toast: "Duplicate flag dismissed for both transactions" with Undo
  - [x] Undo restores flags on BOTH transactions
  - [x] Test: Dismissing on one transaction also dismisses on linked transaction
  - [x] Test: Undo restores both sides
  - [x] Test: Dismissing does not affect other anomaly types on same transaction
  - [x] Test: Chain scenario: dismiss B-A flag does not affect B-C flag

- [x] Task 4: Integrate detection with import flow (AC: #5)
  - [x] Modify the import completion flow (after high-amount and new-merchant detection):
    ```typescript
    // After new-merchant detection:
    const duplicateResult = await detectPotentialDuplicates()
    // Combine all anomaly results for unified toast
    ```
  - [x] Run detection asynchronously (non-blocking), same pattern as 9.3/9.4
  - [x] Toast: Combine all three anomaly types in one toast if multiple types flagged:
    ```typescript
    toast({
      title: `${totalFlagged} unusual transaction(s) flagged`,
      description: `${highAmountCount} high amounts, ${newMerchantCount} new merchants, ${duplicatePairs} potential duplicate pairs`,
      variant: 'default',
    })
    ```
  - [x] Test: Import triggers duplicate detection after other anomaly checks
  - [x] Test: Toast combines all three anomaly type counts
  - [x] Test: No toast when no anomalies of any type

- [x] Task 5: Update AnomalyBadge for potential-duplicate type (AC: #1, #2)
  - [x] Modify `src/features/anomalies/components/AnomalyBadge/index.tsx`:
    ```typescript
    // Badge text mapping (placeholder already exists from 9.4):
    'potential-duplicate': 'Potential duplicate',

    // Badge icon mapping:
    'potential-duplicate': Copy,   // Lucide Copy icon
    ```
  - [x] Use Lucide `Copy` icon for potential-duplicate type
  - [x] Tooltip: Show reason string (e.g., "Same amount (EUR29.99) as transaction on Jan 15 at Starbucks")
  - [x] Click on badge for potential-duplicate: show action menu with options:
    - "View other transaction" -> navigate to linked transaction
    - "Not a duplicate" -> calls `dismissDuplicateAnomaly` (dismisses both sides)
    - "Exclude as duplicate" -> calls `confirmDuplicate(id, 'exclude')`
  - [x] Action menu uses shadcn DropdownMenu
  - [x] Same warning color as other anomaly types: `hsl(38 92% 50%)`
  - [x] Test: Potential-duplicate flag renders badge with "Potential duplicate" text
  - [x] Test: Copy icon rendered
  - [x] Test: Tooltip shows correct reason
  - [x] Test: Click opens action menu with three options
  - [x] Test: "Not a duplicate" dismisses both sides
  - [x] Test: "Exclude as duplicate" marks as excluded

- [x] Task 6: Implement navigate-to-linked-transaction (AC: #2)
  - [x] Add "View other transaction" action in AnomalyBadge action menu
  - [x] Navigation: scroll to and focus the linked transaction in the list
  - [x] If linked transaction is filtered out by current view, clear filters to show it
  - [x] Test: Clicking "View other" scrolls to linked transaction
  - [x] Test: Focus moves to linked transaction
  - [x] Test: Works when transactions are in different sections of virtualized list

- [x] Task 7: Add potential-duplicate filter option (AC: #6)
  - [x] Extend the anomaly filter system (from Stories 9.3/9.4):
    ```typescript
    // Filter type: 'all' | 'high-amount' | 'new-merchant' | 'potential-duplicate'
    ```
  - [x] Filter by 'potential-duplicate': show only transactions with active potential-duplicate flags
  - [x] Command palette: "Show potential duplicates"
  - [x] Show pair count in filter UI (e.g., "3 potential duplicate pairs")
  - [x] Test: Filter shows only potential-duplicate flagged transactions
  - [x] Test: Filter shows correct pair count
  - [x] Test: All-anomalies filter includes potential-duplicate flags

- [x] Task 8: Update useAnomalies hook (AC: #6)
  - [x] Modify `src/features/anomalies/hooks/useAnomalies.ts`:
    ```typescript
    const potentialDuplicateCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'potential-duplicate' && !f.dismissed)
    ).length

    // Count pairs (divide by 2 since both sides are flagged):
    const potentialDuplicatePairs = Math.floor(potentialDuplicateCount / 2)

    return {
      flaggedTransactions,
      totalFlagged: flaggedTransactions.length,
      highAmountCount,
      newMerchantCount,
      potentialDuplicateCount,
      potentialDuplicatePairs,
      isLoading: transactions === undefined,
    }
    ```
  - [x] Test: Returns correct potentialDuplicateCount
  - [x] Test: Returns correct potentialDuplicatePairs (count / 2)
  - [x] Test: Counts only active (non-dismissed) potential-duplicate flags
  - [x] Test: Returns 0 when no potential-duplicate flags exist

- [x] Task 9: Handle excluded duplicates in spending calculations (AC: #4)
  - [x] Modify dashboard spending calculation to exclude `isDuplicateExcluded === true`
  - [x] Modify category average calculation in high-amount anomaly detection to exclude `isDuplicateExcluded`
  - [x] Visual indicator in TransactionRow for excluded duplicates: muted style (opacity-50) and "Excluded duplicate" badge
  - [x] Test: Excluded duplicate not counted in dashboard spending totals
  - [x] Test: Excluded duplicate not included in category average for high-amount detection
  - [x] Test: Excluded duplicate shows muted in transaction list
  - [x] Test: Excluded duplicate still visible (not hidden)

- [x] Task 10: Schema migration for new fields (AC: all)
  - [x] Add Dexie schema version for `isDuplicateExcluded` and `duplicateNote` fields on transactions
  - [x] Update Zod schema in `anomaly.schema.ts` for `linkedTransactionId` on `AnomalyFlag`
  - [x] Update Zod schema for `isDuplicateExcluded` and `duplicateNote` on Transaction
  - [x] Test: Schema migration applies cleanly
  - [x] Test: New fields can be stored and queried

- [x] Task 11: Write integration tests (AC: all)
  - [x] Add to `src/features/anomalies/services/anomalyDetector.integration.test.ts`:
  - [x] Full scenario: Two Starbucks EUR4.50 transactions 1 day apart -> both flagged as potential duplicates
  - [x] Date boundary: Two transactions exactly 3 days apart -> flagged; 4 days apart -> not flagged
  - [x] Amount mismatch: Same merchant, different amounts (EUR4.50 vs EUR5.00) -> not flagged
  - [x] Merchant mismatch: Different merchants, same amount, same date -> not flagged
  - [x] Unmatched scenario: Two unmatched transactions same raw string + same amount + 2 days -> both flagged
  - [x] Dismiss flow: Flag pair -> dismiss on one -> both dismissed -> re-run -> not re-flagged
  - [x] Exclude flow: Flag pair -> exclude one -> excluded from spending -> other transaction's flag dismissed
  - [x] Undo exclude: Exclude -> undo -> isDuplicateExcluded removed, flags restored on both
  - [x] Import trigger: Import CSV with duplicate -> detection runs -> pair flagged
  - [x] Filter by type: 2 duplicate pairs, 1 high-amount flag -> filter "potential-duplicate" shows 4 transactions
  - [x] Chain scenario: A-B-C same amount same merchant 1 day apart each -> A-B pair and B-C pair flagged
  - [x] Spending exclusion: Excluded duplicate transaction not in dashboard spending totals
  - [x] Combined anomaly: Duplicate transaction that is also high-amount -> has both flag types
  - [x] Navigate to linked: Click "View other" on flagged transaction -> scrolls to linked transaction
  - [x] Legitimate pair: Two coffees same day -> dismiss -> "Not a duplicate" -> both flags cleared
  - [x] Refund exclusion: Refund transaction not flagged as duplicate even if matches criteria

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Storage | Reuse `anomalyFlags` array on `transactions` table | Defined in Story 9.3 -- `AnomalyFlag` supports `'potential-duplicate'` type |
| Exclusion Field | `isDuplicateExcluded` boolean on `transactions` table | Simple flag, same pattern as `isRefund` |
| Detection Service | Extend existing `anomalyDetector.ts` | Same module, different detection function |
| Integration | Triggered after import (after high-amount and new-merchant detection) | `useLiveQuery` auto-updates UI |

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

### Data Model -- Extends Story 9.3/9.4 Infrastructure

**Additions needed:**

1. **`AnomalyFlag` type** -- add `linkedTransactionId?: number` for cross-referencing duplicate pairs
2. **`Transaction` type** -- add `isDuplicateExcluded?: boolean` and `duplicateNote?: string`
3. **Dexie schema migration** for new transaction fields

**No new Dexie tables.** All data lives on existing `transactions` table.

**Existing infrastructure reused (from Story 9.3):**
- `AnomalyType = 'high-amount' | 'new-merchant' | 'potential-duplicate'` -- `potential-duplicate` already in the union
- `AnomalyFlag` type with `type`, `reason`, `detectedAt`, `dismissed`, `dismissedAt`
- `anomalyFlags?: AnomalyFlag[]` on the `Transaction` type
- `AnomalyBadge` component (extend with potential-duplicate badge text/icon/actions)
- `useAnomalies` hook (extend with `potentialDuplicateCount`, `potentialDuplicatePairs`)
- `dismissAnomaly` function (reuse, wrap with pair-aware logic for this type)
- Anomaly filter (extend with type-specific filtering)

**Existing infrastructure reused (from Story 9.4):**
- Combined toast for multiple anomaly types
- Anomaly type filter with type-specific options
- AnomalyBadge with multiple badge type rendering

### Detection Algorithm Design

**Algorithm:**
1. Load all non-refund, non-excluded transactions
2. Group by `merchantId` (separate group for unmatched: group by `rawMerchantString`)
3. Within each group, sort by date ascending
4. Sliding-window comparison: for each transaction, check following transactions within 3-day window
5. If same `amount` (exact) AND within `DUPLICATE_WINDOW_DAYS` calendar days:
   - Check neither already has `potential-duplicate` flag (active or dismissed for this specific pair)
   - Flag BOTH with `linkedTransactionId` pointing to the other
6. Batch update all flagged transactions

**Date comparison:**
```typescript
const isWithinDays = (dateA: string, dateB: string, days: number): boolean => {
  const a = new Date(dateA)
  const b = new Date(dateB)
  const diffMs = Math.abs(a.getTime() - b.getTime())
  return diffMs <= days * 24 * 60 * 60 * 1000
}
```

**Key distinction -- Import duplicates (2.6) vs Anomaly duplicates (this story):**
- Story 2.6: Prevents importing the same CSV row twice (exact match at import time)
- Story 9.5: Flags legitimate transactions that LOOK similar post-import (same amount + merchant + close dates = possible vendor double-charge)

### Previous Story Intelligence

**From Story 9.4 (Anomaly Detection - New Merchants):**
- Combined toast pattern for multiple anomaly types established
- Anomaly type filter with type-specific options exists
- AnomalyBadge already handles multiple badge types
- Import flow already calls `detectHighAmountAnomalies()` then `detectNewMerchantAnomalies()`
- Add `detectPotentialDuplicates()` as third call in sequence

**From Story 9.3 (Anomaly Detection - High Amounts):**
- `AnomalyFlag` and `AnomalyType` already support `'potential-duplicate'`
- `AnomalyBadge` component exists with placeholder for `potential-duplicate`
- `dismissAnomaly` function works generically -- wrap with pair logic
- `useAnomalies` hook exists -- extend with duplicate counts
- Import integration pattern established
- Integration test file exists -- add duplicate scenarios

**From Story 8.1 (Mark Transaction as Refund):**
- `isRefund` field -- exclude refunds from duplicate detection
- Refund + purchase pair should NOT be flagged as duplicate

**From Story 8.2 (Link Refund to Original Purchase):**
- `linkedTransactionId` concept exists for refunds (different field on transaction)
- For duplicates, `linkedTransactionId` lives inside `AnomalyFlag` (not on transaction root)
- No field name conflict

**From Story 2.6 (Duplicate Transaction Detection):**
- Import-time dedup is separate -- prevents re-importing same data
- This story detects vendor double-charges post-import

**Overall project status:**
- All stories are `ready-for-dev` -- no implementation code exists yet
- Recent commits are all story creation (no code patterns to extract)

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `228eced` feat(story): create story 9-4 anomaly detection new merchants
- `15ec358` feat(story): create story 9-3 anomaly detection high amounts
- `350fda8` feat(story): create story 9-2 subscriptions view (S key)

No implementation patterns to analyze. The project is in planning phase.

### UX Design Considerations

**Source: [ux-design-specification.md#Semantic-Colors]**

- **Warning color**: `hsl(38 92% 50%)` -- same warning token for all anomaly types
- **Color independence**: "Anomalies: color + icon indicator" -- must use BOTH warning color AND icon
- **Potential-duplicate icon**: Lucide `Copy` (semantically "duplicate/copy")
- **Badge text**: "Potential duplicate" (distinct from "Unusual amount" and "New merchant")
- **Tooltip**: Shows reason: "Same amount (EUR29.99) as transaction on Jan 15 at Starbucks"
- **Action menu**: Unlike simple dismiss for other types, potential-duplicate needs three actions:
  - "View other transaction" (navigate to linked)
  - "Not a duplicate" (dismiss both sides)
  - "Exclude as duplicate" (mark one as excluded from spending)
- **Excluded transaction row**: Muted style (opacity-50) to indicate excluded from spending
- **Multiple badges**: Transaction can have potential-duplicate + high-amount + new-merchant simultaneously
- **Transaction row**: 48px height constraint -- action menu should be compact (DropdownMenu)

### File Structure for This Story

```
src/
├── types/
│   ├── anomaly.types.ts (MODIFY -- add linkedTransactionId to AnomalyFlag)
│   └── transaction.types.ts (MODIFY -- add isDuplicateExcluded, duplicateNote)
├── lib/
│   ├── db/
│   │   ├── schema.ts (MODIFY -- add schema version for new fields)
│   │   └── migrations.ts (MODIFY -- add migration for isDuplicateExcluded)
│   └── schemas/
│       └── anomaly.schema.ts (MODIFY -- add linkedTransactionId to Zod schema)
├── features/
│   ├── anomalies/
│   │   ├── services/
│   │   │   ├── anomalyDetector.ts (MODIFY -- add detectPotentialDuplicates, confirmDuplicate, dismissDuplicateAnomaly)
│   │   │   ├── anomalyDetector.test.ts (MODIFY -- add duplicate detection unit tests)
│   │   │   └── anomalyDetector.integration.test.ts (MODIFY -- add duplicate integration tests)
│   │   ├── components/
│   │   │   └── AnomalyBadge/
│   │   │       ├── index.tsx (MODIFY -- add potential-duplicate badge, action menu, navigate-to-linked)
│   │   │       └── AnomalyBadge.test.tsx (MODIFY -- add potential-duplicate tests)
│   │   ├── hooks/
│   │   │   ├── useAnomalies.ts (MODIFY -- add potentialDuplicateCount, potentialDuplicatePairs)
│   │   │   └── useAnomalies.test.ts (MODIFY -- add duplicate count tests)
│   │   └── index.ts (MODIFY -- export new functions)
│   ├── import/
│   │   └── hooks/
│   │       └── useImport.ts (MODIFY -- add detectPotentialDuplicates call)
│   └── dashboard/
│       └── components/ (MODIFY -- exclude isDuplicateExcluded from spending totals)
├── components/
│   └── TransactionRow/
│       └── index.tsx (MODIFY -- add muted style for excluded duplicates)
└── hooks/
    └── useFocusMode.ts (MODIFY -- add potential-duplicate filter option)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `toast` | `src/components/ui/toast.tsx` | Notifications with undo |
| `cn` | `@/lib/utils` | Conditional class names |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount formatting |
| `formatDate` | `src/lib/utils/formatDate.ts` | Date formatting |
| `AnomalyFlag` type | `src/types/anomaly.types.ts` | Already supports `'potential-duplicate'` |
| `dismissAnomaly` | `src/features/anomalies/services/anomalyDetector.ts` | Base dismiss (wrap with pair logic) |
| `AnomalyBadge` | `src/features/anomalies/components/AnomalyBadge/` | Extend with duplicate type |
| `useAnomalies` | `src/features/anomalies/hooks/useAnomalies.ts` | Extend with duplicate counts |
| `Badge` | shadcn/ui | Warning badge display |
| `Tooltip` | shadcn/ui | Reason tooltip on hover |
| `DropdownMenu` | shadcn/ui | Action menu for duplicate resolution |
| `Copy` | `lucide-react` | Duplicate icon |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `anomaly.types.ts` | Add `linkedTransactionId` to AnomalyFlag | Low -- optional field |
| `transaction.types.ts` | Add `isDuplicateExcluded`, `duplicateNote` | Low -- optional fields |
| `anomalyDetector.ts` | Add `detectPotentialDuplicates`, `confirmDuplicate`, `dismissDuplicateAnomaly` | Low -- additive functions |
| `AnomalyBadge/index.tsx` | Add duplicate badge text/icon, action menu, navigate-to-linked | Medium -- new interaction pattern |
| `useAnomalies.ts` | Add `potentialDuplicateCount`, `potentialDuplicatePairs` | Low -- additive |
| `TransactionRow/index.tsx` | Add muted style for `isDuplicateExcluded` transactions | Low -- conditional CSS |
| Import flow | Add `detectPotentialDuplicates()` call | Low -- async non-blocking |
| Dashboard spending | Exclude `isDuplicateExcluded` transactions | Low -- filter condition |
| `useFocusMode.ts` | Add potential-duplicate filter option | Low -- extends filter |
| `anomaly.schema.ts` | Add `linkedTransactionId` to Zod schema | Low -- optional field |
| `db/schema.ts` | Add schema version | Low -- standard Dexie migration |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `subscriptionDetector.ts` | No overlap with duplicate detection |
| `SettingsPage` | No configurable settings for duplicate detection (3-day window is fixed) |
| `MerchantPage` | No duplicate indicators on merchant pages |
| `Sidebar.tsx` | Anomaly count already handled generically |
| `CommandPalette/index.tsx` | Filter already added via useFocusMode |
| `Breadcrumb` | No new breadcrumb segments |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| Detection time | <2s for 10k transactions | Group by merchant first, then sorted sliding window within each group |
| Import response | Not blocked | Detection is fire-and-forget async |
| Badge rendering | <16ms | Reuses existing AnomalyBadge component |
| Action menu | <50ms | shadcn DropdownMenu, lazy rendered |
| Navigate to linked | <100ms | Scroll-to-index in virtualized list |

**Optimization:** Group by merchant first reduces comparison space significantly. Within each merchant group, sorted dates enable a sliding window approach instead of O(n^2) all-pairs comparison.

### Edge Cases to Handle

1. **Three identical transactions (chain):** A-B and B-C are separate pairs. B gets two potential-duplicate flags, each with different `linkedTransactionId`.
2. **Transaction excluded then new duplicate imported:** The excluded one stays excluded. The new transaction gets flagged against non-excluded transactions only.
3. **Refund paired with purchase:** A refund matching a purchase's amount and merchant should NOT be flagged as duplicate -- refunds are excluded from detection.
4. **Same amount, no merchant (both unmatched):** Match by `rawMerchantString` instead of `merchantId`. Same logic applies.
5. **Zero or one transaction for a merchant:** No pairs possible, skip.
6. **Dismiss one side of a chain:** If B has flags for both A and C, dismissing B-A should not affect B-C.
7. **Exclude then undo:** Undo should restore `isDuplicateExcluded = false` and re-add flags on both transactions.
8. **Transaction moved to different merchant:** Previous duplicate flags may no longer be valid. Consider cleaning stale flags during next detection run.
9. **Two coffees same day (legitimate):** User dismisses as "Not a duplicate" -- both flags cleared, pair not re-flagged.
10. **Import-time duplicates (Story 2.6) vs. post-import duplicates (this story):** Import duplicates are exact matches prevented at import. This story catches near-duplicates that got through import (vendor double-charges).
11. **Multiple amounts match:** Two EUR4.50 charges and one EUR4.50 charge at same merchant same day -- three-way comparison, flag all relevant pairs.
12. **Linked refund transaction (Story 8.2):** `linkedTransactionId` on refunds is a different field than `AnomalyFlag.linkedTransactionId`. No conflict.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` -- use `type`
- DO NOT use default exports -- use named exports
- DO NOT create `__tests__/` directories -- co-locate tests
- DO NOT duplicate anomaly data in React state -- read `anomalyFlags` from transactions via `useLiveQuery`
- DO NOT create a separate Dexie table for duplicate pairs -- flags live on transactions (9.3 infrastructure)
- DO NOT compare ALL transactions with ALL others (O(n^2)) -- group by merchant first, then sliding window
- DO NOT re-implement `dismissAnomaly` -- wrap it with pair-aware logic
- DO NOT re-implement `AnomalyBadge` from scratch -- extend the existing component
- DO NOT confuse import-time duplicate detection (Story 2.6) with post-import anomaly detection (this story)
- DO NOT flag refund-purchase pairs as duplicates -- exclude `isRefund === true` transactions
- DO NOT hardcode 3 days in multiple places -- use constant: `const DUPLICATE_WINDOW_DAYS = 3`
- DO NOT modify the merchant table -- duplicate detection is transaction-level only
- DO NOT remove dismissed flags during re-detection -- they are audit trail

### Scope Boundaries

**In scope (this story):**
- `detectPotentialDuplicates` function in existing anomalyDetector service
- `confirmDuplicate` function for exclude/keep actions
- `dismissDuplicateAnomaly` function for pair-aware dismissal
- `linkedTransactionId` field on `AnomalyFlag` type
- `isDuplicateExcluded` and `duplicateNote` fields on `Transaction` type
- Integration into import flow (after high-amount and new-merchant detection)
- `AnomalyBadge` extension with potential-duplicate text, icon, action menu
- Navigate-to-linked-transaction action
- `useAnomalies` hook extension with `potentialDuplicateCount`, `potentialDuplicatePairs`
- Anomaly type filter extension (filter by `potential-duplicate` specifically)
- Combined toast for all three anomaly types
- Dashboard spending exclusion for `isDuplicateExcluded` transactions
- Muted row style for excluded duplicates
- Dexie schema migration for new fields
- Tests for all new functionality

**Out of scope (future stories/epics):**
- Configurable duplicate detection window (currently fixed at 3 days)
- Fuzzy amount matching (e.g., within 5% instead of exact)
- Auto-exclude obvious duplicates
- Duplicate detection for different merchants (cross-merchant)
- Dashboard anomaly summary widget
- Anomaly notification sounds or alerts
- Bulk dismiss/resolve duplicates
- Per-merchant duplicate sensitivity configuration
- Anomaly history/audit log view

### Validation Checklist

Before marking complete:
- [x] `detectPotentialDuplicates` correctly flags transaction pairs (same merchant + same amount + within 3 days)
- [x] Both transactions in pair are flagged with `linkedTransactionId` pointing to each other
- [x] Unmatched transactions matched by `rawMerchantString`
- [x] Refund transactions excluded from detection
- [x] Already-flagged pairs not re-flagged
- [x] Dismissed pairs not re-flagged
- [x] `DUPLICATE_WINDOW_DAYS` constant used (not hardcoded 3)
- [x] Dismiss dismisses BOTH sides of pair
- [x] Undo restores flags on BOTH sides
- [x] "Exclude as duplicate" sets `isDuplicateExcluded = true`
- [x] Excluded duplicates not counted in dashboard spending
- [x] Excluded duplicates not counted in category averages for high-amount detection
- [x] Excluded duplicates show muted in transaction list
- [x] "Not a duplicate" dismisses both flags, does NOT exclude from spending
- [x] Import triggers duplicate detection (async, non-blocking)
- [x] Combined toast includes all three anomaly type counts
- [x] AnomalyBadge renders "Potential duplicate" text with Copy icon
- [x] Tooltip shows correct reason string
- [x] Action menu offers "View other", "Not a duplicate", "Exclude as duplicate"
- [x] Navigate-to-linked scrolls to and focuses linked transaction
- [x] Filter by potential-duplicate shows only duplicate-flagged transactions
- [x] `useAnomalies` returns correct `potentialDuplicateCount` and `potentialDuplicatePairs`
- [x] Chain scenario (A-B-C) handled correctly with separate pairs
- [x] Dexie schema migration for new fields
- [x] Zod schema updated for `linkedTransactionId`
- [x] No TypeScript errors
- [x] Named exports only
- [x] Uses `type` not `interface`
- [x] Tests co-located with source files
- [x] All new tests pass
- [x] No unnecessary external dependencies added

### Project Structure Notes

- All changes are extensions to existing `src/features/anomalies/` module from Stories 9.3/9.4
- Minor type additions to `anomaly.types.ts` and `transaction.types.ts`
- Dexie schema migration for `isDuplicateExcluded` field
- TransactionRow needs minor modification for excluded-duplicate muted style
- Dashboard spending calculation needs `isDuplicateExcluded` exclusion filter
- No new feature modules or directories needed

### References

- [Source: epics.md#Epic-9-Story-9.5-Anomaly-Detection-Potential-Duplicates]
- [Source: prd.md#FR41 - System can flag potential duplicate transactions]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/anomalies/ for detection logic]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Semantic-Colors - warning: hsl(38 92% 50%) for anomalies]
- [Source: ux-design-specification.md#Accessibility - Color independence: anomalies use color + icon indicator]
- [Source: ux-design-specification.md#Component-Inventory - Badge, Tooltip, DropdownMenu for anomaly display]
- [Story 9.3: Anomaly Detection High Amounts - AnomalyFlag type, AnomalyBadge, useAnomalies, dismissAnomaly, filter, import integration]
- [Story 9.4: Anomaly Detection New Merchants - Combined toast pattern, anomaly type filter, badge extension pattern]
- [Story 8.1: Mark Transaction as Refund - isRefund field, exclude refunds from detection]
- [Story 8.2: Link Refund to Original Purchase - linkedTransactionId concept (different field/purpose)]
- [Story 2.6: Duplicate Transaction Detection - Import-time dedup (different from post-import anomaly)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 11 tasks implemented and verified
- 106 anomaly tests pass (49 unit + 35 integration + 11 badge + 4 settings form + 7 hook)
- Full suite: 1280 tests pass, 1 pre-existing failure (accounts.test.tsx DOMMatrix)
- TypeScript compiles cleanly with --noEmit
- Detection algorithm uses grouped sliding window for O(n log n) per merchant group
- Chain scenarios (A-B-C) properly handled with separate pair flags
- Pair-aware dismiss only affects the specific linked flag, preserving other duplicate flags on same transaction
- Combined toast after import includes all three anomaly type counts

### File List

**Modified:**
- `src/types/anomaly.types.ts` - Added `linkedTransactionId` to AnomalyFlag
- `src/types/transaction.types.ts` - Added `isDuplicateExcluded`, `duplicateNote`
- `src/lib/schemas/anomaly.schema.ts` - Added `linkedTransactionId` to Zod schema
- `src/lib/db/schema.ts` - Added Dexie version 9
- `src/features/anomalies/services/anomalyDetector.ts` - Added `detectPotentialDuplicates`, `dismissDuplicateAnomaly`, `undoDismissDuplicateAnomaly`, `confirmDuplicate`, `undoConfirmDuplicate`
- `src/features/anomalies/services/anomalyDetector.test.ts` - Added 19 unit tests for duplicate detection
- `src/features/anomalies/services/anomalyDetector.integration.test.ts` - Added 15 integration tests for duplicate detection
- `src/features/anomalies/components/AnomalyBadge/index.tsx` - Added DropdownMenu for duplicate actions
- `src/features/anomalies/hooks/useAnomalies.ts` - Added `potentialDuplicateCount`, `potentialDuplicatePairs`
- `src/features/anomalies/index.ts` - Exported new functions and hooks
- `src/features/import/services/importWithRules.ts` - Added `detectPotentialDuplicates` to import flow
- `src/features/dashboard/hooks/useSpendingBreakdown.ts` - Exclude `isDuplicateExcluded` from spending
- `src/features/dashboard/hooks/useNetSpending.ts` - Exclude `isDuplicateExcluded` from net spending
- `src/components/CommandPalette/index.tsx` - Added "Show potential duplicates" command
- `src/components/TransactionRow/index.tsx` - Added muted style and badge for excluded duplicates
- `src/features/transactions/components/TransactionList/index.tsx` - Added duplicate action callbacks

**Created:**
- `src/features/anomalies/hooks/useDuplicateActions.ts` - Hook for dismiss/exclude duplicate actions with toast+undo
