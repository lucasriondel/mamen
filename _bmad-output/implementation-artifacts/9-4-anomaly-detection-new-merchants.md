# Story 9.4: Anomaly Detection - New Merchants

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **transactions from new/unknown merchants to be flagged**,
So that **I can verify unfamiliar charges and catch unauthorized spending (FR40)**.

## Acceptance Criteria

1. **Given** a transaction is assigned to a new merchant (< 30 days old)
   **When** viewing the transaction
   **Then** it shows a "New merchant" anomaly flag
   **And** this leverages the first-time merchant detection from Story 7.3

2. **Given** I import new transactions
   **When** they match a brand new merchant (just created)
   **Then** those transactions are flagged as "New merchant"
   **And** the flag appears alongside any other anomaly flags (e.g., high-amount from 9.3)

3. **Given** a transaction doesn't match any merchant
   **When** it remains unmatched
   **Then** it is NOT flagged as "new merchant" (only unmatched)
   **And** the new merchant flag only applies after merchant assignment

4. **Given** I view flagged transactions
   **When** filtering by anomaly type
   **Then** I can filter to "New merchants" specifically
   **And** this helps me review unfamiliar spending sources

5. **Given** a merchant ages past 30 days
   **When** viewing its transactions
   **Then** the "New merchant" flag is no longer shown on new transactions
   **And** the merchant is considered established

## Tasks / Subtasks

