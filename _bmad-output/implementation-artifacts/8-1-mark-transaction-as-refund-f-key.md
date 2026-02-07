# Story 8.1: Mark Transaction as Refund (F Key)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to mark a transaction as a refund and start linking it to an original purchase**,
So that **I can accurately track my net spending (FR19)**.

## Acceptance Criteria

1. **Given** I have focused a transaction (positive amount, likely a refund)
   **When** I press `F`
   **Then** the Refund Link modal opens
   **And** the transaction details are shown at the top
   **And** the modal title is "Link Refund"

2. **Given** the Refund Link modal is open
   **When** I view the interface
   **Then** I see a search field to find the original purchase
   **And** the search is pre-filtered by similar amount (+/-10%)
   **And** suggestions show transactions from the same merchant if available

3. **Given** I'm searching for the original purchase
   **When** I type in the search field
   **Then** results filter by merchant name and amount
   **And** results are sorted by date (most recent first)
   **And** results show: date, merchant, amount, category

4. **Given** I find the original purchase
   **When** I select it from the results
   **Then** it's highlighted as the selected link target
   **And** I see a preview: "Link EUR50 refund to EUR50 purchase from Jan 15"

5. **Given** no matching purchase is found
   **When** the search returns no results
   **Then** I see "No matching purchases found"
   **And** I can broaden my search or cancel
   **And** I can still mark as refund without linking (orphan refund)

6. **Given** I press `F` on a negative amount (expense)
   **When** the modal opens
   **Then** a note suggests this looks like an expense, not a refund
   **And** I can proceed anyway if it's actually a refund

## Tasks / Subtasks

- [ ] Task 1: Add `isRefund` and `linkedRefundId` fields to transaction schema (AC: all)
  - [ ] Modify `src/types/transaction.types.ts` — add fields to the `Transaction` type:
    ```typescript
    type Transaction = {
      // ...existing fields
      isRefund: boolean          // Whether this transaction is marked as a refund
      linkedTransactionId: string | null  // ID of linked purchase (or linked refund)
    }
    ```
  - [ ] Modify `src/lib/db/schema.ts` — add indexes for the new fields:
    - Add `isRefund` to the transactions table index (for filtering refund transactions)
    - Add `linkedTransactionId` as indexed field (for lookup of linked pairs)
  - [ ] Modify `src/lib/schemas/transaction.schema.ts` — add Zod fields:
    ```typescript
    isRefund: z.boolean().default(false),
    linkedTransactionId: z.string().nullable().default(null),
    ```
  - [ ] Add Dexie schema migration (version bump) to add the new fields with defaults:
    - All existing transactions get `isRefund: false` and `linkedTransactionId: null`
    - Modify `src/lib/db/migrations.ts` accordingly
  - [ ] Test: New transaction has `isRefund: false` by default
  - [ ] Test: New transaction has `linkedTransactionId: null` by default
  - [ ] Test: Can set `isRefund: true` and persist
  - [ ] Test: Can set `linkedTransactionId` to another transaction's ID and persist

