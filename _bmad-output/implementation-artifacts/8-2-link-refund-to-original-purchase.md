# Story 8.2: Link Refund to Original Purchase

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to create a link between a refund and its original purchase**,
So that **the relationship is tracked and visible (FR20)**.

## Acceptance Criteria

1. **Given** I have selected an original purchase in the Refund Link modal
   **When** I click "Link Refund" or press Enter
   **Then** the refund transaction is linked to the original purchase
   **And** both transactions are updated in the database
   **And** a toast confirms: "Refund linked to original purchase" with Undo

2. **Given** a refund is linked to a purchase
   **When** I view either transaction in the list
   **Then** I see a visual indicator (link icon or badge)
   **And** hovering shows tooltip: "Linked to refund on [date]" or "Linked to purchase on [date]"

3. **Given** I click on a linked transaction's link indicator
   **When** viewing the transaction row
   **Then** I can see the linked transaction details
   **And** I can navigate to the linked transaction (scroll + highlight)

4. **Given** I view a linked refund
   **When** looking at its category
   **Then** it inherits the category from the original purchase (if not manually set)
   **And** or shows "Refund" as a special category/indicator

5. **Given** I want to unlink a refund
   **When** I press `F` on an already-linked refund
   **Then** I see the current link details and an "Unlink" option
   **And** unlinking removes the relationship from both transactions
   **And** a toast confirms: "Refund unlinked" with Undo

6. **Given** a purchase already has a linked refund
   **When** I try to link another refund to it
   **Then** I see a warning: "This purchase already has a linked refund"
   **And** I can choose to replace the existing link or cancel

## Tasks / Subtasks