- [ ] Task 1: Implement new-merchant anomaly detection service (AC: #1, #2, #3, #5)
  - [ ] Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const detectNewMerchantAnomalies = async (): Promise<{
      flagged: number
    }> => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // 1. Query all merchants where createdAt > thirtyDaysAgo
      // 2. Get all merchant IDs that are "new"
      // 3. Query all transactions where merchantId is in the new merchant set
      // 4. For each transaction:
      //    - Skip if already has a 'new-merchant' anomaly flag (dismissed or active)
      //    - Add AnomalyFlag { type: 'new-merchant', reason, detectedAt, dismissed: false }
      // 5. Batch update flagged transactions in Dexie
    }
    ```
  - [ ] Reason string: `"First seen merchant - [Merchant Name] created [X days ago]"`
  - [ ] Only flag transactions that have a `merchantId` (skip unmatched — AC #3)
  - [ ] Use `merchant.createdAt` field (established in Story 7.3 first-time merchant detection)
  - [ ] Skip transactions that already have a `new-merchant` flag (avoid re-flagging)
  - [ ] Test: Merchant created 10 days ago -> its transactions are flagged
  - [ ] Test: Merchant created 31 days ago -> its transactions are NOT flagged
  - [ ] Test: Merchant created exactly 30 days ago -> NOT flagged (> 30 days threshold)
  - [ ] Test: Unmatched transaction (no merchantId) -> NOT flagged
  - [ ] Test: Already-flagged transaction not re-flagged
  - [ ] Test: Dismissed new-merchant flag not re-flagged
  - [ ] Test: Transaction with both high-amount and new-merchant flags -> both present
  - [ ] Test: Reason string format correct: "First seen merchant - Amazon created 5 days ago"

- [ ] Task 2: Handle merchant age expiry — remove stale flags (AC: #5)
  - [ ] Add to `src/features/anomalies/services/anomalyDetector.ts`:
    ```typescript
    export const cleanExpiredNewMerchantFlags = async (): Promise<{
      cleaned: number
    }> => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      // 1. Get all merchants where createdAt <= thirtyDaysAgo (no longer "new")
      // 2. Get all transactions for those merchants
      // 3. For each transaction with an active (non-dismissed) 'new-merchant' flag:
      //    - Remove the flag from anomalyFlags array
      // 4. Batch update cleaned transactions
    }
    ```
  - [ ] Run cleanup as part of detection cycle (before flagging new ones)
  - [ ] Only remove active (non-dismissed) flags — dismissed flags are audit trail
  - [ ] Test: Merchant ages past 30 days -> active new-merchant flags removed from its transactions
  - [ ] Test: Dismissed new-merchant flags NOT removed (kept for audit)
  - [ ] Test: Other anomaly flags on same transaction not affected

- [ ] Task 3: Integrate new-merchant detection into import and merchant-creation flows (AC: #1, #2)
  - [ ] Modify the import completion flow (same location as high-amount detection from Story 9.3):
    ```typescript
    // After high-amount detection:
    const newMerchantResult = await detectNewMerchantAnomalies()
    // Combine results with high-amount detection for unified toast
    ```
  - [ ] Also trigger detection when a merchant is newly created (from R key / merchant assignment modal):
    ```typescript
    // After merchant creation + rule application:
    // Transactions just assigned to this new merchant should be flagged
    await detectNewMerchantAnomalies()
    ```
  - [ ] Run `cleanExpiredNewMerchantFlags()` before detection (clean stale, then detect new)
  - [ ] Toast: Combine with existing anomaly toast if both types flagged:
    ```typescript
    // If both high-amount and new-merchant flagged in same run:
    toast({
      title: `${totalFlagged} unusual transaction(s) flagged`,
      description: `${highAmountCount} high amounts, ${newMerchantCount} new merchants`,
      variant: 'default',
    })
    ```
  - [ ] Detection runs asynchronously (non-blocking), same pattern as 9.3
  - [ ] Test: Import triggers new-merchant detection after high-amount detection
  - [ ] Test: Creating a new merchant triggers detection for its transactions
  - [ ] Test: Toast combines both anomaly type counts
  - [ ] Test: Cleanup runs before detection

- [ ] Task 4: Update AnomalyBadge for new-merchant type (AC: #1, #2)
  - [ ] Modify `src/features/anomalies/components/AnomalyBadge/index.tsx`:
    ```typescript
    // Add badge text mapping:
    const badgeText: Record<AnomalyType, string> = {
      'high-amount': 'Unusual amount',
      'new-merchant': 'New merchant',
      'potential-duplicate': 'Potential duplicate', // future 9.5
    }

    // Add icon mapping:
    const badgeIcon: Record<AnomalyType, LucideIcon> = {
      'high-amount': AlertTriangle,
      'new-merchant': UserPlus,    // or AlertCircle — Lucide icon for new entity
      'potential-duplicate': Copy, // future 9.5
    }
    ```
  - [ ] Use Lucide `UserPlus` icon for new-merchant type (semantically "new person/entity")
  - [ ] When multiple flag types exist on same transaction, render multiple badges (or a combined badge with count)
  - [ ] Tooltip for new-merchant: shows the reason string (e.g., "First seen merchant - Amazon created 5 days ago")
  - [ ] Same warning color (`hsl(38 92% 50%)`) for consistency
  - [ ] Test: New-merchant flag renders badge with "New merchant" text
  - [ ] Test: UserPlus icon rendered for new-merchant type
  - [ ] Test: Transaction with both high-amount and new-merchant shows both badges
  - [ ] Test: Tooltip shows correct reason for new-merchant type
  - [ ] Test: Dismiss works for new-merchant type independently of high-amount

- [ ] Task 5: Add new-merchant filter option (AC: #4)
  - [ ] Modify the anomaly filter system (established in Story 9.3 Task 7):
    ```typescript
    // Extend filter to support anomaly type selection:
    // 'all-anomalies' | 'high-amount' | 'new-merchant' | 'potential-duplicate'
    type AnomalyFilter = 'all' | AnomalyType
    ```
  - [ ] Add filter dropdown or toggle options for specific anomaly types
  - [ ] When filtering by 'new-merchant': show only transactions with active new-merchant flags
  - [ ] Filter options available in command palette: "Show new merchant transactions"
  - [ ] Test: Filter by new-merchant shows only new-merchant flagged transactions
  - [ ] Test: Filter by all-anomalies shows both high-amount and new-merchant
  - [ ] Test: Anomaly type counts displayed correctly in filter UI

- [ ] Task 6: Update useAnomalies hook (AC: #4)
  - [ ] Modify `src/features/anomalies/hooks/useAnomalies.ts`:
    ```typescript
    // Add new-merchant count:
    const newMerchantCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'new-merchant' && !f.dismissed)
    ).length

    return {
      flaggedTransactions,
      totalFlagged: flaggedTransactions.length,
      highAmountCount,
      newMerchantCount,  // NEW
      isLoading: transactions === undefined,
    }
    ```
  - [ ] Test: Returns correct newMerchantCount
  - [ ] Test: Counts only active (non-dismissed) new-merchant flags
  - [ ] Test: Returns 0 when no new-merchant flags exist

- [ ] Task 7: Write integration tests (AC: all)
  - [ ] Add to `src/features/anomalies/services/anomalyDetector.integration.test.ts`:
  - [ ] Full scenario: Create merchant today, assign 3 transactions -> all 3 flagged as "New merchant"
  - [ ] Age-out scenario: Merchant created 31 days ago -> no new flags, existing active flags cleaned
  - [ ] Combined anomaly: Transaction at 3x category average from new merchant -> has both `high-amount` AND `new-merchant` flags
  - [ ] Unmatched exclusion: 5 unmatched transactions -> none flagged as new-merchant
  - [ ] Merchant creation trigger: Press R to create merchant -> transactions immediately flagged
  - [ ] Import trigger: Import CSV with transactions matching new merchant -> detection runs -> flagged
  - [ ] Dismiss flow: Flag transaction as new-merchant -> dismiss -> re-run detection -> not re-flagged
  - [ ] Dismiss independence: Dismiss new-merchant flag -> high-amount flag still active
  - [ ] Filter by type: 3 new-merchant flags, 2 high-amount flags -> filter "new-merchant" shows 3
  - [ ] Cleanup on age-out: Merchant turns 31 days old -> cleanup removes active new-merchant flags only
  - [ ] Undo dismiss: Dismiss new-merchant flag -> undo via toast -> flag restored

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Storage | Reuse `anomalyFlags` array on `transactions` table | Defined in Story 9.3 — `AnomalyFlag` supports `'new-merchant'` type |
| Detection Service | Extend existing `anomalyDetector.ts` | Same module, different detection function |
| Merchant Age | Use `createdAt` field on merchants table | Established in Story 7.3 first-time merchant detection |
| Integration | Triggered after import + after merchant creation | `useLiveQuery` auto-updates UI |

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

### Data Model — Reuses Story 9.3 Infrastructure

**No schema changes needed.** Story 9.3 already defined:

- `AnomalyType = 'high-amount' | 'new-merchant' | 'potential-duplicate'` — `new-merchant` already in the union
- `AnomalyFlag` type with `type`, `reason`, `detectedAt`, `dismissed`, `dismissedAt`
- `anomalyFlags?: AnomalyFlag[]` on the `Transaction` type
- `AnomalyBadge` component (extend with new-merchant badge text/icon)
- `useAnomalies` hook (extend with `newMerchantCount`)
- Anomaly filter in transaction list (extend with type-specific filtering)

**Merchant table fields used (from Story 7.3):**
- `createdAt: string` — ISO date when merchant was first created
- This is the anchor for "new merchant" determination (< 30 days old)

### Detection Algorithm Design

**New-merchant detection is simpler than high-amount:**
1. Load all merchants where `createdAt` > 30 days ago (new merchants)
2. Get all transactions with `merchantId` in the new merchant set
3. For each transaction, check if it already has a `new-merchant` flag
4. If not, add the flag

**Cleanup (age-out):**
1. Load all merchants where `createdAt` <= 30 days ago (no longer new)
2. For their transactions, remove any active (non-dismissed) `new-merchant` flags
3. Run cleanup BEFORE detection to avoid race conditions

**Trigger points:**
- After import (same flow as high-amount detection)
- After merchant creation (R key flow)
- Both are async/non-blocking

### Previous Story Intelligence

**From Story 9.3 (Anomaly Detection - High Amounts):**
- `AnomalyFlag` and `AnomalyType` already support `'new-merchant'`
- `AnomalyBadge` component exists — extend it with new type mapping
- `useAnomalies` hook exists — extend it with `newMerchantCount`
- `dismissAnomaly` function works for any anomaly type (generic)
- Anomaly filter exists — extend with type-specific option
- Import flow already triggers `detectHighAmountAnomalies()` — add `detectNewMerchantAnomalies()` after it
- Toast pattern established for anomaly notifications
- Integration test file exists — add new-merchant test scenarios

**From Story 7.3 (First-Time Merchant Detection):**
- `merchant.createdAt` field already exists on merchants table
- 30-day "new" threshold already established
- New badge visual indicator on merchant pages
- This story adds anomaly FLAG on transactions (different from the merchant badge)
- IMPORTANT: Do not confuse merchant-level "new" badge (7.3) with transaction-level anomaly flag (this story)

**From Story 4.3 (Create Merchant with Rule - R Key):**
- Merchant creation flow — trigger point for new-merchant detection
- After merchant + rule creation, transactions are assigned -> trigger detection

**Overall project status:**
- All stories are `ready-for-dev` — no implementation code exists yet
- Recent commits are all story creation (no code patterns to extract)

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `15ec358` feat(story): create story 9-3 anomaly detection high amounts
- `350fda8` feat(story): create story 9-2 subscriptions view (S key)
- `9dfa8f5` feat(story): create story 9-1 subscription detection algorithm

No implementation patterns to analyze. The project is in planning phase.

### UX Design Considerations

**Source: [ux-design-specification.md#Semantic-Colors]**

- **Warning color**: `hsl(38 92% 50%)` — same warning token for all anomaly types
- **Color independence**: "Anomalies: color + icon indicator" — must use BOTH warning color AND icon
- **New-merchant icon**: Lucide `UserPlus` (new entity semantic)
- **Badge text**: "New merchant" (distinct from "Unusual amount")
- **Tooltip**: Shows reason string: "First seen merchant - [Name] created [X days ago]"
- **Multiple badges**: When transaction has both high-amount and new-merchant, show both
- **Dismissal**: Same pattern as 9.3 — click badge, toast with Undo
- **Transaction row**: 48px height constraint — multiple badges must fit within row layout

### File Structure for This Story

```
src/
├── features/
│   ├── anomalies/
│   │   ├── services/
│   │   │   ├── anomalyDetector.ts (MODIFY — add detectNewMerchantAnomalies + cleanExpiredNewMerchantFlags)
│   │   │   ├── anomalyDetector.test.ts (MODIFY — add new-merchant unit tests)
│   │   │   └── anomalyDetector.integration.test.ts (MODIFY — add new-merchant integration tests)
│   │   ├── components/
│   │   │   └── AnomalyBadge/
│   │   │       ├── index.tsx (MODIFY — add new-merchant badge text, icon, tooltip)
│   │   │       └── AnomalyBadge.test.tsx (MODIFY — add new-merchant badge tests)
│   │   ├── hooks/
│   │   │   ├── useAnomalies.ts (MODIFY — add newMerchantCount)
│   │   │   └── useAnomalies.test.ts (MODIFY — add newMerchantCount tests)
│   │   └── index.ts (MODIFY — export new functions)
│   └── import/
│       └── hooks/
│           └── useImport.ts (MODIFY — add detectNewMerchantAnomalies call after import)
├── components/
│   └── TransactionRow/
│       └── index.tsx (NO CHANGE — AnomalyBadge already integrated in 9.3, handles any flag type)
└── hooks/
    └── useFocusMode.ts (MODIFY — add anomaly type filter options)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `toast` | `src/components/ui/toast.tsx` | Notifications with undo |