- [ ] Task 2: Create `useRefundLink` hook for modal state and logic (AC: #1, #2, #3, #5, #6)
  - [ ] Create `src/features/transactions/hooks/useRefundLink.ts`
  - [ ] Create `src/features/transactions/hooks/useRefundLink.test.ts`
  - [ ] Hook manages:
    - Modal open/close state
    - The "source" transaction (the one the user pressed F on)
    - Search query state
    - Candidate transactions (pre-filtered by similar amount +/-10%)
    - Selected target transaction
    - Link confirmation logic
  - [ ] Pre-filtering logic on modal open:
    ```typescript
    const sourceAmount = Math.abs(sourceTransaction.amount)
    const tolerance = sourceAmount * 0.1
    const candidates = useLiveQuery(async () => {
      const allTxns = await db.transactions
        .where('amount')
        .between(-(sourceAmount + tolerance), -(sourceAmount - tolerance))
        .toArray()
      // Filter out the source transaction itself
      // Filter out transactions already linked
      // Sort by date descending (most recent first)
      // Prioritize same merchant if available
      return allTxns
    }, [sourceTransaction])
    ```
  - [ ] Search filtering: filter candidates by merchant name (case-insensitive contains)
  - [ ] Amount direction awareness:
    - Refunds are typically positive amounts (money coming back)
    - Purchases are typically negative amounts (money going out)
    - Pre-filter searches for opposite-sign transactions with similar absolute amount
    - If `F` pressed on a negative amount, show informational note (AC #6)
  - [ ] Orphan refund support: allow marking as refund without selecting a linked purchase (AC #5)
  - [ ] Test: Opens with correct source transaction
  - [ ] Test: Pre-filters candidates by +/-10% amount (opposite sign)
  - [ ] Test: Prioritizes same-merchant transactions
  - [ ] Test: Search filters candidates by merchant name
  - [ ] Test: Handles no candidates found (empty results)
  - [ ] Test: Detects negative amount and flags as likely expense

- [ ] Task 3: Create `RefundLinkModal` component (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Create `src/features/transactions/components/RefundLinkModal/index.tsx`
  - [ ] Create `src/features/transactions/components/RefundLinkModal/RefundLinkModal.test.tsx`
  - [ ] Modal structure using shadcn `Dialog`:
    ```
    +-----------------------------------------------------------+
    | Link Refund                                           [x] |
    +-----------------------------------------------------------+
    | Refund Transaction:                                       |
    | Jan 18   AMZN*REFUND1234   +EUR29.99                      |
    |                                                           |
    | [!] Note: This looks like an expense, not a refund.       |
    |     (only shown for negative amounts, AC #6)              |
    |                                                           |
    | Find Original Purchase:                                   |
    | [Search by merchant or amount...____________]             |
    |                                                           |
    | Suggested matches (similar amount +/-10%):                |
    | --------------------------------------------------------- |
    | (*) Jan 15  AMZN*1234XYZ    -EUR29.99  Shopping          |
    | ( ) Jan 10  AMZN*5678ABC    -EUR31.50  Shopping          |
    | ( ) Jan 05  AMAZON.COM      -EUR28.00  Shopping          |
    | --------------------------------------------------------- |
    |                                                           |
    | Preview: Link EUR29.99 refund to EUR29.99 purchase        |
    |          from Jan 15                                      |
    |                                                           |
    | No matching purchase?                                     |
    | [Mark as refund without linking]                           |
    |                                                           |
    |              [Cancel]  [Link Refund Enter]                |
    +-----------------------------------------------------------+
    ```
  - [ ] Props type:
    ```typescript
    type RefundLinkModalProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      sourceTransaction: Transaction
      onConfirmLink: (targetTransactionId: string) => void
      onConfirmOrphan: () => void  // Mark as refund without linking
    }
    ```
  - [ ] Transaction display section: Show source transaction details at top (date, raw merchant string, amount with + sign for positive)
  - [ ] Expense warning: When source transaction amount is negative, show info note (AC #6)
  - [ ] Search input: Filters the candidate list by merchant string (case-insensitive)
  - [ ] Candidate list: Scrollable list of matching transactions, each with radio button for selection
  - [ ] Selected preview: When a candidate is selected, show a summary line: "Link EUR{refundAmount} refund to EUR{purchaseAmount} purchase from {date}"
  - [ ] Empty state: "No matching purchases found" with option to broaden search or mark as orphan refund (AC #5)
  - [ ] Orphan refund button: "Mark as refund without linking" — calls `onConfirmOrphan`
  - [ ] Footer actions: [Cancel] and [Link Refund] (or [Mark as Refund] if orphan)
  - [ ] Keyboard navigation:
    - `Tab` between sections
    - Arrow keys to navigate candidate list
    - `Enter` to confirm
    - `Esc` to close
  - [ ] Focus management: Focus search input on modal open
  - [ ] Accessibility: `aria-labelledby` on dialog, live region for match count, radio group for candidate selection
  - [ ] Test: Renders with source transaction details
  - [ ] Test: Shows expense warning for negative amounts
  - [ ] Test: Displays candidate transactions sorted by date
  - [ ] Test: Search input filters candidates
  - [ ] Test: Selecting a candidate shows preview text
  - [ ] Test: "Link Refund" calls onConfirmLink with selected ID
  - [ ] Test: "Mark as refund without linking" calls onConfirmOrphan
  - [ ] Test: Empty state shown when no candidates match
  - [ ] Test: Esc closes modal

- [ ] Task 4: Create refund link service functions (AC: #4, #5)
  - [ ] Create `src/features/transactions/services/refundService.ts`
  - [ ] Create `src/features/transactions/services/refundService.test.ts`
  - [ ] `linkRefund` function:
    ```typescript
    export const linkRefund = async (
      refundTransactionId: string,
      purchaseTransactionId: string
    ): Promise<void> => {
      await db.transaction('rw', db.transactions, async () => {
        // Update refund transaction
        await db.transactions.update(refundTransactionId, {
          isRefund: true,
          linkedTransactionId: purchaseTransactionId,
        })
        // Update purchase transaction with back-reference
        await db.transactions.update(purchaseTransactionId, {
          linkedTransactionId: refundTransactionId,
        })
      })
    }
    ```
  - [ ] `markAsOrphanRefund` function:
    ```typescript
    export const markAsOrphanRefund = async (
      transactionId: string
    ): Promise<void> => {
      await db.transactions.update(transactionId, {
        isRefund: true,
        linkedTransactionId: null,  // Orphan — no linked purchase
      })
    }
    ```
  - [ ] Both functions wrapped in Dexie transactions for atomicity
  - [ ] Test: `linkRefund` sets `isRefund: true` and `linkedTransactionId` on refund transaction
  - [ ] Test: `linkRefund` sets `linkedTransactionId` on purchase transaction (back-reference)
  - [ ] Test: `markAsOrphanRefund` sets `isRefund: true` with null `linkedTransactionId`
  - [ ] Test: `linkRefund` is atomic — both updates succeed or both fail
  - [ ] Test: Cannot link a transaction to itself

- [ ] Task 5: Add undo support for refund link actions (AC: #4, #5)
  - [ ] Create undo commands for refund actions in the existing undo system:
    ```typescript
    // For linkRefund — undo reverses both updates
    const undoLinkRefund = async (
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
  - [ ] For `markAsOrphanRefund` undo:
    ```typescript
    const undoOrphanRefund = async (transactionId: string): Promise<void> => {
      await db.transactions.update(transactionId, {
        isRefund: false,
      })
    }
    ```
  - [ ] Integrate with existing toast undo pattern (10-second window)
  - [ ] Toast messages:
    - Link: "Refund linked to original purchase" with [Undo]
    - Orphan: "Marked as refund" with [Undo]
  - [ ] Test: Undo linkRefund restores both transactions
  - [ ] Test: Undo orphanRefund restores isRefund to false
  - [ ] Test: Toast appears with correct message

- [ ] Task 6: Integrate F key into keyboard navigation system (AC: #1)
  - [ ] Modify `src/hooks/useKeyboardNavigation.ts` (or equivalent keyboard context)
  - [ ] Add `F` key handler when a transaction is focused:
    ```typescript
    case 'f':
    case 'F':
      if (focusedTransaction && !isInputFocused) {
        openRefundLinkModal(focusedTransaction)
      }
      break
    ```
  - [ ] Ensure `F` key is disabled when:
    - No transaction is focused
    - User is typing in an input field
    - A modal is already open
  - [ ] Add `F` key to the keyboard shortcut hints in footer: `[R] Assign  [C] Category  [F] Refund`
  - [ ] Add `F` key action to command palette under Actions section
  - [ ] Test: Pressing F opens RefundLinkModal when transaction focused
  - [ ] Test: Pressing F does nothing when no transaction focused
  - [ ] Test: Pressing F does nothing when typing in input
  - [ ] Test: F appears in keyboard shortcut footer hints

- [ ] Task 7: Add refund visual indicator to transaction rows (AC: relates to FR19 visibility)
  - [ ] Modify `src/components/TransactionRow/index.tsx`
  - [ ] When `transaction.isRefund` is true, show a visual indicator:
    - Small "Refund" badge using shadcn `Badge` with a distinct style (e.g., green/success outline for money coming back)
    - Position: After the amount, or after the merchant name
    ```typescript
    {transaction.isRefund && (
      <Badge variant="outline" className="border-green-500/50 bg-green-500/10 text-green-500 text-[10px] px-1 py-0">
        Refund
      </Badge>
    )}
    ```
  - [ ] When `transaction.linkedTransactionId` is set, show a link icon (Lucide `Link2` icon) with tooltip:
    - Tooltip: "Linked to purchase on {date}" or "Linked to refund on {date}"
    - Icon is subtle, info color
  - [ ] Orphan refunds (isRefund but no linkedTransactionId): Show "Refund" badge without link icon
  - [ ] Test: Shows "Refund" badge when isRefund is true
  - [ ] Test: Shows link icon when linkedTransactionId is set
  - [ ] Test: Shows badge but no link icon for orphan refunds
  - [ ] Test: No indicators when isRefund is false

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Full flow test: Focus transaction → press F → modal opens → select candidate → confirm → both transactions updated
  - [ ] Orphan flow: Focus transaction → press F → no matches → "Mark as refund without linking" → transaction updated
  - [ ] Undo flow: Link refund → undo via toast → both transactions restored
  - [ ] Expense warning: Focus negative-amount transaction → press F → warning displayed
  - [ ] Search: Open modal → type in search → candidates filter correctly
  - [ ] Keyboard: F key only works when transaction focused, not in inputs
  - [ ] Visual: Refund badge appears on refund transactions after linking
  - [ ] Data integrity: Linked transactions reference each other bidirectionally

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Schema changes | Add `isRefund` + `linkedTransactionId` to transactions | Minimal schema addition, migration required |
| Transaction wrapping | Dexie `db.transaction('rw', ...)` | Atomic updates for bidirectional linking |
| Undo support | Command pattern with toast | 10-second undo window per UX spec |

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

### Data Model Changes

**Source: [architecture.md#Data-Model], [epics.md#Epic-8-Story-8.1]**

The `transactions` table currently has:
- `id`: primary key
- `accountId`: FK to accounts
- `date`: Date
- `amount`: number (negative = expense, positive = income/refund)
- `rawMerchantString`: string
- `merchantId`: string | null
- `categoryId`: string | null
- `createdAt`: Date

**New fields to add:**
- `isRefund`: boolean (default: false) — marks whether the transaction is a refund
- `linkedTransactionId`: string | null (default: null) — bidirectional link between refund and purchase

**Why bidirectional linking:**
- The purchase needs to know it has a linked refund (for Story 8.2 display and Story 8.3 net calculation)
- The refund needs to know what it's linked to (for display and navigation)
- Both transactions store the other's ID in `linkedTransactionId`

**Migration strategy:**
- Bump Dexie database version
- Existing transactions get defaults: `isRefund: false`, `linkedTransactionId: null`
- Add index on `isRefund` (for future filtering of refund transactions)
- Add index on `linkedTransactionId` (for lookup of linked pairs)

### Amount Convention

Transactions follow this sign convention:
- **Negative amounts**: Expenses (money going out) — e.g., `-29.99`
- **Positive amounts**: Income/refunds (money coming in) — e.g., `+29.99`

When searching for the original purchase of a refund:
- The refund is typically positive (e.g., `+29.99`)
- The original purchase is typically negative (e.g., `-29.99`)
- Pre-filter: Search for transactions where `Math.abs(amount)` is within +/-10% of `Math.abs(refundAmount)` AND sign is opposite

**Edge case (AC #6):** If user presses F on a negative-amount transaction, it's likely an expense, not a refund. Show an informational note but allow proceeding.

### UX Design — Refund Link Modal

**Source: [ux-design-specification.md#Journey-4-Refund-Handling]**

The UX spec defines Journey 4:
1. See refund → Press F → Link to original purchase → Search by amount/merchant → Select original → Link created → Net spend calculated → Dashboard accurate

**Modal design follows established patterns:**
- Uses shadcn `Dialog` (same as Merchant Assignment Modal)
- Search input with instant filtering (<100ms)
- Candidate list with radio selection
- Preview of the link before confirming
- Undo via toast (10-second window)
- Keyboard: Tab between sections, arrows in list, Enter to confirm, Esc to close

**Key differences from Merchant Assignment Modal:**
- No pattern/regex creation — this is a search-and-select flow
- Bidirectional: both transactions are updated
- Amount-based pre-filtering (not pattern-based)
- Simpler: no rule creation, no cascade animation

### Keyboard Integration

**Source: [ux-design-specification.md#Keyboard-Patterns]**

F key is defined as a quick action alongside R and C:

| Shortcut | Action |
|----------|--------|
| `R` | Assign to merchant |
| `C` | Quick category assign |
| `F` | Link refund |

These all share the same context: user has focused a transaction with J/K.

**Integration pattern:** Follow the same approach used for R key (Merchant Assignment Modal) and C key (Quick Category Picker). The keyboard handler checks for focused transaction and no active input, then opens the appropriate modal.

**Footer hints update:** `[R] Assign  [C] Category  [F] Refund`

### Previous Story Intelligence

**From Story 7.3 (First-Time Merchant Detection) — most recent story:**
- Established pattern for adding visual indicators to transaction rows (badge component)
- Data enrichment in transaction list via map lookup (used for merchantCreatedAt)
- Self-contained components that return null when not applicable
- Co-located test files, named exports, type-based props

**From Story 7.2 (Merchant Detail Page):**
- Modal patterns with keyboard support (Dialog component)
- Stats cards pattern for merchant stats display

**From Story 4.3 (Create Merchant with Rule — R Key):**
- Keyboard shortcut → modal → search/select → confirm → toast pattern
- This is the closest pattern to the refund link flow
- Merchant Assignment Modal is the structural template for RefundLinkModal

**From Story 5.5 (Focus Mode Subscriptions Placeholder — S Key):**
- Keyboard binding registration pattern for focus mode keys
- Placeholder pattern when future functionality is needed

### File Structure for This Story

```
src/
+-- types/
|   +-- transaction.types.ts (modify -- add isRefund, linkedTransactionId)
+-- lib/
|   +-- db/
|   |   +-- schema.ts (modify -- add indexes)
|   |   +-- migrations.ts (modify -- add migration)
|   +-- schemas/
|       +-- transaction.schema.ts (modify -- add Zod fields)
+-- features/
|   +-- transactions/
|       +-- hooks/
|       |   +-- useRefundLink.ts (new)
|       |   +-- useRefundLink.test.ts (new)
|       +-- services/
|       |   +-- refundService.ts (new)
|       |   +-- refundService.test.ts (new)
|       +-- components/
|           +-- RefundLinkModal/
|               +-- index.tsx (new)
|               +-- RefundLinkModal.test.tsx (new)
+-- hooks/
|   +-- useKeyboardNavigation.ts (modify -- add F key handler)
+-- components/
    +-- TransactionRow/
        +-- index.tsx (modify -- add refund badge + link icon)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `useLiveQuery` | `dexie-react-hooks` | Reactive queries |
| `Dialog` | `src/components/ui/dialog.tsx` | Modal component |
| `Badge` | `src/components/ui/badge.tsx` | Badge for "Refund" indicator |
| `Button` | `src/components/ui/button.tsx` | Action buttons |
| `Tooltip` | `src/components/ui/tooltip.tsx` | Link icon tooltip |
| `Toast` | `src/components/ui/toast.tsx` | Undo toast |
| `cn` | `@/lib/utils` | Conditional class names |
| `formatCurrency` | `src/lib/utils/formatCurrency.ts` | Amount formatting |
| `formatDate` | `src/lib/utils/formatDate.ts` | Date formatting |
| `Link2` icon | `lucide-react` | Link indicator icon |
| Keyboard context | `src/context/KeyboardContext.tsx` | Keyboard event system |
| Undo system | `src/context/UndoContext.tsx` or `src/hooks/useUndo.ts` | Command pattern undo |

### Existing Components to Modify (Minimal Changes)

| Component | Change | Risk |
|-----------|--------|------|
| `transaction.types.ts` | Add 2 fields | Low |
| `transaction.schema.ts` | Add 2 Zod fields | Low |
| `db/schema.ts` | Add 2 indexes | Low |
| `db/migrations.ts` | Add migration version | Low |
| `useKeyboardNavigation.ts` | Add F key case | Low |
| `TransactionRow/index.tsx` | Add refund badge + link icon | Low |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `MerchantAssignmentModal` | Separate concern (R key) |
| `CategoryPicker` | Separate concern (C key) |
| Dashboard components | Net spending comes in Story 8.3 |
| Import components | Refund detection not part of import |
| `CommandPalette` | Only add F action to palette actions list |
| Sidebar | No refund-related navigation needed |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Impact of This Story |
|--------|--------|---------------------|
| Modal open | <100ms | Dialog opens instantly; candidate pre-filtering is async via useLiveQuery |
| Search filtering | <100ms | In-memory filter of pre-loaded candidates |
| Link operation | <50ms | Two Dexie updates in single transaction |
| Transaction row render | No regression | isRefund check is O(1) boolean read |
| Undo operation | <50ms | Two Dexie updates to restore |

**Candidate pre-filtering:** The amount-range query (`db.transactions.where('amount').between(...)`) uses Dexie indexes. For 10k transactions this is <10ms. The in-memory filtering by merchant string is O(n) on the pre-filtered set (typically <100 candidates), well under 1ms.

### Edge Cases to Handle

1. **Transaction is already a refund:** If F pressed on a transaction where `isRefund: true`, show current link status and allow unlinking (this is Story 8.2 scope — for now, just open the modal normally)
2. **Self-linking:** Prevent linking a transaction to itself — validate in `linkRefund` service
3. **Transaction already linked:** If the selected purchase already has `linkedTransactionId`, warn user: "This purchase already has a linked refund" (Story 8.2 handles full unlink/relink — for now, prevent double-linking)
4. **Zero-amount transactions:** Skip pre-filtering if amount is 0 — show all candidates
5. **No transactions in database:** Modal opens but shows empty state immediately
6. **Multiple refunds for same purchase:** Future story (8.2) handles replacement — this story prevents the scenario with a warning
7. **Deleted transactions:** If a linked transaction is later deleted, the `linkedTransactionId` becomes a dangling reference — handle gracefully (show "Linked transaction not found")

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT store refund links in a separate table — use `linkedTransactionId` on the transactions table
- DO NOT duplicate Dexie data in React state — use `useLiveQuery` for candidates
- DO NOT use `interface` — use `type`
- DO NOT use default exports — use named exports
- DO NOT create `__tests__/` directories — co-locate tests
- DO NOT modify dashboard components — net spending is Story 8.3
- DO NOT add full unlink/relink flow — that's Story 8.2
- DO NOT use a date library (moment/date-fns) — use native Date for formatting
- DO NOT fire individual queries per candidate — pre-load with a single indexed query
- DO NOT block the UI during linking — operation is fast, but use optimistic update if needed

### Scope Boundaries

**In scope (this story):**
- F key keyboard shortcut to open modal
- Refund Link modal with search and selection
- `linkRefund` service (bidirectional)
- `markAsOrphanRefund` service
- Undo for both operations
- Visual indicators on transaction rows (Refund badge, link icon)
- Expense warning for negative amounts

**Out of scope (future stories):**
- Unlinking a refund (Story 8.2)
- Replacing a link with a different transaction (Story 8.2)
- Navigation from linked transaction to its pair (Story 8.2)
- Net spending calculation in dashboard (Story 8.3)
- Excluding linked refunds from category totals (Story 8.3)
- Gross vs net toggle on dashboard (Story 8.3)

### Validation Checklist

Before marking complete:
- [ ] `isRefund` and `linkedTransactionId` fields added to transaction type, schema, and Zod
- [ ] Dexie migration adds new fields with correct defaults
- [ ] `useRefundLink` hook manages modal state and candidate pre-filtering
- [ ] `RefundLinkModal` renders correctly with source transaction details
- [ ] Search filters candidates by merchant name
- [ ] Candidates pre-filtered by +/-10% amount (opposite sign)
- [ ] Selecting a candidate shows preview text
- [ ] "Link Refund" creates bidirectional link in database
- [ ] "Mark as refund without linking" sets isRefund without linking
- [ ] Undo restores both transactions for linked refund
- [ ] Undo restores isRefund for orphan refund
- [ ] Toast messages appear with correct text and undo button
- [ ] F key opens modal when transaction focused
- [ ] F key does nothing when no transaction focused or in input
- [ ] F key hint shows in keyboard shortcut footer
- [ ] Expense warning shown when F pressed on negative amount
- [ ] "Refund" badge appears on refund transactions
- [ ] Link icon appears on linked transactions
- [ ] Self-linking prevented
- [ ] Double-linking warning shown
- [ ] No performance regression in transaction list
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No new external dependencies

### References

- [Source: epics.md#Epic-8-Story-8.1-Mark-Transaction-as-Refund-F-Key]
- [Source: prd.md#FR19 - User can mark a transaction as a refund]
- [Source: prd.md#FR20 - User can link a refund transaction to its original purchase]
- [Source: architecture.md#Data-Architecture - Dexie useLiveQuery, transaction data model]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Core-Architectural-Decisions - Command pattern undo]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, shadcn/ui]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Performance-Requirements - <100ms UI response]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Journey-4-Refund-Handling - F key flow]
- [Source: ux-design-specification.md#Keyboard-Patterns - F key quick action]
- [Source: ux-design-specification.md#Modal-Patterns - Dialog structure and behavior]
- [Source: ux-design-specification.md#Feedback-Patterns - Toast with undo]
- [Source: ux-design-specification.md#Component-Density - 48px row height]
- [Story 7.3: First-Time Merchant Detection - Badge component pattern, data enrichment strategy]
- [Story 7.2: Merchant Detail Page - Modal and keyboard integration patterns]
- [Story 4.3: Create Merchant with Rule - R key modal pattern (structural template)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