- [ ] Task 1: Enhance RefundLinkModal for linked-state awareness (AC: #5, #6)
  - [ ] Modify `src/features/transactions/components/RefundLinkModal/index.tsx`
  - [ ] Detect when source transaction already has `linkedTransactionId` set (is already linked)
  - [ ] When already linked, show "Linked State View":
    ```
    +-----------------------------------------------------------+
    | Link Refund                                           [x] |
    +-----------------------------------------------------------+
    | This refund is linked to:                                 |
    | Jan 15  AMZN*1234XYZ    -EUR29.99  Shopping               |
    |                                                           |
    | [Unlink Refund]              [Change Link]  [Close]       |
    +-----------------------------------------------------------+
    ```
  - [ ] "Unlink Refund" button calls `unlinkRefund` service → toast with Undo
  - [ ] "Change Link" button transitions to the standard search-and-select view
  - [ ] When selecting a purchase that already has `linkedTransactionId`:
    ```
    +-----------------------------------------------------------+
    | ⚠ This purchase already has a linked refund:              |
    | Jan 20  STORE*REFUND    +EUR31.50                         |
    |                                                           |
    | Linking will replace the existing link.                   |
    |                                                           |
    |                    [Cancel]  [Replace Link]               |
    +-----------------------------------------------------------+
    ```
  - [ ] "Replace Link" calls `replaceLinkRefund` service (unlinks old, links new)
  - [ ] Test: Modal shows linked-state view when source has linkedTransactionId
  - [ ] Test: "Unlink Refund" removes link from both transactions
  - [ ] Test: "Change Link" transitions to search view
  - [ ] Test: Warning shown when target purchase already linked
  - [ ] Test: "Replace Link" removes old link and creates new one

- [ ] Task 2: Add `unlinkRefund` and `replaceLinkRefund` service functions (AC: #5, #6)
  - [ ] Modify `src/features/transactions/services/refundService.ts`
  - [ ] `unlinkRefund` function:
    ```typescript
    export const unlinkRefund = async (
      refundTransactionId: string,
      purchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        await db.transactions.update(refundTransactionId, {
          isRefund: false,
          linkedTransactionId: null,
        })
        await db.transactions.update(purchaseTransactionId, {
          linkedTransactionId: null,
        })
      })
    }
    ```
  - [ ] `replaceLinkRefund` function:
    ```typescript
    export const replaceLinkRefund = async (
      refundTransactionId: string,
      oldPurchaseTransactionId: string,
      newPurchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        // Clear old purchase back-reference
        await db.transactions.update(oldPurchaseTransactionId, {
          linkedTransactionId: null,
        })
        // Update refund to point to new purchase
        await db.transactions.update(refundTransactionId, {
          isRefund: true,
          linkedTransactionId: newPurchaseTransactionId,
        })
        // Set new purchase back-reference
        await db.transactions.update(newPurchaseTransactionId, {
          linkedTransactionId: refundTransactionId,
        })
      })
    }
    ```
  - [ ] Both functions wrapped in Dexie transactions for atomicity
  - [ ] Modify `src/features/transactions/services/refundService.test.ts`
  - [ ] Test: `unlinkRefund` clears `isRefund` and `linkedTransactionId` on refund
  - [ ] Test: `unlinkRefund` clears `linkedTransactionId` on purchase
  - [ ] Test: `unlinkRefund` is atomic — both updates succeed or both fail
  - [ ] Test: `replaceLinkRefund` clears old purchase reference
  - [ ] Test: `replaceLinkRefund` creates new bidirectional link
  - [ ] Test: `replaceLinkRefund` is atomic — all three updates succeed or all fail

- [ ] Task 3: Add undo support for unlink and replace operations (AC: #5, #6)
  - [ ] Extend undo commands in existing undo system:
    ```typescript
    // For unlinkRefund — undo re-links both transactions
    const undoUnlinkRefund = async (
      refundTransactionId: string,
      purchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        await db.transactions.update(refundTransactionId, {
          isRefund: true,
          linkedTransactionId: purchaseTransactionId,
        })
        await db.transactions.update(purchaseTransactionId, {
          linkedTransactionId: refundTransactionId,
        })
      })
    }

    // For replaceLinkRefund — undo reverts to old link
    const undoReplaceLinkRefund = async (
      refundTransactionId: string,
      oldPurchaseTransactionId: string,
      newPurchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        await db.transactions.update(newPurchaseTransactionId, {
          linkedTransactionId: null,
        })
        await db.transactions.update(refundTransactionId, {
          linkedTransactionId: oldPurchaseTransactionId,
        })
        await db.transactions.update(oldPurchaseTransactionId, {
          linkedTransactionId: refundTransactionId,
        })
      })
    }
    ```
  - [ ] Toast messages:
    - Unlink: "Refund unlinked" with [Undo]
    - Replace: "Refund link updated" with [Undo]
  - [ ] 10-second undo window (consistent with existing pattern)
  - [ ] Test: Undo unlinkRefund restores bidirectional link
  - [ ] Test: Undo replaceLinkRefund reverts to old purchase link
  - [ ] Test: Toast appears with correct message and Undo button

- [ ] Task 4: Add navigation to linked transaction (AC: #3)
  - [ ] Modify `src/components/TransactionRow/index.tsx`
  - [ ] When link icon (`Link2`) is clicked on a linked transaction:
    - Look up the linked transaction by `linkedTransactionId`
    - If linked transaction is in the current visible list: scroll to it and highlight briefly (flash animation, 1.5s)
    - If linked transaction is in a different month/account view: navigate to its context (change route params) then scroll + highlight
  - [ ] Create `src/features/transactions/hooks/useNavigateToTransaction.ts`:
    ```typescript
    export const useNavigateToTransaction = () => {
      const navigate = useNavigate()

      const navigateToTransaction = async (transactionId: string) => {
        const transaction = await db.transactions.get(transactionId)
        if (!transaction) {
          toast({ title: 'Linked transaction not found', variant: 'destructive' })
          return
        }
        // Navigate to the transaction's account/month context if needed
        // Then scroll to the transaction and highlight
        navigate({
          to: '/transactions',
          search: { accountId: transaction.accountId, highlight: transactionId },
        })
      }

      return { navigateToTransaction }
    }
    ```
  - [ ] Create `src/features/transactions/hooks/useNavigateToTransaction.test.ts`
  - [ ] Add highlight animation CSS: brief flash (e.g., bg-accent/50 → transparent over 1.5s)
  - [ ] Handle dangling reference gracefully: if linked transaction was deleted, show toast "Linked transaction not found"
  - [ ] Test: Clicking link icon scrolls to linked transaction in same list
  - [ ] Test: Clicking link icon navigates to different view if transaction not in current list
  - [ ] Test: Brief highlight animation on navigated transaction
  - [ ] Test: Graceful handling when linked transaction doesn't exist

- [ ] Task 5: Add category inheritance for linked refunds (AC: #4)
  - [ ] Modify `src/features/transactions/services/refundService.ts`
  - [ ] In `linkRefund` function (from Story 8.1), add category inheritance logic:
    ```typescript
    export const linkRefund = async (
      refundTransactionId: string,
      purchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        const purchase = await db.transactions.get(purchaseTransactionId)
        const refund = await db.transactions.get(refundTransactionId)

        // Update refund transaction
        await db.transactions.update(refundTransactionId, {
          isRefund: true,
          linkedTransactionId: purchaseTransactionId,
          // Inherit category from purchase if refund has no category set
          ...(purchase?.categoryId && !refund?.categoryId
            ? { categoryId: purchase.categoryId }
            : {}),
        })
        // Update purchase transaction with back-reference
        await db.transactions.update(purchaseTransactionId, {
          linkedTransactionId: refundTransactionId,
        })
      })
    }
    ```
  - [ ] Same inheritance in `replaceLinkRefund`: inherit category from new purchase if refund has no manual category
  - [ ] Category inheritance is one-time at link creation — if user later manually changes category, it stays
  - [ ] If purchase has no category, refund keeps its existing category (no change)
  - [ ] Test: Linking sets refund categoryId to purchase categoryId when refund has no category
  - [ ] Test: Linking does NOT override refund categoryId when refund already has a category
  - [ ] Test: Linking when purchase has no category does not change refund category
  - [ ] Test: Replacing link inherits category from new purchase (if refund has no manual category)

- [ ] Task 6: Enhance link icon interaction on TransactionRow (AC: #2, #3)
  - [ ] Modify `src/components/TransactionRow/index.tsx`
  - [ ] Make the `Link2` icon clickable (not just decorative):
    ```typescript
    {transaction.linkedTransactionId && (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigateToTransaction(transaction.linkedTransactionId!)
            }}
            className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Navigate to linked ${transaction.isRefund ? 'purchase' : 'refund'}`}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {transaction.isRefund
            ? `Linked to purchase on ${formatDate(linkedTransaction?.date)}`
            : `Linked to refund on ${formatDate(linkedTransaction?.date)}`
          }
          <br />
          <span className="text-xs text-muted-foreground">Click to navigate</span>
        </TooltipContent>
      </Tooltip>
    )}
    ```
  - [ ] Fetch linked transaction data for tooltip (use `useLiveQuery` with `linkedTransactionId`)
  - [ ] Tooltip shows: direction ("Linked to purchase" / "Linked to refund"), date, amount, and "Click to navigate"
  - [ ] On purchase side (not a refund but has `linkedTransactionId`): show `Link2` icon with "Linked to refund on [date]"
  - [ ] Test: Link icon is clickable and calls navigateToTransaction
  - [ ] Test: Tooltip shows correct direction text based on isRefund flag
  - [ ] Test: Tooltip shows linked transaction date and amount
  - [ ] Test: Purchase side shows "Linked to refund" tooltip
  - [ ] Test: Click event doesn't propagate to row (stopPropagation)

- [ ] Task 7: Update useRefundLink hook for linked-state logic (AC: #5, #6)
  - [ ] Modify `src/features/transactions/hooks/useRefundLink.ts`
  - [ ] Add state for linked-state view vs search view:
    ```typescript
    type RefundModalView = 'linked' | 'search'
    ```
  - [ ] On modal open: check if `sourceTransaction.linkedTransactionId` is set
    - If linked → set view to `'linked'`, load linked transaction details
    - If not linked → set view to `'search'` (existing flow)
  - [ ] Add `linkedTransaction` state: fetched via `useLiveQuery` from `linkedTransactionId`
  - [ ] Add `handleUnlink` function: calls `unlinkRefund`, shows toast, closes modal
  - [ ] Add `handleChangeLink` function: switches view from `'linked'` to `'search'`
  - [ ] Add `handleReplaceLink` function: calls `replaceLinkRefund`, shows toast, closes modal
  - [ ] Add `targetHasExistingLink` check: when user selects a candidate, check if candidate has `linkedTransactionId`
  - [ ] If target has existing link, surface warning data (existing linked refund details)
  - [ ] Modify `src/features/transactions/hooks/useRefundLink.test.ts`
  - [ ] Test: Modal opens in 'linked' view when source has linkedTransactionId
  - [ ] Test: Modal opens in 'search' view when source has no linkedTransactionId
  - [ ] Test: handleUnlink calls unlinkRefund service and closes modal
  - [ ] Test: handleChangeLink switches view to 'search'
  - [ ] Test: targetHasExistingLink detected when candidate already linked
  - [ ] Test: handleReplaceLink calls replaceLinkRefund service

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Full link flow: Focus refund → F → select purchase → Link Refund → both transactions updated → toast with Undo
  - [ ] Unlink flow: Focus linked refund → F → see linked state → "Unlink Refund" → both transactions cleared → toast with Undo
  - [ ] Replace flow: Focus linked refund → F → "Change Link" → select new purchase → "Replace Link" → old cleared, new linked → toast with Undo
  - [ ] Replace with warning: Select purchase already linked → warning shown → "Replace Link" → old refund unlinked, new link created
  - [ ] Navigate flow: Click Link2 icon on linked transaction → scrolls to linked transaction → highlight animation
  - [ ] Navigate dangling: Click Link2 icon when linked transaction deleted → toast "Linked transaction not found"
  - [ ] Category inheritance: Link refund without category to categorized purchase → refund inherits category
  - [ ] Category preservation: Link refund with existing category to purchase → refund keeps its category
  - [ ] Undo unlink: Unlink → Undo → link restored bidirectionally
  - [ ] Undo replace: Replace link → Undo → old link restored, new purchase cleared
  - [ ] Keyboard: F on linked refund shows linked state, Esc closes

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Schema changes | None — reuses `isRefund` + `linkedTransactionId` from Story 8.1 | No new fields needed |
| Transaction wrapping | Dexie `db.transaction('rw', ...)` | Atomic updates for 3-way operations (replace) |
| Undo support | Command pattern with toast | 10-second undo window per UX spec |
| Navigation | TanStack Router `useNavigate` | Type-safe route navigation |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Services | camelCase file naming |
| Event handlers | `handle{Event}` naming |
| Props | `{ComponentName}Props` type |

### Data Model — No New Fields Required

**Source: [Story 8.1 — Data Model Changes]**

Story 8.1 already adds the required fields to the `transactions` table:
- `isRefund`: boolean (default: false) — marks whether the transaction is a refund
- `linkedTransactionId`: string | null (default: null) — bidirectional link between refund and purchase

**This story (8.2) reuses these exact fields.** No schema changes or migrations needed.

**Bidirectional linking convention (established in 8.1):**
- Refund: `isRefund: true`, `linkedTransactionId` → purchase ID
- Purchase: `isRefund: false` (unchanged), `linkedTransactionId` → refund ID
- Unlink: Both sides set `linkedTransactionId: null`, refund sets `isRefund: false`

### Amount Convention (From Story 8.1)

- **Negative amounts**: Expenses (money going out) — e.g., `-29.99`
- **Positive amounts**: Income/refunds (money coming in) — e.g., `+29.99`
- Refunds are positive, purchases are negative

### UX Design — Linked State in Modal

**Source: [ux-design-specification.md#Journey-4-Refund-Handling]**

Story 8.2 extends the RefundLinkModal from Story 8.1 to handle already-linked transactions:

**State machine for RefundLinkModal:**
1. **Not linked** (Story 8.1 flow) → Search → Select → Link → Toast
2. **Already linked** (Story 8.2 new) → Show link details → Unlink OR Change Link
3. **Change Link** (Story 8.2 new) → Search → Select → Check for conflicts → Replace → Toast
4. **Target conflict** (Story 8.2 new) → Warning → Replace OR Cancel

**Modal follows established patterns:**
- Uses shadcn `Dialog` (same as Story 8.1 RefundLinkModal)
- Toast with Undo (10-second window)
- Keyboard: Esc to close, Enter to confirm

### Keyboard Integration

**Source: [ux-design-specification.md#Keyboard-Patterns]**

No new keyboard shortcuts needed. The `F` key behavior from Story 8.1 is reused:
- `F` on an unlinked transaction → opens search view (Story 8.1)
- `F` on a linked refund → opens linked-state view (Story 8.2 enhancement)
- The keyboard handler in `useKeyboardNavigation.ts` remains unchanged

### Navigation Pattern

**Source: [architecture.md#Frontend-Architecture, TanStack Router]**

The "navigate to linked transaction" feature uses TanStack Router's `useNavigate`:
- If the linked transaction is in the current list view, scroll to it using a ref or `scrollIntoView`
- If it's in a different account/month context, navigate to the appropriate route with query params
- A `highlight` query parameter triggers a brief flash animation (CSS transition)
- Use `useLiveQuery` to fetch the linked transaction's data for tooltip display

### Category Inheritance Logic

**Source: [epics.md#Story-8.2-AC-4, prd.md#FR20]**

When a refund is linked to a purchase:
- If the refund has **no category** (`categoryId: null`), inherit the purchase's category
- If the refund **already has a category** (manually set), keep it — don't override
- This is a one-time operation at link creation, not a reactive sync
- If the purchase has no category either, no change is made
- On unlink, the inherited category stays (it's now considered "manually set" since user accepted the link)

### Previous Story Intelligence

**From Story 8.1 (Mark Transaction as Refund — F Key):**
- Established the `RefundLinkModal` component structure with search and selection
- Created `useRefundLink` hook managing modal state, candidates, search
- Created `refundService.ts` with `linkRefund` and `markAsOrphanRefund`
- Created undo commands for link and orphan operations
- Integrated F key into `useKeyboardNavigation.ts`
- Added `isRefund` badge and `Link2` icon to `TransactionRow`
- **Key pattern to follow:** The modal structure, toast pattern, and service functions are the foundation — extend, don't rewrite

**From Story 7.3 (First-Time Merchant Detection):**
- Pattern for conditional visual indicators in transaction rows (render null when not applicable)
- Data enrichment via `useLiveQuery` for supplementary data in rows

**From Story 4.3 (Create Merchant with Rule — R Key):**
- Modal → search/select → confirm → toast pattern
- Keyboard shortcut integration pattern

### File Structure for This Story

```
src/
+-- features/
|   +-- transactions/
|       +-- hooks/
|       |   +-- useRefundLink.ts (modify — add linked-state view logic)
|       |   +-- useRefundLink.test.ts (modify — add linked-state tests)
|       |   +-- useNavigateToTransaction.ts (new)
|       |   +-- useNavigateToTransaction.test.ts (new)
|       +-- services/
|       |   +-- refundService.ts (modify — add unlinkRefund, replaceLinkRefund, category inheritance)
|       |   +-- refundService.test.ts (modify — add unlink/replace tests)
|       +-- components/
|           +-- RefundLinkModal/
|               +-- index.tsx (modify — add linked-state view, warning, replace)
|               +-- RefundLinkModal.test.tsx (modify — add linked-state tests)
+-- components/
    +-- TransactionRow/
        +-- index.tsx (modify — make Link2 clickable, add navigation)
        +-- TransactionRow.test.tsx (modify — add click/navigation tests)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `linkRefund` | `src/features/transactions/services/refundService.ts` | Link two transactions (Story 8.1) |
| `markAsOrphanRefund` | `src/features/transactions/services/refundService.ts` | Orphan refund (Story 8.1) |
| `useRefundLink` | `src/features/transactions/hooks/useRefundLink.ts` | Modal state management (Story 8.1) |
| `RefundLinkModal` | `src/features/transactions/components/RefundLinkModal/index.tsx` | Modal UI (Story 8.1) |
| `Dialog` | `src/components/ui/dialog.tsx` | Modal component |
| `Badge` | `src/components/ui/badge.tsx` | Badge for "Refund" indicator |
| `Button` | `src/components/ui/button.tsx` | Action buttons |
| `Tooltip` | `src/components/ui/tooltip.tsx` | Link icon tooltip |
| `Toast` | existing toast system | Undo toast |
| `cn` | `@/lib/utils` | Conditional class names |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount formatting |
| `formatDate` | `src/lib/utils/formatDate.ts` | Date formatting |
| `Link2` icon | `lucide-react` | Link indicator icon |
| `useNavigate` | `@tanstack/react-router` | Route navigation |
| Keyboard context | `src/context/KeyboardContext.tsx` | Keyboard event system |
| Undo system | existing undo pattern | Command pattern undo |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `RefundLinkModal/index.tsx` | Add linked-state view, warning, replace flow | Medium — new conditional UI paths |
| `useRefundLink.ts` | Add linked/search view state, unlink/replace handlers | Medium — extends existing hook |
| `refundService.ts` | Add `unlinkRefund`, `replaceLinkRefund`, category inheritance | Low — new functions, minor linkRefund edit |
| `TransactionRow/index.tsx` | Make Link2 icon clickable, add navigation | Low — enhances existing indicator |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `useKeyboardNavigation.ts` | F key handler already works — no changes needed |
| `MerchantAssignmentModal` | Separate concern (R key) |
| `CategoryPicker` | Separate concern (C key) |
| Dashboard components | Net spending comes in Story 8.3 |
| `db/schema.ts` | Schema fields already added in Story 8.1 |
| `db/migrations.ts` | No new migrations needed |
| `transaction.types.ts` | No new fields |
| `transaction.schema.ts` | No new Zod fields |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Impact of This Story |
|--------|--------|---------------------|
| Modal view switch | <50ms | Pure React state toggle, no data fetch |
| Unlink operation | <50ms | Two Dexie updates in single transaction |
| Replace operation | <50ms | Three Dexie updates in single transaction |
| Navigate to linked | <200ms | Route change + scroll + highlight |
| Tooltip data fetch | <10ms | Single Dexie .get() by ID |
| Transaction row render | No regression | Additional click handler is O(1) |

### Edge Cases to Handle

1. **Linked transaction deleted:** If a linked transaction has been deleted (dangling `linkedTransactionId`), show toast "Linked transaction not found" when attempting to navigate. For tooltip, show "Linked transaction unavailable".
2. **Replace link when old purchase was deleted:** If the old purchase in a replace operation was already deleted, the `unlinkRefund` part of replace gracefully handles the missing record (Dexie update on non-existent ID is a no-op).
3. **Rapid unlink/relink:** If user unlinks and quickly re-links before undo timer expires, the undo should only undo the most recent action. Each toast replaces the previous one.
4. **Category inheritance on replace:** When replacing a link, if the refund's category was inherited from the old purchase (and user hasn't changed it), should it re-inherit from the new purchase? Decision: Yes — if `categoryId` matches old purchase's category, update to new purchase's category.
5. **Self-linking:** Already prevented in Story 8.1's `linkRefund` service — validate remains.
6. **Navigate to transaction in different account:** The navigation hook should handle cross-account navigation by updating route params.
7. **Multiple toasts:** If user performs multiple actions rapidly, use the existing toast queue system. Each action shows its own toast with its own undo.

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT create new schema fields or migrations — Story 8.1 already added everything needed
- DO NOT duplicate linked transaction data in React state — use `useLiveQuery` to fetch linked transaction details
- DO NOT create a separate "unlink" modal — reuse the RefundLinkModal in linked-state mode
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT modify dashboard components — net spending is Story 8.3
- DO NOT block the UI during unlink/replace — operations are fast (<50ms)
- DO NOT add a date library — use native Date formatting via existing `formatDate` util
- DO NOT reactively sync category between linked transactions — inheritance is one-time at link creation

### Scope Boundaries

**In scope (this story):**
- Linked-state view in RefundLinkModal (show current link, unlink, change link)
- `unlinkRefund` service function with undo
- `replaceLinkRefund` service function with undo
- Warning when target purchase already has a linked refund
- Navigation to linked transaction (click Link2 icon → scroll + highlight)
- Category inheritance from purchase to refund at link time
- Dangling reference handling (graceful error for deleted linked transactions)

**Out of scope (future stories):**
- Net spending calculation in dashboard (Story 8.3)
- Excluding linked refunds from category totals (Story 8.3)
- Gross vs net toggle on dashboard (Story 8.3)
- Batch refund linking (not planned)
- Automatic refund detection (not planned)

### Validation Checklist

Before marking complete:
- [ ] RefundLinkModal shows linked-state view when source has linkedTransactionId
- [ ] "Unlink Refund" removes bidirectional link
- [ ] "Change Link" transitions to search view
- [ ] Warning shown when target purchase already linked
- [ ] "Replace Link" removes old link and creates new bidirectional link
- [ ] `unlinkRefund` service function works atomically
- [ ] `replaceLinkRefund` service function works atomically (3 updates)
- [ ] Undo restores previous state for unlink
- [ ] Undo restores previous state for replace
- [ ] Toast messages appear with correct text and Undo button
- [ ] Clicking Link2 icon navigates to linked transaction
- [ ] Navigation scrolls to and highlights target transaction
- [ ] Dangling reference shows "Linked transaction not found" toast
- [ ] Category inherited from purchase when refund has no category
- [ ] Category NOT overridden when refund already has category
- [ ] F key on linked refund opens linked-state view
- [ ] F key on unlinked transaction opens search view (Story 8.1 behavior preserved)
- [ ] No schema changes or new migrations
- [ ] No performance regression in transaction list
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No new external dependencies

### Project Structure Notes

- Alignment with unified project structure: All modifications are within `src/features/transactions/` and `src/components/TransactionRow/` — matching the architecture's feature-based organization
- Only one new file created: `useNavigateToTransaction.ts` (+ test) — everything else modifies Story 8.1's existing files
- No new shared components or utilities needed

### References

- [Source: epics.md#Epic-8-Story-8.2-Link-Refund-to-Original-Purchase]
- [Source: prd.md#FR20 - User can link a refund transaction to its original purchase]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, transaction data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Core-Architectural-Decisions - Command pattern undo]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, shadcn/ui, TanStack Router]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Journey-4-Refund-Handling - Refund linking flow]
- [Source: ux-design-specification.md#Keyboard-Patterns - F key quick action]
- [Source: ux-design-specification.md#Modal-Patterns - Dialog structure and behavior]
- [Source: ux-design-specification.md#Feedback-Patterns - Toast with undo]
- [Story 8.1: Mark Transaction as Refund (F Key) - Foundation: schema, modal, services, hook, keyboard, visual indicators]
- [Story 7.3: First-Time Merchant Detection - Visual indicator patterns, conditional rendering]
- [Story 4.3: Create Merchant with Rule - Modal search/select/confirm pattern]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