| `cn` | `@/lib/utils` | Conditional class names |
| `AnomalyFlag` type | `src/types/anomaly.types.ts` | Already supports `'new-merchant'` |
| `dismissAnomaly` | `src/features/anomalies/services/anomalyDetector.ts` | Works for any anomaly type |
| `AnomalyBadge` | `src/features/anomalies/components/AnomalyBadge/` | Extend with new type mapping |
| `useAnomalies` | `src/features/anomalies/hooks/useAnomalies.ts` | Extend with newMerchantCount |
| `Badge` | shadcn/ui | Warning badge display |
| `Tooltip` | shadcn/ui | Reason tooltip on hover |
| `UserPlus` | `lucide-react` | New merchant icon |
| Merchant `createdAt` | `src/types/merchant.types.ts` | 30-day age check |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `anomalyDetector.ts` | Add `detectNewMerchantAnomalies` + `cleanExpiredNewMerchantFlags` | Low — additive functions |
| `AnomalyBadge/index.tsx` | Add badge text/icon mapping for `new-merchant` | Low — extend existing map |
| `useAnomalies.ts` | Add `newMerchantCount` return value | Low — additive |
| Import flow | Add `detectNewMerchantAnomalies()` call | Low — async non-blocking |
| `useFocusMode.ts` | Add anomaly type filter option | Low — extends filter system |
| `anomalies/index.ts` | Export new functions | Low — additive |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `TransactionRow/index.tsx` | Already renders `AnomalyBadge` generically for any flag type (from 9.3) |
| `src/types/anomaly.types.ts` | `'new-merchant'` already in `AnomalyType` union (from 9.3) |
| `src/lib/db/schema.ts` | No schema changes — reuses existing anomalyFlags on transactions |
| `src/lib/db/migrations.ts` | No new migration needed |
| `src/lib/schemas/anomaly.schema.ts` | Zod schema already validates `new-merchant` type (from 9.3) |
| `SettingsPage` | No new settings for new-merchant detection (30-day threshold is fixed) |
| `subscriptionDetector.ts` | No overlap |
| `Dashboard` | No anomaly indicators on dashboard |
| `MerchantPage` | Merchant "new" badge handled by Story 7.3 separately |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| Detection time | <1s for typical runs | Simple merchant age query + transaction lookup |
| Import response | Not blocked | Detection is fire-and-forget async |
| Badge rendering | <16ms | Reuses existing AnomalyBadge component |
| Cleanup time | <1s | Batch remove stale flags |

