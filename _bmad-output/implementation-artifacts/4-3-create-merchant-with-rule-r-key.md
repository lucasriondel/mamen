# Story 4.3: Create Merchant with Rule (R Key)

Status: ready-for-dev

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

- [ ] Task 1: Create Merchant TypeScript types (AC: #1, #4)
  - [ ] Create `src/types/merchant.types.ts`
  - [ ] Define `Merchant` type with: `id`, `name`, `slug`, `defaultCategoryId`, `createdAt`, `updatedAt`, `firstSeenAt`
  - [ ] Define `MerchantWithRules` type for nested view
  - [ ] Use `type` not `interface` per project conventions
  - [ ] Export all types as named exports

- [ ] Task 2: Create Rule TypeScript types (AC: #2, #3)
  - [ ] Create `src/types/rule.types.ts`
  - [ ] Define `Rule` type with: `id`, `merchantId`, `pattern`, `categoryOverrideId?`, `matchCount`, `createdAt`
  - [ ] Use `type` not `interface`
  - [ ] Export all types as named exports

- [ ] Task 3: Create Zod validation schemas (AC: #1, #2)
  - [ ] Create `src/lib/schemas/merchant.schema.ts`
  - [ ] Create `src/lib/schemas/rule.schema.ts`
  - [ ] Define `merchantSchema` with required fields
  - [ ] Define `ruleSchema` with pattern validation (valid regex)
  - [ ] Export schemas as named exports

- [ ] Task 4: Add merchants and rules tables to Dexie schema (AC: #1)
  - [ ] Modify `src/lib/db/schema.ts`
  - [ ] Add `merchants` table: `id, name, slug, defaultCategoryId`
  - [ ] Add `rules` table: `id, merchantId, pattern`
  - [ ] Increment database version for migration
  - [ ] Export tables from db instance

- [ ] Task 5: Create rule matching service (AC: #2, #3)
  - [ ] Create `src/features/rules/services/ruleEngine.ts`
  - [ ] Create `src/features/rules/services/ruleEngine.test.ts`
  - [ ] Function: `getMatchingTransactions(pattern: string)` - returns transactions matching regex
  - [ ] Function: `countMatches(pattern: string)` - returns count of matching transactions
  - [ ] Function: `generatePatternSuggestions(rawMerchantString: string)` - returns pattern options
  - [ ] Pattern suggestions logic:
    - Exact match: escape the full string
    - Prefix match: find common prefix, add `.*`
    - Clean string: remove transaction-specific IDs
  - [ ] Handle invalid regex gracefully

- [ ] Task 6: Create useMerchants hook (AC: #4)
  - [ ] Create `src/hooks/useMerchants.ts`
  - [ ] Create `src/hooks/useMerchants.test.ts`
  - [ ] Use `useLiveQuery` to fetch all merchants
  - [ ] Function: `createMerchant(merchant, rule)` - creates merchant with first rule
  - [ ] Function: `getMerchantByName(name: string)` - for duplicate checking
  - [ ] Return: `merchants`, `createMerchant`, `isLoading`
  - [ ] Named exports only

- [ ] Task 7: Create pattern string cleaning utility (AC: #2)
  - [ ] Create `src/lib/utils/patternUtils.ts`
  - [ ] Create `src/lib/utils/patternUtils.test.ts`
  - [ ] Function: `cleanMerchantString(raw: string)` - removes IDs, normalizes
  - [ ] Function: `escapeRegex(str: string)` - escapes special regex chars
  - [ ] Function: `extractPrefix(str: string)` - finds common prefix pattern
  - [ ] Function: `validateRegexPattern(pattern: string)` - returns { valid, error? }
  - [ ] Examples:
    - "AMZN*1234XYZ" → cleaned: "Amazon", prefix: "AMZN.*"
    - "UBER TRIP 5678" → cleaned: "Uber", prefix: "UBER TRIP.*"

- [ ] Task 8: Create MerchantAssignmentModal component (AC: #1, #2, #4, #5)
  - [ ] Create `src/features/merchants/components/MerchantAssignmentModal/index.tsx`
  - [ ] Create `src/features/merchants/components/MerchantAssignmentModal/MerchantAssignmentModal.test.tsx`
  - [ ] Use shadcn Dialog as base
  - [ ] Props: `open`, `onOpenChange`, `transaction`, `onComplete`
  - [ ] Sections:
    - Header: "Assign to Merchant"
    - Transaction display (raw string)
    - Merchant selection (New/Existing toggle)
    - Pattern suggestions (radio group)
    - Category picker (from Story 4.1)
    - Match preview
    - Footer: Cancel, Create

- [ ] Task 9: Create PatternSuggestionRadioGroup component (AC: #2, #3)
  - [ ] Create `src/features/merchants/components/PatternSuggestionRadioGroup/index.tsx`
  - [ ] Create test file co-located
  - [ ] Use shadcn RadioGroup as base
  - [ ] Props: `suggestions`, `value`, `onChange`, `onCustomMode`
  - [ ] Each option shows: pattern (monospace), match count
  - [ ] Include "Custom pattern..." option
  - [ ] Live match count updates as pattern changes (<100ms)

- [ ] Task 10: Create MatchPreviewList component (AC: #3)
  - [ ] Create `src/features/merchants/components/MatchPreviewList/index.tsx`
  - [ ] Create test file co-located
  - [ ] Props: `pattern`, `maxVisible` (default 3)
  - [ ] Use `useLiveQuery` to get matching transactions
  - [ ] Display: transaction string, amount, date
  - [ ] Show "and X more" if matches > maxVisible
  - [ ] Expandable to show all matches
  - [ ] Update in real-time as pattern changes

- [ ] Task 11: Implement R key keyboard shortcut (AC: #1)
  - [ ] Modify existing keyboard navigation from Story 3.2
  - [ ] Add handler for `R` key when transaction is focused
  - [ ] Open MerchantAssignmentModal with focused transaction
  - [ ] Prevent activation when in input fields
  - [ ] Track modal state to prevent double-opening

- [ ] Task 12: Implement Shift+R power mode (AC: #6)
  - [ ] Add handler for `Shift+R` key combination
  - [ ] Open MerchantAssignmentModal in "power mode"
  - [ ] Power mode shows:
    - Raw regex input field
    - Live validation indicator (✓ valid / ✗ invalid)
    - Error message for invalid patterns
  - [ ] Include regex cheatsheet popover (via [?] icon)

- [ ] Task 13: Create RegexCheatsheet popover (AC: #6)
  - [ ] Create `src/components/RegexCheatsheet/index.tsx`
  - [ ] Use shadcn Popover
  - [ ] Content:
    - `.*` - any characters
    - `^ABC` - starts with ABC
    - `XYZ$` - ends with XYZ
    - `[0-9]+` - one or more digits
    - `ABC|DEF` - matches ABC or DEF
    - `\.` - literal dot
    - `\*` - literal asterisk
  - [ ] Trigger: [?] icon button

- [ ] Task 14: Implement merchant and rule creation (AC: #5)
  - [ ] In modal submit handler:
    - Validate all inputs
    - Create merchant in Dexie
    - Create rule linked to merchant
    - Apply rule to matching transactions
    - Update transactions with merchantId and categoryId
  - [ ] Use Dexie transaction for atomicity
  - [ ] Return count of updated transactions

- [ ] Task 15: Implement transaction update on rule creation (AC: #5)
  - [ ] Create `src/features/rules/services/applyRule.ts`
  - [ ] Function: `applyRuleToTransactions(rule: Rule, categoryId: string)`
  - [ ] Find all transactions matching rule.pattern
  - [ ] Update each with: `merchantId`, `categoryId`
  - [ ] Use Dexie bulkUpdate for performance
  - [ ] Return count of updated transactions

- [ ] Task 16: Implement toast feedback with undo (AC: #5)
  - [ ] Show toast on successful creation: "X transactions → [Merchant Name]"
  - [ ] Include Undo action button
  - [ ] Undo function:
    - Delete the rule
    - Delete the merchant (if no other rules)
    - Reset transactions to null merchantId/categoryId
  - [ ] 10-second undo window (per UX spec)
  - [ ] Use shadcn Toast component

- [ ] Task 17: Integrate CategoryPicker from Story 4.1 (AC: #4)
  - [ ] Import CategoryPicker component
  - [ ] Add to modal form
  - [ ] Checkbox: "Set as default category for this merchant"
  - [ ] When checked, category is saved to merchant.defaultCategoryId
  - [ ] Category selection required to enable Create button

- [ ] Task 18: Handle duplicate merchant names (AC: #4)
  - [ ] Check if merchant name already exists
  - [ ] If exists, show warning: "Merchant '[name]' already exists"
  - [ ] Offer: "Add rule to existing" or "Create with different name"
  - [ ] Prevent accidental duplicate merchants

- [ ] Task 19: Write comprehensive tests (AC: all)
  - [ ] Rule engine tests:
    - Test: pattern matching works correctly
    - Test: invalid regex handled gracefully
    - Test: pattern suggestions generated correctly
    - Test: match count updates in real-time
  - [ ] MerchantAssignmentModal tests:
    - Test: opens on R key press
    - Test: displays transaction string
    - Test: pattern suggestions shown
    - Test: category picker works
    - Test: Create button enabled when form valid
    - Test: closes and shows toast on success
  - [ ] Pattern utilities tests:
    - Test: string cleaning removes IDs
    - Test: regex escaping works
    - Test: prefix extraction works
  - [ ] Integration tests:
    - Test: R key opens modal
    - Test: full flow creates merchant and updates transactions

- [ ] Task 20: Accessibility compliance (AC: all)
  - [ ] Modal:
    - `role="dialog"` with `aria-labelledby`
    - Focus trap when open
    - Escape closes modal
    - Focus returns to trigger on close
  - [ ] Pattern suggestions:
    - `role="radiogroup"` with `aria-label`
    - Arrow keys navigate options
    - Space/Enter selects option
  - [ ] Regex validation:
    - Error announced to screen reader
    - `aria-invalid` on input when invalid
  - [ ] Live match count:
    - `aria-live="polite"` for count updates

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
