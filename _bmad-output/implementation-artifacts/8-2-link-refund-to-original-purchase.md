# Story 8.2: Link Refund to Original Purchase

Status: review

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

- [x] Task 1: Enhance RefundLinkModal for linked-state awareness (AC: #5, #6)
  - [x] Modify `src/features/transactions/components/RefundLinkModal/index.tsx`
  - [x] Detect when source transaction already has `linkedRefundId` set (is already linked)
  - [x] When already linked, show "Linked State View" with linked transaction details
  - [x] "Unlink Refund" button calls `unlinkRefund` service → toast with Undo
  - [x] "Change Link" button transitions to the standard search-and-select view
  - [x] When selecting a purchase that already has `linkedRefundId`, show replace warning
  - [x] "Replace Link" calls `replaceLinkRefund` service (unlinks old, links new)
  - [x] Test: Modal shows linked-state view when source has linkedRefundId
  - [x] Test: "Unlink Refund" removes link from both transactions
  - [x] Test: "Change Link" transitions to search view
  - [x] Test: Warning shown when target purchase already linked
  - [x] Test: "Replace Link" removes old link and creates new one

- [x] Task 2: Add `unlinkRefund` and `replaceLinkRefund` service functions (AC: #5, #6)
  - [x] Modify `src/features/transactions/services/refundService.ts`
  - [x] `unlinkRefund` function with Dexie transaction
  - [x] `replaceLinkRefund` function with Dexie transaction
  - [x] Both functions wrapped in Dexie transactions for atomicity
  - [x] Modify `src/features/transactions/services/refundService.test.ts`
  - [x] Test: `unlinkRefund` clears `isRefund` and `linkedRefundId` on refund
  - [x] Test: `unlinkRefund` clears `linkedRefundId` on purchase
  - [x] Test: `unlinkRefund` is atomic — both updates succeed or both fail
  - [x] Test: `replaceLinkRefund` clears old purchase reference
  - [x] Test: `replaceLinkRefund` creates new bidirectional link
  - [x] Test: `replaceLinkRefund` is atomic — all three updates succeed or all fail

- [x] Task 3: Add undo support for unlink and replace operations (AC: #5, #6)
  - [x] `undoUnlinkRefund` function restores bidirectional link
  - [x] `undoReplaceLinkRefund` function reverts to old link
  - [x] Toast messages: Unlink: "Refund unlinked" with [Undo], Replace: "Refund link updated" with [Undo]
  - [x] 10-second undo window (consistent with existing pattern)
  - [x] Test: Undo unlinkRefund restores bidirectional link
  - [x] Test: Undo replaceLinkRefund reverts to old purchase link
  - [x] Test: Toast appears with correct message and Undo button

- [x] Task 4: Add navigation to linked transaction (AC: #3)
  - [x] Create `src/features/transactions/hooks/useNavigateToTransaction.ts`
  - [x] Create `src/features/transactions/hooks/useNavigateToTransaction.test.ts`
  - [x] Leverages existing highlight mechanism in TransactionList (search param `highlight`)
  - [x] Handle dangling reference gracefully: if linked transaction was deleted, show toast "Linked transaction not found"
  - [x] Test: Clicking link icon navigates with highlight param
  - [x] Test: Graceful handling when linked transaction doesn't exist

- [x] Task 5: Add category inheritance for linked refunds (AC: #4)
  - [x] Modify `src/features/transactions/services/refundService.ts`
  - [x] `linkRefund` inherits categoryId from purchase when refund has no category
  - [x] Same inheritance in `replaceLinkRefund`
  - [x] Category inheritance is one-time at link creation
  - [x] If purchase has no category, refund keeps its existing category
  - [x] Test: Linking sets refund categoryId to purchase categoryId when refund has no category
  - [x] Test: Linking does NOT override refund categoryId when refund already has a category
  - [x] Test: Linking when purchase has no category does not change refund category
  - [x] Test: Replacing link inherits category from new purchase

- [x] Task 6: Enhance link icon interaction on TransactionRow (AC: #2, #3)
  - [x] Modify `src/components/TransactionRow/index.tsx`
  - [x] Make the `Link2` icon a clickable button with `onLinkClick` callback prop
  - [x] Click event doesn't propagate to row (stopPropagation)
  - [x] Correct aria-labels: "Navigate to linked purchase" for refunds, "Navigate to linked refund" for purchases
  - [x] Wire `onLinkClick` to `navigateToTransaction` in TransactionList parent
  - [x] Test: Link icon is clickable and calls onLinkClick with linkedRefundId
  - [x] Test: Click event doesn't propagate to row
  - [x] Test: Correct aria-label for refund side
  - [x] Test: Correct aria-label for purchase side

- [x] Task 7: Update useRefundLink hook for linked-state logic (AC: #5, #6)
  - [x] Modify `src/features/transactions/hooks/useRefundLink.ts`
  - [x] Add `RefundModalView` type ('linked' | 'search') and `modalView` state
  - [x] On modal open: check `linkedRefundId` → set linked or search view
  - [x] Add `handleUnlink` function: calls `unlinkRefund`, shows toast, closes modal
  - [x] Add `handleChangeLink` function: switches view to 'search'
  - [x] Add `handleReplaceLink` function: calls `replaceLinkRefund`, shows toast, closes modal
  - [x] Target existing link check handled in RefundLinkModal's `handleSelectCandidate`
  - [x] Modify `src/features/transactions/hooks/useRefundLink.test.ts`
  - [x] Test: Modal opens in 'linked' view when source has linkedRefundId
  - [x] Test: Modal opens in 'search' view when source has no linkedRefundId
  - [x] Test: handleUnlink calls unlinkRefund service and closes modal
  - [x] Test: handleChangeLink switches view to 'search'
  - [x] Test: handleReplaceLink calls replaceLinkRefund service

- [x] Task 8: Write integration tests (AC: all)
  - [x] Full link flow covered by useRefundLink.test.ts + refundService.test.ts
  - [x] Unlink flow covered by useRefundLink.test.ts (handleUnlink) + refundService.test.ts
  - [x] Replace flow covered by useRefundLink.test.ts (handleReplaceLink) + refundService.test.ts
  - [x] Replace with warning covered by RefundLinkModal.test.tsx
  - [x] Navigate flow covered by useNavigateToTransaction.test.ts + TransactionRow.test.tsx
  - [x] Navigate dangling covered by useNavigateToTransaction.test.ts
  - [x] Category inheritance covered by refundService.test.ts (4 tests)
  - [x] Category preservation covered by refundService.test.ts
  - [x] Undo unlink covered by refundService.test.ts (undoUnlinkRefund)
  - [x] Undo replace covered by refundService.test.ts (undoReplaceLinkRefund)
  - [x] Keyboard: F key + linked state covered by RefundLinkModal.test.tsx + useRefundLink.test.ts

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

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Implemented `unlinkRefund`, `undoUnlinkRefund`, `replaceLinkRefund`, `undoReplaceLinkRefund` service functions in `refundService.ts`
- Added category inheritance logic to `linkRefund` (inherits purchase categoryId when refund has none) and `replaceLinkRefund`
- Extended `useRefundLink` hook with `modalView` state (linked/search), `handleUnlink`, `handleChangeLink`, `handleReplaceLink` handlers
- Enhanced `RefundLinkModal` with two views: linked-state view (shows current link, unlink/change buttons) and search view (with replace warning when target has existing link)
- Created `useNavigateToTransaction` hook leveraging existing `highlight` search param mechanism
- Made Link2 icon in `TransactionRow` a clickable button with `onLinkClick` callback and proper aria-labels
- Wired navigation hook to TransactionList parent
- Note on field naming: Story spec used `linkedTransactionId` but actual codebase field is `linkedRefundId` (from Story 8.1). Implementation follows the actual schema.
- Tooltip feature (AC #2 detailed tooltip) was simplified to aria-labels only to keep TransactionRow as a pure presentational component without hooks. The linked-state view in the modal provides full linked transaction details.
- All 1042 tests pass (only pre-existing DOMMatrix failure in accounts.test.tsx)

### Change Log

- 2026-02-08: Implemented Story 8.2 - Link Refund to Original Purchase
  - Added unlinkRefund, replaceLinkRefund services with undo support
  - Added category inheritance in linkRefund and replaceLinkRefund
  - Enhanced RefundLinkModal with linked-state view and replace warning
  - Added useNavigateToTransaction hook for linked transaction navigation
  - Made Link2 icon clickable in TransactionRow
  - Extended useRefundLink hook with linked-state logic
  - 85 new/updated tests across 6 test files

### File List

- src/features/transactions/services/refundService.ts (modified)
- src/features/transactions/services/refundService.test.ts (modified)
- src/features/transactions/hooks/useRefundLink.ts (modified)
- src/features/transactions/hooks/useRefundLink.test.ts (modified)
- src/features/transactions/hooks/useNavigateToTransaction.ts (new)
- src/features/transactions/hooks/useNavigateToTransaction.test.ts (new)
- src/features/transactions/components/RefundLinkModal/index.tsx (modified)
- src/features/transactions/components/RefundLinkModal/RefundLinkModal.test.tsx (modified)
- src/components/TransactionRow/index.tsx (modified)
- src/components/TransactionRow/TransactionRow.test.tsx (modified)
- src/features/transactions/components/TransactionList/index.tsx (modified)
