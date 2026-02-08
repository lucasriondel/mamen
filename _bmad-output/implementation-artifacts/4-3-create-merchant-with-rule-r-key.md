# Story 4.3: Create Merchant with Rule (R Key)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to create a new merchant with a matching rule from a transaction**,
So that **similar transactions are automatically categorized in the future (FR7, FR8, FR13)**.

## Acceptance Criteria

1. **Given** I have focused a transaction (with J/K)
   **When** I press `R`
   **Then** the Merchant Assignment Modal opens
   **And** the transaction's raw merchant string is displayed
   **And** "New merchant" is selected by default

2. **Given** the modal is open for a new merchant
   **When** I view the form
   **Then** I see a merchant name input (pre-filled with cleaned merchant string)
   **And** I see pattern suggestions:
     - Exact match: "AMZN*1234XYZ" (1 transaction)
     - Prefix match: "AMZN*" (X transactions) - if common prefix found
     - Custom pattern option
   **And** each suggestion shows live match count

3. **Given** I select a pattern suggestion
   **When** the match count updates
   **Then** I see how many transactions will be categorized
   **And** a preview list shows sample matching transactions (first 3 + "and X more")

4. **Given** I fill out the merchant form
   **When** I enter merchant name, select pattern, select category
   **Then** the "Create" button is enabled
   **And** I can check "Set as default category for this merchant"

5. **Given** I click "Create" (or press Enter)
   **When** the merchant and rule are saved
   **Then** the modal closes
   **And** all matching transactions are assigned to the merchant
   **And** matching transactions receive the selected category
   **And** a toast shows: "X transactions → [Merchant Name]" with Undo

6. **Given** I want power-user regex mode
   **When** I press `Shift+R` or select "Custom pattern"
   **Then** I can enter a raw regex pattern
   **And** live validation shows if pattern is valid
   **And** a regex cheatsheet is available via [?] icon

## Tasks / Subtasks

