# Story 4.6: View and Manage Rules

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to view all my rules and edit or delete them**,
So that **I can maintain my categorization system over time (FR10, FR11, FR12)**.

## Acceptance Criteria

1. **Given** I want to see all rules
   **When** I navigate to a Rules view (via Settings or dedicated page)
   **Then** I see all rules grouped by merchant
   **And** each rule shows: pattern, match count, category (default or override)

2. **Given** I view a merchant's rules
   **When** I look at the rules list
   **Then** I see each rule's pattern in monospace font
   **And** I see how many transactions each rule has matched

3. **Given** I want to edit a rule
   **When** I click edit on a rule
   **Then** I can modify the pattern
   **And** I can modify the category override
   **And** changes are validated (pattern must be valid regex)
   **And** I see a preview of affected transactions

4. **Given** I save rule changes
   **When** the pattern changes
   **Then** transactions are re-evaluated against the new pattern
   **And** a toast confirms the change with Undo

5. **Given** I want to delete a rule
   **When** I click delete on a rule
   **Then** I see a confirmation: "Transactions will become unmatched"
   **And** upon confirmation, the rule is deleted
   **And** affected transactions lose their merchant/category assignment
   **And** a toast confirms with Undo

## Tasks / Subtasks

- [ ] Task 1: Create RulesPage route and layout (AC: #1)
  - [ ] Create `src/routes/rules.tsx` with TanStack Router
  - [ ] Add "Rules" to sidebar navigation (Settings section or dedicated nav item)
  - [ ] Create `src/features/rules/components/RulesPage/index.tsx`
  - [ ] Create `src/features/rules/components/RulesPage/RulesPage.test.tsx`
  - [ ] Page header: "Rules" with description "Manage your categorization rules"
  - [ ] Empty state when no rules exist: "No rules yet. Create rules by pressing R on transactions"
  - [ ] Named exports only, use `type` not `interface`

- [ ] Task 2: Create RulesListByMerchant component (AC: #1, #2)
  - [ ] Create `src/features/rules/components/RulesListByMerchant/index.tsx`
  - [ ] Create `src/features/rules/components/RulesListByMerchant/RulesListByMerchant.test.tsx`
  - [ ] Use `useLiveQuery` to load rules with their merchants from Dexie
  - [ ] Group rules by merchant using:
    ```typescript
    type MerchantWithRules = {
      merchant: Merchant
      rules: Rule[]
    }
    ```
  - [ ] Sort merchants by: most rules first, then alphabetically by name
  - [ ] Render collapsible sections per merchant (default expanded)
  - [ ] Merchant header shows: name, default category badge, rule count
  - [ ] PascalCase component directory with index.tsx

- [ ] Task 3: Create RuleRow component (AC: #1, #2)
  - [ ] Create `src/features/rules/components/RuleRow/index.tsx`
  - [ ] Create `src/features/rules/components/RuleRow/RuleRow.test.tsx`
  - [ ] Display rule pattern in `font-mono` (JetBrains Mono per UX spec)
  - [ ] Display match count: "42 matches" or "0 matches"
  - [ ] Display category:
    - If rule has `categoryOverrideId`: show override category badge + "(override)" label
    - If no override: show "(uses merchant default)" in muted text
  - [ ] Edit button (pencil icon) on hover or always visible
  - [ ] Delete button (trash icon) on hover or always visible
  - [ ] Row height consistent with transaction row styling (48px)
  - [ ] Use Lucide React icons: `Pencil`, `Trash2`

- [ ] Task 4: Create RuleEditModal component (AC: #3, #4)
  - [ ] Create `src/features/rules/components/RuleEditModal/index.tsx`
  - [ ] Create `src/features/rules/components/RuleEditModal/RuleEditModal.test.tsx`
  - [ ] Use shadcn `Dialog` component as base
  - [ ] Props type:
    ```typescript
    type RuleEditModalProps = {
      ruleId: string
      open: boolean
      onOpenChange: (open: boolean) => void
    }
    ```
  - [ ] Load rule and its merchant data via `useLiveQuery`
  - [ ] Form fields:
    - Pattern input (`type="text"`, font-mono styling)
    - Live regex validation (show error if invalid)
    - Category override toggle with category picker
  - [ ] Live match preview section (Task 5)
  - [ ] Save and Cancel buttons
  - [ ] Named exports only

- [ ] Task 5: Implement live match preview for rule edits (AC: #3)
  - [ ] Add match preview section to RuleEditModal
  - [ ] Create `useRuleMatchPreview` hook:
    ```typescript
    export const useRuleMatchPreview = (pattern: string): {
      matchCount: number
      sampleTransactions: Transaction[]
      isValidPattern: boolean
      patternError: string | null
    } => { ... }
    ```
  - [ ] Query Dexie for transactions where `rawMerchantString` matches pattern
  - [ ] Debounce pattern changes (300ms) to avoid excessive queries
  - [ ] Show:
    - "X transactions will match" count
    - First 3 matching transactions as preview rows
    - "+ Y more" if more than 3 matches
  - [ ] Handle invalid regex gracefully: show error, disable save

- [ ] Task 6: Implement rule pattern validation (AC: #3)
  - [ ] Create `validateRulePattern` utility:
    ```typescript
    // src/features/rules/utils/validateRulePattern.ts
    export const validateRulePattern = (pattern: string): {
      isValid: boolean
      error: string | null
    } => {
      if (!pattern.trim()) {
        return { isValid: false, error: 'Pattern cannot be empty' }
      }
      try {
        new RegExp(pattern, 'i')
        return { isValid: true, error: null }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Invalid regex pattern'
        return { isValid: false, error: errorMessage }
      }
    }
    ```
  - [ ] Show inline validation error below pattern input
  - [ ] Disable Save button when pattern is invalid
  - [ ] Show success indicator (checkmark) when pattern is valid

- [ ] Task 7: Implement rule update with transaction re-evaluation (AC: #4)
  - [ ] Create `updateRuleWithReeval` function:
    ```typescript
    // src/features/rules/services/ruleOperations.ts
    export const updateRuleWithReeval = async (
      ruleId: string,
      updates: Partial<Pick<Rule, 'pattern' | 'categoryOverrideId'>>
    ): Promise<{
      updatedTransactionCount: number
      previousTransactionCount: number
    }>
    ```
  - [ ] Implementation steps:
    1. Get current rule and its matched transactions
    2. Update rule in Dexie
    3. Clear merchantId/categoryId from previously matched transactions
    4. Re-run rules engine on cleared transactions
    5. Return counts for toast message
  - [ ] Use Dexie transaction for atomicity
  - [ ] Handle case where pattern change results in fewer matches

- [ ] Task 8: Create useRuleMutations hook (AC: #4, #5)
  - [ ] Create `src/features/rules/hooks/useRuleMutations.ts`
  - [ ] Create `src/features/rules/hooks/useRuleMutations.test.ts`
  - [ ] Expose:
    ```typescript
    export const useRuleMutations = () => {
      return {
        updateRule: (ruleId: string, updates: RuleUpdates) => Promise<void>,
        deleteRule: (ruleId: string) => Promise<void>,
        isUpdating: boolean,
        isDeleting: boolean,
        error: Error | null,
      }
    }
    ```
  - [ ] Integrate with toast notifications
  - [ ] Implement undo action using command pattern (10-second window)
  - [ ] Named exports only

- [ ] Task 9: Implement rule deletion with transaction cleanup (AC: #5)
  - [ ] Add to `src/features/rules/services/ruleOperations.ts`:
    ```typescript
    export const deleteRuleWithCleanup = async (
      ruleId: string
    ): Promise<{
      affectedTransactionCount: number
      deletedRule: Rule
    }>
    ```
  - [ ] Implementation steps:
    1. Get rule and count transactions using this rule
    2. Clear merchantId/categoryId from matched transactions
    3. Delete the rule from Dexie
    4. Update merchant's rule count
    5. Return deleted rule for undo
  - [ ] Use Dexie transaction for atomicity
  - [ ] Store deleted rule for undo restoration

- [ ] Task 10: Create DeleteRuleConfirmation dialog (AC: #5)
  - [ ] Create `src/features/rules/components/DeleteRuleConfirmation/index.tsx`
  - [ ] Use shadcn `AlertDialog` component
  - [ ] Props:
    ```typescript
    type DeleteRuleConfirmationProps = {
      rule: Rule
      affectedTransactionCount: number
      open: boolean
      onOpenChange: (open: boolean) => void
      onConfirm: () => void
    }
    ```
  - [ ] Show warning text: "X transactions will become unmatched"
  - [ ] Show rule pattern being deleted
  - [ ] Destructive action styling (red confirm button)
  - [ ] "Cancel" and "Delete Rule" buttons

- [ ] Task 11: Implement undo for rule operations (AC: #4, #5)
  - [ ] Use existing undo context/pattern from project
  - [ ] For rule updates:
    - Store previous pattern and categoryOverrideId
    - On undo: restore previous values, re-run transaction re-evaluation
  - [ ] For rule deletes:
    - Store deleted rule object
    - On undo: re-create rule, re-run rules engine on affected transactions
  - [ ] Toast with "Undo" action button, 10-second window
  - [ ] Example toast: "Rule deleted. 15 transactions unmatched" [Undo]

- [ ] Task 12: Add keyboard navigation to rules list (AC: #1)
  - [ ] Enable J/K navigation between rules (consistent with transaction list)
  - [ ] Focus state on rule rows with visible focus ring
  - [ ] Enter key opens edit modal for focused rule
  - [ ] Delete key (or Backspace) opens delete confirmation
  - [ ] Escape clears focus
  - [ ] Hook into existing keyboard navigation context

- [ ] Task 13: Add rules navigation to sidebar (AC: #1)
  - [ ] Add "Rules" link to sidebar navigation
  - [ ] Place under Settings section or as top-level item near Merchants
  - [ ] Show rule count badge: "(42)" next to Rules
  - [ ] Highlight when on /rules route
  - [ ] Update sidebar component (from Story 1.3)

- [ ] Task 14: Create search/filter for rules (AC: #1)
  - [ ] Add search input at top of RulesPage
  - [ ] Filter rules by:
    - Pattern text (substring match)
    - Merchant name (substring match)
    - Category name
  - [ ] Instant filtering as user types
  - [ ] Clear search button (X icon)
  - [ ] "No rules match your search" empty state

- [ ] Task 15: Wire up RulesPage with all components (AC: all)
  - [ ] RulesPage layout:
    - Header with title and search
    - RulesListByMerchant component
    - RuleEditModal (controlled via state)
    - DeleteRuleConfirmation (controlled via state)
  - [ ] State management for modal open/close
  - [ ] Pass selectedRuleId to modals
  - [ ] Handle loading states (skeleton while loading rules)

- [ ] Task 16: Export new components and hooks from feature module
  - [ ] Update `src/features/rules/index.ts`:
    ```typescript
    // Components
    export { RulesPage } from './components/RulesPage'
    export { RulesListByMerchant } from './components/RulesListByMerchant'
    export { RuleRow } from './components/RuleRow'
    export { RuleEditModal } from './components/RuleEditModal'
    export { DeleteRuleConfirmation } from './components/DeleteRuleConfirmation'

    // Hooks
    export { useRuleMutations } from './hooks/useRuleMutations'
    export { useRuleMatchPreview } from './hooks/useRuleMatchPreview'

    // Services (existing + new)
    export { applyRulesToTransactions, applyMatchResults } from './services/RulesEngine'
    export { updateRuleWithReeval, deleteRuleWithCleanup } from './services/ruleOperations'

    // Utils
    export { validateRulePattern } from './utils/validateRulePattern'
    ```
  - [ ] Named exports only

- [ ] Task 17: Write integration tests (AC: all)
  - [ ] Test: RulesPage displays all rules grouped by merchant
  - [ ] Test: Clicking edit opens RuleEditModal with correct data
  - [ ] Test: Pattern validation shows error for invalid regex
  - [ ] Test: Match preview updates when pattern changes
  - [ ] Test: Saving rule updates transactions correctly
  - [ ] Test: Delete confirmation shows affected transaction count
  - [ ] Test: Deleting rule clears transactions and shows undo toast
  - [ ] Test: Undo restores deleted rule and re-matches transactions
  - [ ] Test: Search filters rules by pattern and merchant name
  - [ ] Test: J/K keyboard navigation works in rules list
  - [ ] Test: Empty state shown when no rules exist

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Validation | Zod schemas | Runtime validation for user input |
| Undo/Redo | Command pattern | Fits 10-second toast undo UX |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |
| Hooks | camelCase with `use` prefix |

### Previous Story Intelligence (Story 4.5)

**From Rules Engine Implementation:**

The RulesEngine service from Story 4.5 provides the foundation for rule operations:

```typescript
// Key functions to reuse from Story 4.5
import { applyRulesToTransactions, applyMatchResults } from './services/RulesEngine'

// Pattern for re-evaluating transactions after rule changes
const reevaluateTransactions = async (transactionIds: string[]) => {
  const results = await applyRulesToTransactions(transactionIds)
  await applyMatchResults(results.matched)
  return results
}
```

**Rule Types from Previous Stories:**

```typescript
// From Story 4.3 and 4.4
type Rule = {
  id: string
  merchantId: string
  pattern: string // Regex pattern
  categoryOverrideId: string | null // Null means use merchant default
  matchCount: number
  createdAt: Date
  updatedAt: Date
}

type Merchant = {
  id: string
  name: string
  defaultCategoryId: string
  createdAt: Date
  firstSeenAt: Date
}
```

### Data Flow for Rule Edit

```
User edits pattern in modal
    ↓
validateRulePattern (real-time)
    ↓
useRuleMatchPreview (debounced 300ms)
    ↓
Show preview: "X transactions will match"
    ↓
User clicks Save
    ↓
updateRuleWithReeval:
    1. Store previous state (for undo)
    2. Get transactions matched by OLD pattern
    3. Clear merchantId/categoryId on those transactions
    4. Update rule in Dexie
    5. Run applyRulesToTransactions on cleared transactions
    6. Apply results
    ↓
Toast: "Rule updated. X transactions re-matched" [Undo]
```

### Data Flow for Rule Delete

```
User clicks Delete on rule row
    ↓
Show DeleteRuleConfirmation with affected count
    ↓
User confirms
    ↓
deleteRuleWithCleanup:
    1. Store rule (for undo)
    2. Get transactions matched by this rule
    3. Clear merchantId/categoryId on those transactions
    4. Delete rule from Dexie
    ↓
Toast: "Rule deleted. X transactions unmatched" [Undo]
    ↓
(If user clicks Undo within 10 seconds):
    1. Re-create rule in Dexie
    2. Run applyRulesToTransactions on affected transactions
    3. Apply results
```

### UI Layout Specification

**RulesPage Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Rules                                       [Search...] │
│ Manage your categorization rules                        │
├─────────────────────────────────────────────────────────┤
│ ▼ Amazon (5 rules)                   Shopping > Online  │
│   ├─ AMZN.*                          42 matches    [✎] │
│   ├─ AMAZON\.COM.*KINDLE.*           12 matches    [✎] │
│   │  └─ Category: Subscriptions > Streaming (override)  │
│   ├─ AMZN\*DIGITAL.*                 8 matches     [✎] │
│   ├─ PRIME VIDEO.*                   4 matches     [✎] │
│   │  └─ Category: Subscriptions > Streaming (override)  │
│   └─ AMAZON FRESH.*                  3 matches     [✎] │
│       └─ Category: Shopping > Groceries (override)      │
│                                                         │
│ ▼ Netflix (1 rule)                Subscriptions > Stream│
│   └─ NETFLIX.*                       12 matches    [✎] │
│                                                         │
│ ▼ Uber (2 rules)                   Transportation       │
│   ├─ UBER \*TRIP.*                   28 matches    [✎] │
│   └─ UBER EATS.*                     15 matches    [✎] │
│       └─ Category: Dining > Delivery (override)         │
└─────────────────────────────────────────────────────────┘
```

**RuleEditModal Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Edit Rule                                          [X]  │
├─────────────────────────────────────────────────────────┤
│ Merchant: Amazon                                        │
│                                                         │
│ Pattern                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ AMZN.*KINDLE.*                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│ ✓ Valid regex pattern                                   │
│                                                         │
│ Category Override                                       │
│ ☑ Override merchant's default category                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Subscriptions > Streaming                      [▼]  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Match Preview                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 12 transactions will match                          │ │
│ │ ─────────────────────────────────────               │ │
│ │ Jan 18  AMZN*KINDLE*1234     -€9.99                │ │
│ │ Jan 15  AMZN*KINDLE*5678     -€9.99                │ │
│ │ Dec 18  AMZN*KINDLE*9012     -€9.99                │ │
│ │ + 9 more                                            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│                              [Cancel]  [Save Changes]   │
└─────────────────────────────────────────────────────────┘
```

### Project Structure for This Story

```
src/
├── routes/
│   └── rules.tsx (new)
├── features/
│   └── rules/
│       ├── components/
│       │   ├── RulesPage/
│       │   │   ├── index.tsx (new)
│       │   │   └── RulesPage.test.tsx (new)
│       │   ├── RulesListByMerchant/
│       │   │   ├── index.tsx (new)
│       │   │   └── RulesListByMerchant.test.tsx (new)
│       │   ├── RuleRow/
│       │   │   ├── index.tsx (new)
│       │   │   └── RuleRow.test.tsx (new)
│       │   ├── RuleEditModal/
│       │   │   ├── index.tsx (new)
│       │   │   └── RuleEditModal.test.tsx (new)
│       │   └── DeleteRuleConfirmation/
│       │       ├── index.tsx (new)
│       │       └── DeleteRuleConfirmation.test.tsx (new)
│       ├── hooks/
│       │   ├── useRuleMutations.ts (new)
│       │   ├── useRuleMutations.test.ts (new)
│       │   ├── useRuleMatchPreview.ts (new)
│       │   └── useRuleMatchPreview.test.ts (new)
│       ├── services/
│       │   ├── RulesEngine.ts (existing from 4.5)
│       │   ├── ruleOperations.ts (new)
│       │   └── ruleOperations.test.ts (new)
│       ├── utils/
│       │   ├── validateRulePattern.ts (new)
│       │   └── validateRulePattern.test.ts (new)
│       └── index.ts (update exports)
├── components/
│   └── Layout/
│       └── Sidebar.tsx (modify - add Rules nav)
```

### Dependencies on Previous Stories

This story depends on:

- **Story 1.3:** App Shell with Linear Layout (sidebar navigation structure)
- **Story 3.2:** Keyboard Navigation with J/K (keyboard navigation patterns)
- **Story 4.1:** Category System Setup (category picker, category types)
- **Story 4.3:** Create Merchant with Rule (Rule and Merchant types, rules table)
- **Story 4.4:** Assign Transaction to Existing Merchant (categoryOverrideId logic)
- **Story 4.5:** Rules Engine - Auto-Apply on Import (RulesEngine service, applyRulesToTransactions)

### Preparation for Future Stories

This story provides foundation for:

- **Story 5.2:** Batch Merchant Assignment - uses similar rule preview pattern
- **Story 7.2:** Merchant Detail Page - links to rules for that merchant
- **Story 9.5:** Anomaly Detection - builds on transaction re-evaluation pattern

### Integration Points

**From Story 4.5 (Rules Engine):**

Reuse the `applyRulesToTransactions` and `applyMatchResults` functions for re-evaluating transactions after rule edits:

```typescript
import { applyRulesToTransactions, applyMatchResults } from './services/RulesEngine'

// After rule pattern changes, re-evaluate affected transactions
const reeval = await applyRulesToTransactions(affectedTransactionIds)
await applyMatchResults(reeval.matched)
```

**From Story 4.3 (Merchant Assignment Modal):**

Similar modal patterns and category picker component:
- Reuse category selection dropdown from MerchantAssignmentModal
- Same modal styling and structure from shadcn Dialog

**From Story 3.2 (Keyboard Navigation):**

Integrate with existing keyboard context:
- J/K navigation in rules list
- Focus management patterns
- Escape to clear focus

### Styling Guidelines

**Source: [ux-design-specification.md#Visual-Design]**

| Element | Style |
|---------|-------|
| Rule pattern | `font-mono` (JetBrains Mono), `text-sm` |
| Match count | Muted text color, right-aligned |
| Category badge | shadcn Badge component, colored by category |
| Override label | `text-xs`, muted, "(override)" suffix |
| Row height | 48px (consistent with transaction rows) |
| Icons | Lucide React, 16px size |
| Focus ring | Consistent with other list items |

### Dexie Queries

**Load rules with merchants:**

```typescript
// In RulesListByMerchant component
const rulesWithMerchants = useLiveQuery(async () => {
  const rules = await db.rules.toArray()
  const merchants = await db.merchants.toArray()
  const merchantMap = new Map(merchants.map(m => [m.id, m]))

  // Group rules by merchant
  const grouped = new Map<string, { merchant: Merchant; rules: Rule[] }>()

  for (const rule of rules) {
    const merchant = merchantMap.get(rule.merchantId)
    if (!merchant) continue

    if (!grouped.has(merchant.id)) {
      grouped.set(merchant.id, { merchant, rules: [] })
    }
    grouped.get(merchant.id)!.rules.push(rule)
  }

  // Sort: most rules first, then alphabetically
  return Array.from(grouped.values()).sort((a, b) => {
    if (a.rules.length !== b.rules.length) {
      return b.rules.length - a.rules.length
    }
    return a.merchant.name.localeCompare(b.merchant.name)
  })
})
```

**Match preview query (debounced):**

```typescript
// In useRuleMatchPreview hook
const matchingTransactions = useLiveQuery(
  async () => {
    if (!isValidPattern) return []
    try {
      const regex = new RegExp(debouncedPattern, 'i')
      const allTransactions = await db.transactions.toArray()
      return allTransactions.filter(tx => regex.test(tx.rawMerchantString))
    } catch {
      return []
    }
  },
  [debouncedPattern, isValidPattern]
)
```

### Error Handling

| Scenario | Response |
|----------|----------|
| Invalid regex on save | Disable save button, show inline error |
| Database error on update | Toast with "Failed to update rule" and retry option |
| Database error on delete | Toast with "Failed to delete rule" and retry option |
| Undo timeout (>10s) | Undo no longer available, action is permanent |
| Rule not found | Toast with "Rule not found" (edge case, shouldn't happen) |

### Testing Scenarios

**Unit Tests for validateRulePattern:**

```typescript
describe('validateRulePattern', () => {
  it('should return valid for simple pattern', () => {
    expect(validateRulePattern('AMZN.*')).toEqual({ isValid: true, error: null })
  })

  it('should return invalid for empty pattern', () => {
    expect(validateRulePattern('')).toEqual({
      isValid: false,
      error: 'Pattern cannot be empty'
    })
  })

  it('should return invalid for bad regex', () => {
    const result = validateRulePattern('[invalid')
    expect(result.isValid).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
```

**Integration Tests for RulesPage:**

```typescript
describe('RulesPage', () => {
  it('should display rules grouped by merchant', async () => {
    // Setup: Create merchants with rules
    // Render: RulesPage
    // Assert: Merchants appear as collapsible sections with their rules
  })

  it('should update match preview when pattern changes', async () => {
    // Setup: Create transactions
    // Render: Open RuleEditModal
    // Act: Type new pattern
    // Assert: Match count updates after debounce
  })

  it('should re-evaluate transactions when rule is saved', async () => {
    // Setup: Create rule matching some transactions
    // Act: Edit pattern to match different transactions
    // Assert: Previous transactions unmatched, new transactions matched
  })

  it('should restore rule and transactions on undo after delete', async () => {
    // Setup: Create rule with matched transactions
    // Act: Delete rule
    // Assert: Transactions become unmatched
    // Act: Click undo within 10 seconds
    // Assert: Rule restored, transactions re-matched
  })
})
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate Dexie data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT block UI during rule operations (use async operations)
- DO NOT forget to use Dexie transactions for multi-table updates

### Validation Checklist

Before marking complete:
- [ ] RulesPage displays all rules grouped by merchant
- [ ] Rule patterns displayed in monospace font
- [ ] Match counts shown for each rule
- [ ] Category override clearly indicated
- [ ] Edit button opens RuleEditModal
- [ ] Pattern validation shows errors for invalid regex
- [ ] Match preview updates when pattern changes
- [ ] Save button disabled when pattern invalid
- [ ] Saving rule re-evaluates transactions
- [ ] Toast confirms save with Undo option
- [ ] Delete confirmation shows affected transaction count
- [ ] Deleting rule clears affected transactions
- [ ] Toast confirms delete with Undo option
- [ ] Undo restores rule and re-matches transactions
- [ ] J/K keyboard navigation works
- [ ] Search filters rules by pattern and merchant
- [ ] Empty state shown when no rules
- [ ] Rules link added to sidebar navigation
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-4-Story-4.6-View-and-Manage-Rules]
- [Source: prd.md#FR10 - User can edit existing rules]
- [Source: prd.md#FR11 - User can delete rules]
- [Source: prd.md#FR12 - User can view all defined rules]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Keyboard-First-UX]
- [Story 1.3: Create App Shell with Linear Layout]
- [Story 3.2: Keyboard Navigation with J/K]
- [Story 4.1: Category System Setup]
- [Story 4.3: Create Merchant with Rule (R key)]
- [Story 4.4: Assign Transaction to Existing Merchant]
- [Story 4.5: Rules Engine - Auto-Apply on Import]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
