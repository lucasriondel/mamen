# Story 5.2: Batch Merchant Assignment

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to assign multiple selected transactions to a merchant at once**,
So that **I can quickly categorize similar transactions (FR18)**.

## Acceptance Criteria

1. **Given** I have 2+ transactions selected (via Shift+J/K or Space/X from Story 5.1)
   **When** I press `R`
   **Then** the Merchant Assignment Modal opens in "batch mode"
   **And** it shows: "Assign X Transactions to Merchant"
   **And** all selected transaction strings are listed

2. **Given** the batch modal is open
   **When** the system analyzes selected transactions
   **Then** pattern suggestions are generated:
   - Common prefix pattern if found (e.g., "UBER.*" for UBER TRIP, UBER EATS)
   - Combined pattern if different roots (e.g., "(UBER|LYFT).*")
   - "No common pattern" fallback if too diverse

3. **Given** a common pattern is found
   **When** I view the suggestions
   **Then** I see the pattern with match count
   **And** match count includes selected transactions + any other matches
   **And** I'm warned if pattern matches unselected transactions

4. **Given** the pattern matches unwanted transactions
   **When** a warning appears
   **Then** I see: "Pattern also matches X other transactions"
   **And** I can view which transactions
   **And** I can choose to adjust the pattern or create separate merchants

5. **Given** no common pattern is found
   **When** transactions are too diverse
   **Then** I see: "No common pattern found"
   **And** Options: "Create merchant with multiple rules", "Assign without rule", "Cancel"

6. **Given** I confirm the batch assignment
   **When** I click "Create" or "Add Rule"
   **Then** all selected transactions are assigned to the merchant
   **And** the rule(s) are created
   **And** a toast shows: "X transactions -> [Merchant]" with Undo
   **And** selection is cleared

## Tasks / Subtasks