- [x] Task 1: Create Merchant TypeScript types (AC: #1, #4)
  - [x] Create `src/types/merchant.types.ts` (pre-existing from earlier stories)
  - [x] Define `Merchant` type with: `id`, `name`, `defaultCategoryId`, `createdAt`, `firstSeen`
  - [x] Use `type` not `interface` per project conventions
  - [x] Export all types as named exports

- [x] Task 2: Create Rule TypeScript types (AC: #2, #3)
  - [x] Create `src/types/rule.types.ts` (pre-existing from earlier stories)
  - [x] Define `Rule` type with: `id`, `merchantId`, `pattern`, `categoryOverride?`, `matchCount`, `createdAt`
  - [x] Use `type` not `interface`
  - [x] Export all types as named exports

- [x] Task 3: Create Zod validation schemas (AC: #1, #2)
  - [x] Create `src/lib/schemas/merchant.schema.ts` (pre-existing)
  - [x] Create `src/lib/schemas/rule.schema.ts` (pre-existing)
  - [x] Define `merchantSchema` with required fields
  - [x] Define `ruleSchema` with pattern validation (valid regex)
  - [x] Export schemas as named exports

- [x] Task 4: Add merchants and rules tables to Dexie schema (AC: #1)
  - [x] `src/lib/db/schema.ts` already has merchants and rules tables (v4)
  - [x] merchants: `++id, name, defaultCategoryId, firstSeen`
  - [x] rules: `++id, merchantId, pattern`
  - [x] Tables already exported from db instance

- [x] Task 5: Create rule matching service (AC: #2, #3)
  - [x] Create `src/features/rules/services/ruleEngine.ts`
  - [x] Create `src/features/rules/services/ruleEngine.test.ts` (10 tests)
  - [x] Function: `getMatchingTransactions(pattern: string)`
  - [x] Function: `countMatches(pattern: string)`
  - [x] Function: `generatePatternSuggestions(rawMerchantString: string)`
  - [x] Pattern suggestions: exact match + prefix match
  - [x] Handle invalid regex gracefully (returns 0/empty)

- [x] Task 6: Create useMerchants hook (AC: #4)
  - [x] Create `src/hooks/useMerchants.ts`
  - [x] Use `useLiveQuery` to fetch all merchants
  - [x] Function: `createMerchant(name, defaultCategoryId)`
  - [x] Function: `getMerchantByName(name: string)`
  - [x] Return: `merchants`, `createMerchant`, `isLoading`
  - [x] Named exports only

- [x] Task 7: Create pattern string cleaning utility (AC: #2)
  - [x] Create `src/lib/utils/patternUtils.ts`
  - [x] Create `src/lib/utils/patternUtils.test.ts` (19 tests)
  - [x] Function: `cleanMerchantString(raw: string)`
  - [x] Function: `escapeRegex(str: string)`
  - [x] Function: `extractPrefix(str: string)`
  - [x] Function: `validateRegexPattern(pattern: string)`

- [x] Task 8: Create MerchantAssignmentModal component (AC: #1, #2, #4, #5)
  - [x] Create `src/features/merchants/components/MerchantAssignmentModal/index.tsx`
  - [x] Create `src/features/merchants/components/MerchantAssignmentModal/MerchantAssignmentModal.test.tsx` (14 tests)
  - [x] Use shadcn Dialog as base
  - [x] Props: `open`, `onOpenChange`, `transaction`, `powerMode`, `onComplete`
  - [x] Sections: Header, Transaction display, Merchant name, Pattern suggestions, Category picker, Match preview, Footer

- [x] Task 9: Create PatternSuggestionRadioGroup component (AC: #2, #3)
  - [x] Create `src/features/merchants/components/PatternSuggestionRadioGroup/index.tsx`
  - [x] Use shadcn RadioGroup as base
  - [x] Props: `suggestions`, `value`, `onChange`, `onCustomMode`
  - [x] Each option shows: pattern (monospace), match count
  - [x] Include "Custom pattern..." option

- [x] Task 10: Create MatchPreviewList component (AC: #3)
  - [x] Create `src/components/MatchPreviewList/index.tsx`
  - [x] Props: `pattern`, `maxVisible` (default 3)
  - [x] Use `useLiveQuery` to get matching transactions
  - [x] Display: transaction string, amount, date
  - [x] Show "and X more" if matches > maxVisible
  - [x] Expandable to show all matches
  - [x] Update in real-time as pattern changes

- [x] Task 11: Implement R key keyboard shortcut (AC: #1)
  - [x] Extended `useKeyboardNavigation` hook with `onAction` callback
  - [x] Add handler for `R` key when transaction is focused
  - [x] Open MerchantAssignmentModal with focused transaction
  - [x] Prevent activation when in input fields
  - [x] Track modal state to prevent double-opening

- [x] Task 12: Implement Shift+R power mode (AC: #6)
  - [x] Shift+R detected via `action.shiftKey` in `onAction` callback
  - [x] Opens MerchantAssignmentModal with `powerMode=true`
  - [x] Power mode shows: raw regex input, live validation, error messages
  - [x] Include regex cheatsheet popover (via [?] icon)

- [x] Task 13: Create RegexCheatsheet popover (AC: #6)
  - [x] Create `src/components/RegexCheatsheet/index.tsx`
  - [x] Use shadcn Popover
  - [x] Content: 7 common regex patterns with descriptions
  - [x] Trigger: [?] icon button

- [x] Task 14: Implement merchant and rule creation (AC: #5)
  - [x] Modal submit handler validates all inputs
  - [x] Creates merchant in Dexie via useMerchants hook
  - [x] Creates rule linked to merchant
  - [x] Applies rule to matching transactions via applyRuleToTransactions
  - [x] Uses Dexie transaction for atomicity in applyRule

- [x] Task 15: Implement transaction update on rule creation (AC: #5)
  - [x] Create `src/features/rules/services/applyRule.ts`
  - [x] Function: `applyRuleToTransactions(rule, categoryId)` returns { count, affectedIds }
  - [x] Find all transactions matching rule.pattern
  - [x] Update each with: `merchantId`, `categoryId`
  - [x] Uses Dexie transaction for batch updates
  - [x] Create `src/features/rules/services/applyRule.test.ts` (4 tests)

- [x] Task 16: Implement toast feedback with undo (AC: #5)
  - [x] Show toast: "X transactions → [Merchant Name]"
  - [x] Include Undo action button
  - [x] Undo function: `undoRuleApplication` in applyRule.ts
  - [x] 10-second undo window (duration: 10000)
  - [x] Uses Sonner toast (project standard)

- [x] Task 17: Integrate CategoryPicker from Story 4.1 (AC: #4)
  - [x] Import CategoryPicker component in modal
  - [x] Wrapped in Popover for dropdown behavior
  - [x] Checkbox: "Set as default category for this merchant"
  - [x] When checked, category is saved to merchant.defaultCategoryId
  - [x] Category selection required to enable Create button

- [x] Task 18: Handle duplicate merchant names (AC: #4)
  - [x] Debounced check (300ms) if merchant name already exists
  - [x] Shows warning: "Merchant '[name]' already exists"
  - [x] Disables Create button when duplicate detected

- [x] Task 19: Write comprehensive tests (AC: all)
  - [x] Rule engine tests: 10 tests (pattern matching, invalid regex, suggestions, match count)
  - [x] MerchantAssignmentModal tests: 14 tests (display, form, validation, interactions)
  - [x] Pattern utilities tests: 19 tests (cleaning, escaping, prefix extraction, validation)
  - [x] ApplyRule tests: 4 tests (apply transactions, update match count, undo, keep merchant)

- [x] Task 20: Accessibility compliance (AC: all)
  - [x] Modal: `aria-labelledby`, focus trap (via shadcn Dialog), Escape closes
  - [x] Pattern suggestions: `aria-label="Pattern suggestions"` on RadioGroup
  - [x] Regex validation: `aria-invalid`, `aria-describedby` for error, `role="alert"` on errors
  - [x] Live match count: `aria-live="polite"` for count updates
  - [x] Duplicate warning: `role="alert"` for screen readers

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Schema | Dexie tables with TypeScript types | Type-safe, simple |
| Validation | Zod schemas | Runtime validation for pattern validation |
| Undo/Redo | Command pattern | Fits 10-second toast undo UX |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |

### UX Design Requirements

**Source: [ux-design-specification.md#Merchant-Assignment-UX]**

The modal structure follows the UX spec exactly:

```
┌─────────────────────────────────────────────────────────────┐
│ Assign to Merchant                                      [×] │
├─────────────────────────────────────────────────────────────┤
│ Transaction: "AMZN*1234XYZ"                                 │
│                                                             │
│ Assign to:                                                  │
│   ○ Existing merchant: [Search..._______________▼]          │
│   ● New merchant: [Amazon___________________]               │
│                                                             │
│ Create rule from pattern:                                   │
│   ○ Exact: "AMZN*1234XYZ" (1 transaction)                   │
│   ● Prefix: "AMZN*" (12 transactions)                       │
│   ○ Custom pattern...                                       │
│                                                             │
│ Category: [Shopping > Online ▼]                             │
│   ☑ Set as default for this merchant                        │
│                                                             │
│ Preview: 12 transactions will match                         │
│   • AMZN*1234XYZ      €29.99                               │
│   • AMZN*5678ABC      €15.00                               │
│   • AMZN*9012DEF      €42.50                               │
│   ... and 9 more                                            │
│                                                             │
│              [Cancel]  [Create ↵]                           │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

**Source: [ux-design-specification.md#Keyboard-Patterns]**

| Shortcut | Action |
|----------|--------|
| `R` | Open merchant assignment (simple mode) |
| `Shift+R` | Open merchant assignment (power mode - regex input) |
| `Enter` | Confirm/Create in modal |
| `Escape` | Close modal |
| `Tab` | Navigate between form fields |
| `↑/↓` | Navigate pattern suggestions |

### Data Model

**Source: [architecture.md#Data-Model]**

```typescript
// src/types/merchant.types.ts

export type Merchant = {
  id: string
  name: string
  slug: string
  defaultCategoryId: string | null
  createdAt: Date
  updatedAt: Date
  firstSeenAt: Date
}

export type MerchantWithRules = Merchant & {
  rules: Rule[]
  transactionCount: number
  totalSpent: number
}
```

```typescript
// src/types/rule.types.ts

export type Rule = {
  id: string
  merchantId: string
  pattern: string
  categoryOverrideId: string | null
  matchCount: number
  createdAt: Date
}
```

### Dexie Schema Update

```typescript
// src/lib/db/schema.ts (additions)

export class MamenDatabase extends Dexie {
  // ... existing tables
  merchants!: Table<Merchant>
  rules!: Table<Rule>

  constructor() {
    super('mamen')

    this.version(3).stores({  // Increment version
      // ... existing tables
      merchants: 'id, name, slug, defaultCategoryId',
      rules: 'id, merchantId, pattern',
    })
  }
}
```

### Pattern Suggestion Algorithm

```typescript
// src/features/rules/services/ruleEngine.ts

export type PatternSuggestion = {
  pattern: string
  label: string
  matchCount: number
  type: 'exact' | 'prefix' | 'custom'
}

export const generatePatternSuggestions = async (
  rawMerchantString: string
): Promise<PatternSuggestion[]> => {
  const suggestions: PatternSuggestion[] = []

  // 1. Exact match (escaped)
  const exactPattern = escapeRegex(rawMerchantString)
  suggestions.push({
    pattern: `^${exactPattern}$`,
    label: `Exact: "${rawMerchantString}"`,
    matchCount: await countMatches(`^${exactPattern}$`),
    type: 'exact',
  })

  // 2. Prefix match
  const prefix = extractPrefix(rawMerchantString)
  if (prefix && prefix.length >= 3) {
    const prefixPattern = `^${escapeRegex(prefix)}.*`
    const prefixCount = await countMatches(prefixPattern)
    if (prefixCount > 1) {
      suggestions.push({
        pattern: prefixPattern,
        label: `Prefix: "${prefix}*"`,
        matchCount: prefixCount,
        type: 'prefix',
      })
    }
  }

  return suggestions
}
```

### String Cleaning Logic

```typescript
// src/lib/utils/patternUtils.ts

export const cleanMerchantString = (raw: string): string => {
  // Remove transaction IDs (common patterns)
  let cleaned = raw
    .replace(/\*[A-Z0-9]{6,}$/i, '')  // AMZN*1234XYZ → AMZN
    .replace(/\s+\d{4,}$/i, '')        // UBER TRIP 5678 → UBER TRIP
    .replace(/\s+#\d+$/i, '')          // STORE #123 → STORE
    .trim()

  // Title case the result
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export const extractPrefix = (str: string): string | null => {
  // Find stable prefix (before transaction-specific part)
  const match = str.match(/^([A-Z]+\*?|[A-Z][a-z]+\s+[A-Z]+)/i)
  return match ? match[1] : null
}

export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const validateRegexPattern = (pattern: string): { valid: boolean; error?: string } => {
  try {
    new RegExp(pattern)
    return { valid: true }
  } catch (e) {
    return { valid: false, error: (e as Error).message }
  }
}
```

### Rule Application Logic

```typescript
// src/features/rules/services/applyRule.ts

import { db } from '@/lib/db'
import { Rule } from '@/types/rule.types'

export const applyRuleToTransactions = async (
  rule: Rule,
  categoryId: string
): Promise<number> => {
  const regex = new RegExp(rule.pattern, 'i')

  // Find matching transactions
  const transactions = await db.transactions
    .filter(tx => regex.test(tx.rawMerchantString))
    .toArray()

  // Update all matching transactions
  await db.transaction('rw', db.transactions, async () => {
    for (const tx of transactions) {
      await db.transactions.update(tx.id, {
        merchantId: rule.merchantId,
        categoryId: categoryId,
        updatedAt: new Date(),
      })
    }
  })

  // Update rule match count
  await db.rules.update(rule.id, { matchCount: transactions.length })

  return transactions.length
}
```

### Undo Implementation

```typescript
// Undo data structure stored temporarily

type UndoAction = {
  type: 'create-merchant'
  merchantId: string
  ruleId: string
  affectedTransactionIds: string[]
  previousState: { merchantId: null; categoryId: null }[]
}

const performUndo = async (action: UndoAction): Promise<void> => {
  await db.transaction('rw', [db.merchants, db.rules, db.transactions], async () => {
    // Delete the rule
    await db.rules.delete(action.ruleId)

    // Delete the merchant (if no other rules)
    const remainingRules = await db.rules.where('merchantId').equals(action.merchantId).count()
    if (remainingRules === 0) {
      await db.merchants.delete(action.merchantId)
    }

    // Reset transactions
    for (let i = 0; i < action.affectedTransactionIds.length; i++) {
      await db.transactions.update(action.affectedTransactionIds[i], {
        merchantId: null,
        categoryId: null,
        updatedAt: new Date(),
      })
    }
  })
}
```

### Project Structure for This Story

```
src/
├── types/
│   ├── merchant.types.ts (new)
│   └── rule.types.ts (new)
├── lib/
│   ├── db/
│   │   └── schema.ts (modify - add merchants, rules tables)
│   ├── schemas/
│   │   ├── merchant.schema.ts (new)
│   │   └── rule.schema.ts (new)
│   └── utils/
│       ├── patternUtils.ts (new)
│       └── patternUtils.test.ts (new)
├── hooks/
│   ├── useMerchants.ts (new)
│   └── useMerchants.test.ts (new)
├── features/
│   ├── merchants/
│   │   ├── components/
│   │   │   ├── MerchantAssignmentModal/
│   │   │   │   ├── index.tsx (new)
│   │   │   │   └── MerchantAssignmentModal.test.tsx (new)
│   │   │   └── PatternSuggestionRadioGroup/
│   │   │       ├── index.tsx (new)
│   │   │       └── PatternSuggestionRadioGroup.test.tsx (new)
│   │   └── index.ts
│   └── rules/
│       ├── services/
│       │   ├── ruleEngine.ts (new)
│       │   ├── ruleEngine.test.ts (new)
│       │   ├── applyRule.ts (new)
│       │   └── applyRule.test.ts (new)
│       └── index.ts
└── components/
    ├── MatchPreviewList/
    │   ├── index.tsx (new)
    │   └── MatchPreviewList.test.tsx (new)
    └── RegexCheatsheet/
        └── index.tsx (new)
```

### Dependencies on Previous Stories

This story depends on:
- **Story 3.2:** Keyboard navigation with J/K (extend with R key)
- **Story 4.1:** Category system setup (CategoryPicker, CategoryBadge)
- **Story 4.2:** Unmatched transactions view (operates on unmatched transactions)

### Preparation for Future Stories

This story is a **foundation** for:
- **Story 4.4:** Assign to Existing Merchant - reuses MerchantAssignmentModal
- **Story 4.5:** Rules Engine Auto-Apply on Import - reuses applyRule service
- **Story 4.6:** View and Manage Rules - reuses rule data model
- **Story 4.8:** Cascade Animation Feedback - triggered by rule application

### Integration Points

**From Story 4.1:**
- Import `CategoryPicker` for category selection
- Import `useCategories` for category data
- Import `CategoryBadge` for preview display

**From Story 4.2:**
- Use `FocusModeContext` to know if we're in unmatched view
- After creating merchant, unmatched count auto-updates via Dexie live queries

**From Story 3.2:**
- Extend keyboard handler with R and Shift+R
- Access focused transaction from keyboard context

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Pattern match count | <100ms | Dexie filter on indexed field |
| Modal open | <50ms | Lazy load modal content |
| Preview update | <100ms | Debounce pattern changes |
| Transaction bulk update | <1s for 100 txns | Dexie bulkUpdate |

- Pattern matching queries should use Dexie's built-in filter
- Debounce pattern input to avoid excessive queries
- Use virtual list in preview if many matches
- Batch transaction updates for performance

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT filter all transactions in-memory for pattern matching (use Dexie)

### Error Handling

| Scenario | Response |
|----------|----------|
| Invalid regex pattern | Show inline error, disable Create button |
| Duplicate merchant name | Show warning, offer options |
| Database error | Toast with error message, don't close modal |
| No matching transactions | Allow creation anyway, show warning |

### Validation Checklist

Before marking complete:
- [ ] R key opens MerchantAssignmentModal
- [ ] Shift+R opens modal in power mode
- [ ] Transaction raw string displayed in modal
- [ ] Merchant name pre-filled with cleaned string
- [ ] Pattern suggestions show with live match counts
- [ ] Custom pattern option available
- [ ] Regex validation shows errors
- [ ] Category picker integrated and working
- [ ] Preview list shows matching transactions
- [ ] Create button enabled when form valid
- [ ] Merchant and rule created in Dexie
- [ ] Matching transactions updated with merchantId/categoryId
- [ ] Toast shows success message with Undo
- [ ] Undo reverts all changes
- [ ] Unmatched count decreases after rule creation
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Accessibility: focus trap, aria labels, screen reader
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### References

- [Source: epics.md#Epic-4-Story-4.3-Create-Merchant-with-Rule]
- [Source: prd.md#FR7 - User can create categorization rules with regex pattern matching]
- [Source: prd.md#FR8 - User can assign categories and subcategories to rules]
- [Source: prd.md#FR13 - User can create a rule directly from a transaction (R key)]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Merchant-Assignment-UX]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Story 3.2: Keyboard navigation with J/K]
- [Story 4.1: Category system setup]
- [Story 4.2: Unmatched transactions view]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Tasks 1-4 were already implemented in prior stories (types, schemas, DB tables pre-existed)
- Pre-existing test failure: `src/routes/accounts.test.tsx` (DOMMatrix/pdfjs-dist in jsdom) - not related to this story

### Completion Notes List

- Implemented full merchant assignment flow: R key → modal → create merchant + rule → apply to transactions → toast with undo
- Reused existing Merchant/Rule types, Zod schemas, and Dexie tables from prior stories
- Created rule matching engine with pattern suggestions (exact + prefix match)
- Created pattern utilities for string cleaning, regex escaping, prefix extraction, and validation
- Built MerchantAssignmentModal with CategoryPicker integration, pattern radio group, and match preview
- Added R key and Shift+R (power mode with regex input) keyboard shortcuts via extended useKeyboardNavigation hook
- Implemented undo functionality that deletes rule/merchant and resets affected transactions
- Added duplicate merchant name detection with debounced warning
- All accessibility requirements met: aria-labelledby, aria-live, aria-invalid, role=alert, focus trap
- 47 new tests across 4 test files (19 patternUtils + 10 ruleEngine + 4 applyRule + 14 modal)
- 0 TypeScript errors, 472/472 tests pass (1 pre-existing failure unrelated)

### Change Log

- 2026-02-08: Story 4.3 implemented - Create Merchant with Rule (R key)

### File List

New files:
- src/lib/utils/patternUtils.ts
- src/lib/utils/patternUtils.test.ts
- src/features/rules/services/ruleEngine.ts
- src/features/rules/services/ruleEngine.test.ts
- src/features/rules/services/applyRule.ts
- src/features/rules/services/applyRule.test.ts
- src/hooks/useMerchants.ts
- src/features/merchants/components/MerchantAssignmentModal/index.tsx
- src/features/merchants/components/MerchantAssignmentModal/MerchantAssignmentModal.test.tsx
- src/features/merchants/components/PatternSuggestionRadioGroup/index.tsx
- src/components/MatchPreviewList/index.tsx
- src/components/RegexCheatsheet/index.tsx
- src/components/ui/radio-group.tsx (shadcn)
- src/components/ui/checkbox.tsx (shadcn)

Modified files:
- src/hooks/useKeyboardNavigation.ts (added onAction callback + default case for R key)
- src/features/transactions/components/TransactionList/index.tsx (added R key handler + MerchantAssignmentModal)
- src/routes/transactions.tsx (added R key hint in footer)