New-merchant detection is significantly simpler than high-amount detection (no average calculation) — just age comparison + flag insertion.

### Edge Cases to Handle

1. **Merchant created exactly 30 days ago:** NOT flagged. Threshold is strictly < 30 days.
2. **Merchant created and immediately deleted:** If transactions lose their merchantId, flags should be cleaned or become stale.
3. **Transaction assigned to new merchant, then re-assigned to old merchant:** The new-merchant flag from the first assignment should be cleaned during the next detection run (merchant is now old).
4. **Multiple merchants created in same import session:** All new, all their transactions should be flagged.
5. **Dismissed flag on transaction, then merchant ages past 30 days:** Dismissed flag stays (audit trail), active flag gets cleaned.
6. **Transaction with both high-amount and new-merchant flags — dismiss one:** Only the dismissed type is marked, other stays active.
7. **Zero new merchants:** Detection returns `{ flagged: 0 }`, no toast, no errors.
8. **Merchant with no transactions:** New merchant exists but has no matched transactions — nothing to flag.
9. **Transaction re-imported (duplicate):** Duplicate detection (Story 2.6) should handle this before anomaly detection runs.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT duplicate anomaly data in React state — read `anomalyFlags` from transactions via `useLiveQuery`
- DO NOT create a separate Dexie table for new-merchant flags — flags live on transactions (9.3 infrastructure)
- DO NOT query all transactions to find new-merchant ones — query merchants first, then their transactions
- DO NOT re-implement `dismissAnomaly` — reuse the existing function from 9.3
- DO NOT re-implement `AnomalyBadge` from scratch — extend the existing component
- DO NOT confuse merchant-level "new" badge (Story 7.3) with transaction-level anomaly flag (this story)
- DO NOT hardcode 30 days in multiple places — use a constant: `const NEW_MERCHANT_THRESHOLD_DAYS = 30`
- DO NOT modify the merchant table or types — only read `createdAt`
- DO NOT remove dismissed flags during cleanup — they are audit trail