- [ ] Task 1: Create batch pattern analysis service (AC: #2, #3, #4, #5)
  - [ ] Create `src/features/rules/services/batchPatternAnalyzer.ts`
  - [ ] Create `src/features/rules/services/batchPatternAnalyzer.test.ts`
  - [ ] Types:
    ```typescript
    type BatchPatternResult = {
      type: 'common-prefix' | 'combined' | 'no-pattern'
      suggestions: BatchPatternSuggestion[]
      rawStrings: string[]
    }

    type BatchPatternSuggestion = {
      pattern: string
      label: string
      matchCount: number
      matchesOutsideSelection: number
      type: 'prefix' | 'combined' | 'individual'
    }
    ```
  - [ ] Implement `analyzeBatchPatterns(rawStrings: string[]): BatchPatternResult`
  - [ ] Algorithm:
    1. Extract all raw merchant strings from selected transactions
    2. Find longest common prefix across all strings (using `extractPrefix` from `src/lib/utils/patternUtils.ts`)
    3. If common prefix >= 3 chars: generate prefix pattern (`^PREFIX.*`)
    4. If no common prefix but 2-3 distinct roots: generate combined pattern (`(ROOT1|ROOT2).*`)
    5. If too diverse (4+ distinct roots): return `'no-pattern'` type
    6. For each suggestion, compute match count against ALL transactions in Dexie
    7. Compute `matchesOutsideSelection` = total matches - selected count
  - [ ] Reuse `escapeRegex` and `extractPrefix` from `src/lib/utils/patternUtils.ts`
  - [ ] Performance: Must handle up to 100 selected transactions efficiently

- [ ] Task 2: Extend MerchantAssignmentModal for batch mode (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Modify `src/features/merchants/components/MerchantAssignmentModal/index.tsx`
  - [ ] Add batch mode props:
    ```typescript
    type MerchantAssignmentModalProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      // Single mode (existing)
      transaction?: Transaction
      // Batch mode (new)
      transactions?: Transaction[]
      onComplete?: () => void
    }
    ```
  - [ ] Detect batch mode: `transactions && transactions.length > 1`
  - [ ] Batch mode header: "Assign {count} Transactions to Merchant"
  - [ ] Show scrollable list of selected transaction raw strings (max 5 visible, "+X more" if >5)
  - [ ] Use `analyzeBatchPatterns()` instead of `generatePatternSuggestions()` when in batch mode
  - [ ] Keep existing single-transaction mode working (no regression)
  - [ ] Both "New merchant" and "Existing merchant" flows must work in batch mode

- [ ] Task 3: Add batch pattern suggestion UI (AC: #3, #4)
  - [ ] Modify `PatternSuggestionRadioGroup` to handle batch suggestions
  - [ ] Each suggestion shows:
    - Pattern in monospace font
    - Total match count (including selected)
    - Warning badge if `matchesOutsideSelection > 0`: "Also matches X other transactions"
  - [ ] Warning click expands to show list of unselected matching transactions (first 5 + "and X more")
  - [ ] Visual: Warning uses `hsl(var(--destructive))` color for the count badge

- [ ] Task 4: Handle "no common pattern" case (AC: #5)
  - [ ] When `BatchPatternResult.type === 'no-pattern'`:
    - Show message: "No common pattern found for these transactions"
    - Option A: "Create merchant with multiple rules" - creates one rule per distinct prefix group
    - Option B: "Assign without rule" - assigns transactions to merchant with manual categoryId but no rule (transactions categorized but future similar transactions won't auto-match)
    - Option C: "Cancel"
  - [ ] Option A implementation:
    1. Group selected transactions by extracted prefix
    2. For each group, create a separate rule pattern
    3. All rules linked to the same merchant
    4. Each rule matches its subset of transactions
  - [ ] Option B implementation:
    1. Create merchant (if new) or use selected existing merchant
    2. Bulk update selected transactions with `merchantId` and `categoryId`
    3. No rules created - these are manual assignments

- [ ] Task 5: Implement batch merchant creation service (AC: #6)
  - [ ] Create `src/features/merchants/services/batchAssignMerchant.ts`
  - [ ] Create `src/features/merchants/services/batchAssignMerchant.test.ts`
  - [ ] Types:
    ```typescript
    type BatchAssignParams = {
      mode: 'new' | 'existing'
      merchantName?: string          // For new merchant
      merchantId?: string            // For existing merchant
      pattern: string                // Primary rule pattern
      additionalPatterns?: string[]  // For multi-rule creation
      categoryId: string
      categoryOverrideId?: string | null
      transactionIds: string[]
      assignWithoutRule?: boolean    // For "assign without rule" option
    }

    type BatchAssignResult = {
      merchantId: string
      ruleIds: string[]
      affectedTransactionIds: string[]
      matchCount: number
    }
    ```
  - [ ] Use Dexie transaction for atomicity (`db.transaction('rw', ...)`)
  - [ ] Steps for "new merchant" mode:
    1. Create merchant with name, slug, defaultCategoryId
    2. Create rule(s) with pattern(s)
    3. Apply rule(s) to all matching transactions (not just selected - rule applies globally)
    4. Return result for undo
  - [ ] Steps for "existing merchant" mode:
    1. Create rule(s) linked to existing merchantId
    2. Determine category: override if set, else merchant's default
    3. Apply rule(s) to matching transactions
    4. Return result for undo
  - [ ] Steps for "assign without rule":
    1. Create merchant (if new)
    2. Bulk update only selected transactions with merchantId + categoryId
    3. No rules created
    4. Return result for undo

- [ ] Task 6: Implement batch undo (AC: #6)
  - [ ] Extend undo system (from `src/context/UndoContext.tsx` or `src/hooks/useUndo.ts`)
  - [ ] Batch undo action type:
    ```typescript
    type BatchAssignUndoAction = {
      type: 'batch-assign-merchant'
      merchantId: string
      ruleIds: string[]
      affectedTransactionIds: string[]
      previousState: Array<{
        id: string
        merchantId: string | null
        categoryId: string | null
      }>
      deleteNewMerchant: boolean  // true if merchant was newly created
    }
    ```
  - [ ] Undo logic:
    1. Delete created rules
    2. If new merchant was created, delete it
    3. Restore all affected transactions to previous state
    4. Use Dexie transaction for atomicity
  - [ ] Toast: "X transactions -> [Merchant]" with Undo button, 10-second window

- [ ] Task 7: Wire R key to batch mode (AC: #1)
  - [ ] Modify keyboard handler (in `useKeyboardNavigation` or transaction list keyboard logic)
  - [ ] When `R` is pressed:
    - If `multiSelect.selectionCount > 1`: Open modal in batch mode with selected transactions
    - If `multiSelect.selectionCount <= 1`: Open modal in single mode with focused transaction (existing behavior)
  - [ ] Fetch full transaction objects for selected IDs from Dexie before opening modal
  - [ ] After batch assignment completes: call `multiSelect.clearSelection()`

- [ ] Task 8: Clear selection after batch operations (AC: #6)
  - [ ] In the `onComplete` callback from modal:
    1. Clear multi-select selection
    2. Return focus to the first previously-selected transaction (if still visible)
    3. Ensure cascade animation (from Story 4.8) plays for newly categorized transactions
  - [ ] If undo is triggered:
    1. Transactions revert to previous state
    2. Selection is NOT restored (user can re-select manually)

- [ ] Task 9: Handle "matches outside selection" warning UI (AC: #4)
  - [ ] Create expandable warning component within the modal
  - [ ] When `matchesOutsideSelection > 0`:
    - Show amber warning: "Pattern also matches X other transactions"
    - Expandable section showing first 5 unselected matching transactions
    - Each shows: raw merchant string, date, amount
    - If >5: "and X more"
  - [ ] User can choose to:
    - Proceed (apply rule to ALL matching, not just selected)
    - Adjust pattern manually (switch to custom regex mode)
    - Cancel and create separate merchants for subgroups

- [ ] Task 10: Write tests (AC: all)
  - [ ] `batchPatternAnalyzer.test.ts`:
    - Test: Common prefix found for similar strings ("UBER TRIP 123", "UBER EATS 456") -> "^UBER.*"
    - Test: Combined pattern for 2 distinct roots -> "(ROOT1|ROOT2).*"
    - Test: No pattern for 4+ diverse strings -> type: 'no-pattern'
    - Test: Match count includes transactions outside selection
    - Test: `matchesOutsideSelection` correctly computed
    - Test: Edge case - all strings identical -> exact match suggestion
    - Test: Edge case - single string selected (shouldn't happen in batch but handle gracefully)
  - [ ] `batchAssignMerchant.test.ts`:
    - Test: New merchant creation with single rule
    - Test: New merchant with multiple rules (no-pattern case)
    - Test: Existing merchant with new rule
    - Test: Assign without rule - only selected transactions updated
    - Test: Undo restores all transactions to previous state
    - Test: Undo deletes newly created merchant
    - Test: Undo does NOT delete existing merchant
    - Test: Dexie transaction atomicity - partial failure rolls back
  - [ ] Modal integration tests:
    - Test: R key with 2+ selected opens batch modal
    - Test: R key with 1 selected opens single modal (no regression)
    - Test: Batch modal shows correct transaction count
    - Test: Pattern suggestions display with match counts
    - Test: Warning appears when pattern matches unselected transactions
    - Test: Selection cleared after successful batch assignment
    - Test: Toast appears with correct count and undo
    - Test: Both new and existing merchant flows work in batch mode
    - Test: "No common pattern" options display correctly

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| UI State | React context or minimal Zustand | Selection is UI-only state |
| Validation | Zod schemas for runtime validation | Validate patterns before saving |
| Undo/Redo | Command pattern with action queue | 10-second toast undo window |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### Batch Modal Architecture

**CRITICAL: This extends the existing MerchantAssignmentModal, NOT a new modal.**

The modal from Story 4.3/4.4 already supports:
- New merchant creation with pattern suggestions
- Existing merchant selection with rule addition
- Category picker integration
- Match preview list
- Conflict detection
- Power mode (Shift+R) for raw regex

Story 5.2 adds **batch mode** as a third dimension:
- Single transaction + New merchant (4.3)
- Single transaction + Existing merchant (4.4)
- **Multiple transactions + New merchant (5.2 NEW)**
- **Multiple transactions + Existing merchant (5.2 NEW)**

### Pattern Generation Algorithm for Batch

```typescript
// Pseudocode for batch pattern analysis
const analyzeBatchPatterns = async (rawStrings: string[]): Promise<BatchPatternResult> => {
  // 1. Extract prefixes from each string
  const prefixes = rawStrings.map(s => extractPrefix(s)).filter(Boolean)

  // 2. Find longest common prefix
  const commonPrefix = findLongestCommonPrefix(prefixes)

  if (commonPrefix && commonPrefix.length >= 3) {
    // Common prefix found - generate prefix pattern
    const pattern = `^${escapeRegex(commonPrefix)}.*`
    const matchCount = await countMatchesInDb(pattern)
    const outsideCount = matchCount - rawStrings.length
    return {
      type: 'common-prefix',
      suggestions: [{
        pattern,
        label: `Prefix: "${commonPrefix}" (${matchCount} transactions)`,
        matchCount,
        matchesOutsideSelection: outsideCount,
        type: 'prefix'
      }],
      rawStrings
    }
  }

  // 3. Group by distinct roots (first word/token)
  const groups = groupByRoot(rawStrings)

  if (Object.keys(groups).length <= 3) {
    // Few distinct roots - generate combined pattern
    const roots = Object.keys(groups).map(r => escapeRegex(r))
    const pattern = `^(${roots.join('|')}).*`
    const matchCount = await countMatchesInDb(pattern)
    return {
      type: 'combined',
      suggestions: [{
        pattern,
        label: `Combined: (${Object.keys(groups).join('|')})`,
        matchCount,
        matchesOutsideSelection: matchCount - rawStrings.length,
        type: 'combined'
      }],
      rawStrings
    }
  }

  // 4. Too diverse - no common pattern
  return {
    type: 'no-pattern',
    suggestions: [],
    rawStrings
  }
}
```

### Existing Services to Reuse

These services from Stories 4.3/4.4 should be reused, NOT re-implemented:

| Service | Location | Purpose |
|---------|----------|---------|
| `generatePatternSuggestions` | `src/features/rules/services/ruleEngine.ts` | Single-transaction pattern suggestions |
| `applyRuleToTransactions` | `src/features/rules/services/applyRule.ts` | Apply regex rule to matching transactions |
| `detectRuleConflict` | `src/features/rules/services/detectRuleConflict.ts` | Check for rule overlaps |
| `escapeRegex` | `src/lib/utils/patternUtils.ts` | Escape regex special chars |
| `extractPrefix` | `src/lib/utils/patternUtils.ts` | Extract stable prefix from merchant string |
| `cleanMerchantString` | `src/lib/utils/patternUtils.ts` | Clean raw string for merchant name |
| `addRuleToMerchant` | `src/features/rules/services/addRuleToMerchant.ts` | Add rule to existing merchant |
| `validateRegexPattern` | `src/lib/utils/patternUtils.ts` | Validate regex before saving |

### Existing Components to Extend (NOT create new)

| Component | Location | Change |
|-----------|----------|--------|
| MerchantAssignmentModal | `src/features/merchants/components/MerchantAssignmentModal/index.tsx` | Add `transactions` array prop, batch mode logic |
| PatternSuggestionRadioGroup | `src/features/merchants/components/PatternSuggestionRadioGroup/index.tsx` | Support batch suggestions with warning badges |
| MatchPreviewList | `src/features/merchants/components/MatchPreviewList/index.tsx` | Show which matches are "outside selection" |
| MerchantSearchSelect | `src/features/merchants/components/MerchantSearchSelect/index.tsx` | No change needed - works for batch too |
| CategoryPicker | (from Story 4.1) | No change needed |

### Previous Story Intelligence

**From Story 5.1 (Multi-Select Transactions):**
- `useMultiSelect` hook at `src/hooks/useMultiSelect.ts` provides:
  - `selectedIds: Set<string>` - currently selected transaction IDs
  - `selectionCount: number` - count of selected
  - `clearSelection()` - clears all selections
  - `isSelected(id)` - O(1) check
- `SelectionStatusBar` at `src/components/SelectionStatusBar/index.tsx`:
  - Already shows "[R] Assign merchant" hint when selection active
  - This story makes that hint functional
- Selection cleared on Esc or plain J/K navigation
- Selection is UI-only state (not persisted to Dexie)

**From Story 4.3 (Create Merchant with Rule):**
- MerchantAssignmentModal fully working for single transaction
- Pattern suggestion system with exact/prefix/custom options
- Live match count computation
- Power mode (Shift+R) for raw regex input
- Toast with 10-second undo

**From Story 4.4 (Assign to Existing Merchant):**
- Modal supports "New" and "Existing" merchant toggle
- MerchantSearchSelect for finding existing merchants
- Rule conflict detection
- Category override per-rule

**From Story 4.8 (Cascade Animation):**
- When batch assignment categorizes transactions, cascade animation should trigger
- `useReducedMotion` hook respects `prefers-reduced-motion`
- Animation is staggered (50ms per row, max 10 animated)
- Unmatched counter animates down

### Interaction with Cascade Animation

When batch assignment completes and multiple transactions get categorized:
1. If in Unmatched view, newly categorized transactions animate out
2. Category badges fade in on affected rows (visible ones only)
3. Unmatched counter animates down by the match count
4. Animation staggered per Story 4.8 specs
5. This happens automatically via Dexie `useLiveQuery` reactivity + existing animation hooks

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target |
|--------|--------|
| Pattern analysis | <500ms for 100 selected transactions |
| Modal open | <100ms after R key press |
| Batch assignment | <2s for 100 transactions |
| Undo | <1s to restore all transactions |

Batch pattern analysis queries Dexie for match counts. With proper Dexie indexing on `rawMerchantString`, this should be fast. Use `db.transactions.filter()` with compiled regex for counting.

### Data Flow

```
User selects 5 transactions with Shift+J/K
  |
User presses R
  |
Keyboard handler detects selection count > 1
  |
Fetch full Transaction objects from Dexie for selected IDs
  |
Open MerchantAssignmentModal in batch mode
  |
analyzeBatchPatterns(rawStrings) runs
  |
User sees pattern suggestions with match counts
  |
User selects pattern, category, clicks Create
  |
batchAssignMerchant() runs in Dexie transaction:
  1. Create merchant (if new)
  2. Create rule(s)
  3. Apply rules to ALL matching transactions
  4. Return undo data
  |
Toast: "12 transactions -> Amazon" [Undo]
  |
clearSelection() called
  |
Cascade animation plays on affected rows
  |
Unmatched counter animates down
```

### Project Structure for This Story

```
src/
├── features/
│   ├── rules/
│   │   └── services/
│   │       ├── batchPatternAnalyzer.ts (new)
│   │       └── batchPatternAnalyzer.test.ts (new)
│   └── merchants/
│       ├── components/
│       │   └── MerchantAssignmentModal/
│       │       └── index.tsx (modify - add batch mode)
│       └── services/
│           ├── batchAssignMerchant.ts (new)
│           └── batchAssignMerchant.test.ts (new)
├── hooks/
│   └── useKeyboardNavigation.ts (modify - R key checks selection count)
└── components/
    └── SelectionStatusBar/
        └── index.tsx (no change - already shows R hint)
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT create a separate `BatchMerchantModal` - extend the existing `MerchantAssignmentModal`
- DO NOT duplicate Dexie data in React state
- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT store batch results in React state - commit to Dexie immediately
- DO NOT forget to handle undo for the entire batch operation atomically
- DO NOT break single-transaction R key flow (must still work when 0-1 selected)
- DO NOT skip conflict detection for batch patterns (reuse `detectRuleConflict`)
- DO NOT create rules that are too broad without warning the user

### Validation Checklist

Before marking complete:
- [ ] R key with 2+ selected opens batch modal
- [ ] R key with 0-1 selected opens single modal (no regression)
- [ ] Batch modal shows "Assign X Transactions to Merchant"
- [ ] Selected transaction strings listed in modal
- [ ] Common prefix pattern detected and suggested
- [ ] Combined pattern generated for 2-3 distinct roots
- [ ] "No common pattern" message with options for diverse selections
- [ ] Match count includes transactions outside selection
- [ ] Warning shown for matches outside selection
- [ ] Warning expandable to show affected transactions
- [ ] New merchant flow works in batch mode
- [ ] Existing merchant flow works in batch mode
- [ ] Assign without rule option works
- [ ] Multiple rules created for no-pattern case
- [ ] Toast shows "X transactions -> [Merchant]" with Undo
- [ ] Undo restores ALL transactions to previous state
- [ ] Selection cleared after assignment
- [ ] Cascade animation plays on affected rows
- [ ] Unmatched counter updates
- [ ] Dexie transaction atomicity for batch writes
- [ ] Pattern conflict detection works for batch patterns
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-5-Story-5.2-Batch-Merchant-Assignment]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Frontend-Architecture]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Batch-Operations]
- [Source: ux-design-specification.md#Merchant-Assignment-Modal]
- [Story 5.1: Multi-Select Transactions (Shift+J/K) - useMultiSelect hook, SelectionStatusBar]
- [Story 4.3: Create Merchant with Rule (R Key) - MerchantAssignmentModal, PatternSuggestionRadioGroup, ruleEngine]
- [Story 4.4: Assign Transaction to Existing Merchant - MerchantSearchSelect, addRuleToMerchant, detectRuleConflict]
- [Story 4.8: Cascade Animation Feedback - animation patterns, useReducedMotion]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