### Scope Boundaries

**In scope (this story):**
- `detectNewMerchantAnomalies` function in existing anomalyDetector service
- `cleanExpiredNewMerchantFlags` function for age-out cleanup
- Integration into import flow (after high-amount detection)
- Integration into merchant creation flow (R key)
- `AnomalyBadge` extension with new-merchant text, icon, tooltip
- `useAnomalies` hook extension with `newMerchantCount`
- Anomaly type filter extension (filter by `new-merchant` specifically)
- Combined toast when both anomaly types detected
- Tests for all new functionality

**Out of scope (future stories):**
- Potential duplicate anomaly detection (9.5) — flag type defined but detection not implemented
- Dashboard anomaly summary widget
- Anomaly notification sounds or alerts
- Configurable new-merchant threshold (currently fixed at 30 days)
- Per-merchant threshold customization
- Anomaly history/audit log view
- Bulk dismiss anomalies
- Anomaly badges on merchant detail pages

### Validation Checklist

Before marking complete:
- [ ] `detectNewMerchantAnomalies` correctly flags transactions from merchants < 30 days old
- [ ] Unmatched transactions (no merchantId) NOT flagged
- [ ] Already-flagged transactions not re-flagged
- [ ] Dismissed flags respected (not re-flagged)
- [ ] `cleanExpiredNewMerchantFlags` removes active flags from aged-out merchants
- [ ] Dismissed flags NOT removed by cleanup (audit trail preserved)
- [ ] Import triggers new-merchant detection (async, non-blocking)
- [ ] Merchant creation triggers new-merchant detection
- [ ] Combined toast when both high-amount and new-merchant flagged
- [ ] AnomalyBadge renders "New merchant" text with UserPlus icon
- [ ] Tooltip shows correct reason string
- [ ] Multiple flag types render correctly on same transaction
- [ ] Dismiss works independently per flag type
- [ ] Undo restores dismissed flag
- [ ] Filter by new-merchant shows only new-merchant flagged transactions
- [ ] Filter by all-anomalies includes new-merchant flags
- [ ] `useAnomalies` returns correct `newMerchantCount`
- [ ] `NEW_MERCHANT_THRESHOLD_DAYS` constant used (not hardcoded 30)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No unnecessary external dependencies added

### Project Structure Notes

- All changes are extensions to existing `src/features/anomalies/` module from Story 9.3
- No new files needed — only modifications to existing anomaly module files
- TransactionRow requires NO changes (AnomalyBadge already integrated generically in 9.3)
- No Dexie schema changes (anomalyFlags array and AnomalyType union already support new-merchant)
- Merchant `createdAt` field already exists from Story 7.3

### References

- [Source: epics.md#Epic-9-Story-9.4-Anomaly-Detection-New-Merchants]
- [Source: prd.md#FR40 - System can flag transactions from new/unknown merchants]
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
- [Story 9.3: Anomaly Detection High Amounts - AnomalyFlag type, AnomalyBadge, useAnomalies, dismissAnomaly, filter, import integration]
- [Story 7.3: First-Time Merchant Detection - merchant.createdAt field, 30-day threshold]
- [Story 4.3: Create Merchant with Rule - merchant creation trigger point]
- [Story 8.1: Mark Transaction as Refund - isRefund field context]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
