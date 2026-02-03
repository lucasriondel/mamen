# Story 4.4: Assign Transaction to Existing Merchant

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to add a new rule to an existing merchant**,
So that **I can capture different transaction string patterns for the same merchant (FR7, FR10)**.

## Acceptance Criteria

1. **Given** the Merchant Assignment Modal is open
   **When** I select "Existing merchant"
   **Then** I see a searchable dropdown of existing merchants
   **And** selecting a merchant shows its current rules

2. **Given** I select an existing merchant
   **When** I view the modal
   **Then** I see the merchant's existing rules listed
   **And** I see options to add a new rule pattern
   **And** the category defaults to the merchant's default category

3. **Given** I want to override the category for this rule
   **When** I check "Override category for this rule"
   **Then** I can select a different category
   **And** this rule will categorize to the override, not merchant default

4. **Given** I add a rule to an existing merchant
   **When** I click "Add Rule"
   **Then** the new rule is saved to the merchant
   **And** matching transactions are assigned to the merchant
   **And** a toast confirms the action with Undo

5. **Given** my new pattern overlaps with another merchant's rule
   **When** conflict is detected
   **Then** I see a warning: "Pattern overlaps with [Other Merchant]"
   **And** I'm informed which is more specific (takes priority)
   **And** I can proceed or adjust

## Tasks / Subtasks

- [ ] Task 1: Add "Existing Merchant" toggle to MerchantAssignmentModal (AC: #1)
  - [ ] Modify `src/features/merchants/components/MerchantAssignmentModal/index.tsx`
  - [ ] Add radio group toggle: "New merchant" / "Existing merchant"
  - [ ] Default to "New merchant" (existing behavior from Story 4.3)
  - [ ] When "Existing merchant" selected, show merchant search dropdown
  - [ ] Hide "New merchant" name input when existing selected
  - [ ] Use `type` not `interface` per conventions

- [ ] Task 2: Create MerchantSearchSelect component (AC: #1)
  - [ ] Create `src/features/merchants/components/MerchantSearchSelect/index.tsx`
  - [ ] Create `src/features/merchants/components/MerchantSearchSelect/MerchantSearchSelect.test.tsx`
  - [ ] Use shadcn Select + Command for searchable dropdown
  - [ ] Props: `value`, `onChange`, `placeholder`
  - [ ] Fetch merchants using `useLiveQuery` from Dexie
  - [ ] Show merchant name + transaction count in each option
  - [ ] Keyboard navigable (↑/↓/Enter)
  - [ ] Fuzzy search on merchant name
  - [ ] Named exports only

- [ ] Task 3: Create MerchantRulesList component (AC: #1, #2)
  - [ ] Create `src/features/merchants/components/MerchantRulesList/index.tsx`
  - [ ] Create `src/features/merchants/components/MerchantRulesList/MerchantRulesList.test.tsx`
  - [ ] Props: `merchantId`
  - [ ] Display list of existing rules for the selected merchant:
    - Pattern (monospace font)
    - Match count
    - Category: "(default)" or "→ [Category Override]"
  - [ ] Use `useLiveQuery` to fetch rules by merchantId
  - [ ] Show "No existing rules" if merchant has no rules yet
  - [ ] Each rule is read-only (editing rules is Story 4.6)

- [ ] Task 4: Update modal state management for existing merchant flow (AC: #1, #2)
  - [ ] Add state: `assignmentMode: 'new' | 'existing'`
  - [ ] Add state: `selectedMerchantId: string | null`
  - [ ] When mode is 'existing' and merchant selected:
    - Load merchant's default category
    - Pre-fill category picker with default
    - Show existing rules list
  - [ ] Reset pattern suggestions when switching merchants
  - [ ] Validate that merchant exists before submission

- [ ] Task 5: Implement category override UI (AC: #2, #3)
  - [ ] Add checkbox: "Override category for this rule"
  - [ ] When unchecked: show "(uses merchant default: [Category])" as hint
  - [ ] When checked: enable category picker dropdown
  - [ ] Category picker shows all categories from Story 4.1
  - [ ] Default to merchant's defaultCategoryId when unchecked
  - [ ] Store override in rule.categoryOverrideId when checked

- [ ] Task 6: Create useExistingMerchant hook (AC: #2)
  - [ ] Create `src/features/merchants/hooks/useExistingMerchant.ts`
  - [ ] Create `src/features/merchants/hooks/useExistingMerchant.test.ts`
  - [ ] Input: `merchantId: string | null`
  - [ ] Return: `{ merchant, rules, isLoading }`
  - [ ] Use `useLiveQuery` to fetch merchant and its rules
  - [ ] Return null if merchantId is null
  - [ ] Named exports only

- [ ] Task 7: Implement addRuleToMerchant service (AC: #4)
  - [ ] Create `src/features/rules/services/addRuleToMerchant.ts`
  - [ ] Create `src/features/rules/services/addRuleToMerchant.test.ts`
  - [ ] Function signature:
    ```typescript
    export const addRuleToMerchant = async (params: {
      merchantId: string
      pattern: string
      categoryOverrideId: string | null
    }): Promise<{ ruleId: string; matchCount: number }>
    ```
  - [ ] Create rule in Dexie linked to merchant
  - [ ] Apply rule to matching transactions (reuse applyRule from Story 4.3)
  - [ ] Return count of updated transactions
  - [ ] Use Dexie transaction for atomicity

- [ ] Task 8: Update modal submit handler for existing merchant (AC: #4)
  - [ ] Check if `assignmentMode === 'existing'`
  - [ ] If existing:
    - Call `addRuleToMerchant` instead of `createMerchant`
    - Use selectedMerchantId
    - Pass categoryOverrideId if override is enabled
  - [ ] If new: existing behavior from Story 4.3
  - [ ] Show appropriate toast: "X transactions → [Merchant Name]" with Undo

- [ ] Task 9: Implement rule conflict detection (AC: #5)
  - [ ] Create `src/features/rules/services/detectRuleConflict.ts`
  - [ ] Create `src/features/rules/services/detectRuleConflict.test.ts`
  - [ ] Function: `detectRuleConflict(pattern: string, excludeMerchantId?: string)`
  - [ ] Check if pattern overlaps with existing rules from OTHER merchants
  - [ ] Return: `{ hasConflict: boolean, conflictingMerchant?: string, specificity: 'more' | 'less' | 'equal' }`
  - [ ] Specificity based on pattern length (longer = more specific)
  - [ ] More specific pattern wins in rules engine

- [ ] Task 10: Display conflict warning in modal (AC: #5)
  - [ ] Run conflict detection when pattern changes
  - [ ] If conflict found, show warning section:
    - "⚠️ Pattern overlaps with [Other Merchant]"
    - Explain specificity: "Your rule is more/less specific and will take priority/be overridden"
  - [ ] Allow user to proceed with warning
  - [ ] Offer "Edit pattern" action to adjust
  - [ ] Warning color styling (amber/warning)

- [ ] Task 11: Update undo handler for existing merchant flow (AC: #4)
  - [ ] Modify undo action from Story 4.3 to handle existing merchant case:
    - Delete the new rule
    - Do NOT delete the merchant (it existed before)
    - Reset affected transactions' merchantId and categoryId
  - [ ] Store undo data: `{ type: 'add-rule', ruleId, affectedTransactionIds, previousState }`
  - [ ] 10-second undo window per UX spec

- [ ] Task 12: Update pattern suggestions for existing merchant (AC: #1)
  - [ ] When existing merchant selected, pattern suggestions should:
    - Still show exact match and prefix match
    - Warn if suggested pattern overlaps with existing merchant rules
    - Show how many NEW transactions will match (excluding already assigned)
  - [ ] Match count should exclude transactions already assigned to this merchant

- [ ] Task 13: Handle duplicate pattern within same merchant (AC: #4)
  - [ ] Check if pattern already exists for selected merchant
  - [ ] If duplicate: show error "This pattern already exists for [Merchant]"
  - [ ] Disable "Add Rule" button until pattern is changed
  - [ ] Inline validation (not just on submit)

- [ ] Task 14: Write comprehensive tests (AC: all)
  - [ ] MerchantSearchSelect tests:
    - Test: displays all merchants
    - Test: fuzzy search filters correctly
    - Test: selection triggers onChange
    - Test: keyboard navigation works
  - [ ] MerchantRulesList tests:
    - Test: displays rules with pattern and match count
    - Test: shows default vs override category indicator
    - Test: handles empty rules list
  - [ ] useExistingMerchant tests:
    - Test: returns merchant and rules for valid id
    - Test: returns null for null merchantId
    - Test: updates reactively on changes
  - [ ] addRuleToMerchant tests:
    - Test: creates rule linked to merchant
    - Test: applies rule to matching transactions
    - Test: handles categoryOverrideId correctly
  - [ ] detectRuleConflict tests:
    - Test: detects overlapping patterns from other merchants
    - Test: excludes current merchant from conflict check
    - Test: returns correct specificity
  - [ ] Modal integration tests:
    - Test: toggle between new/existing mode
    - Test: selecting merchant loads rules
    - Test: category defaults to merchant default
    - Test: override checkbox enables category picker
    - Test: conflict warning displays correctly
    - Test: submit creates rule and applies it
    - Test: undo removes rule without deleting merchant

- [ ] Task 15: Accessibility compliance (AC: all)
  - [ ] MerchantSearchSelect:
    - `role="combobox"` with `aria-expanded`
    - `aria-autocomplete="list"` for search
    - Options have `role="option"`
    - Selected announced to screen reader
  - [ ] MerchantRulesList:
    - `role="list"` with `role="listitem"` for each rule
    - Pattern and match count readable
  - [ ] Category override:
    - Checkbox has associated label
    - State change announced
  - [ ] Conflict warning:
    - `role="alert"` for warning
    - Warning color has text indicator (not color-only)

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Rule Storage | Rules table with merchantId FK | Rules belong to merchants |
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

The modal structure for existing merchant flow:

```
┌─────────────────────────────────────────────────────────────┐
│ Assign to Merchant                                      [×] │
├─────────────────────────────────────────────────────────────┤
│ Transaction: "AMAZON.COM/BILL"                              │
│                                                             │
│ Assign to:                                                  │
│   ● Existing merchant: [Amazon ▼]                           │
│       Current rules: AMZN.*, AMAZON PRIME.*                 │
│   ○ New merchant: [_________________________]               │
│                                                             │
│ Add rule to "Amazon":                                       │
│   ○ Exact: "AMAZON.COM/BILL" (1 transaction)                │
│   ● Prefix: "AMAZON.COM.*" (3 transactions)                 │
│   ○ Custom pattern...                                       │
│                                                             │
│ Category: [Shopping > Online] (merchant default)            │
│   ○ Use merchant default                                    │
│   ○ Override for this rule: [____________▼]                 │
│                                                             │
│ Preview: 3 transactions will be added to "Amazon"           │
│                                                             │
│              [Cancel]  [Add Rule ↵]                         │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

**Source: [ux-design-specification.md#Keyboard-Patterns]**

| Shortcut | Action |
|----------|--------|
| `R` | Open merchant assignment (same modal, can choose existing) |
| `Tab` | Navigate between form fields |
| `↑/↓` | Navigate dropdown options |
| `Enter` | Confirm/Add Rule |
| `Escape` | Close modal |

### Data Model

**Source: [Story 4.3 - merchants and rules tables already created]**

```typescript
// Rule with categoryOverrideId (from Story 4.3)
export type Rule = {
  id: string
  merchantId: string
  pattern: string
  categoryOverrideId: string | null  // null = use merchant default
  matchCount: number
  createdAt: Date
}
```

### MerchantSearchSelect Component

```typescript
// src/features/merchants/components/MerchantSearchSelect/index.tsx

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronsUpDown } from 'lucide-react'
import { db } from '@/lib/db'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type MerchantSearchSelectProps = {
  value: string | null
  onChange: (merchantId: string) => void
  placeholder?: string
}

export const MerchantSearchSelect = ({
  value,
  onChange,
  placeholder = 'Select merchant...',
}: MerchantSearchSelectProps): JSX.Element => {
  const [open, setOpen] = useState(false)

  const merchants = useLiveQuery(async () => {
    const allMerchants = await db.merchants.toArray()
    // Get transaction counts for each merchant
    const withCounts = await Promise.all(
      allMerchants.map(async (m) => ({
        ...m,
        transactionCount: await db.transactions
          .where('merchantId')
          .equals(m.id)
          .count(),
      }))
    )
    return withCounts.sort((a, b) => b.transactionCount - a.transactionCount)
  }, [])

  const selectedMerchant = useMemo(
    () => merchants?.find((m) => m.id === value),
    [merchants, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedMerchant?.name ?? placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search merchants..." />
          <CommandEmpty>No merchant found.</CommandEmpty>
          <CommandGroup>
            {merchants?.map((merchant) => (
              <CommandItem
                key={merchant.id}
                value={merchant.name}
                onSelect={() => {
                  onChange(merchant.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === merchant.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="flex-1">{merchant.name}</span>
                <span className="text-muted-foreground text-sm">
                  {merchant.transactionCount} txns
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

### MerchantRulesList Component

```typescript
// src/features/merchants/components/MerchantRulesList/index.tsx

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useCategories } from '@/hooks/useCategories'

type MerchantRulesListProps = {
  merchantId: string
}

export const MerchantRulesList = ({
  merchantId,
}: MerchantRulesListProps): JSX.Element => {
  const rules = useLiveQuery(
    () => db.rules.where('merchantId').equals(merchantId).toArray(),
    [merchantId]
  )

  const { getCategoryById } = useCategories()

  if (!rules || rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No existing rules
      </p>
    )
  }

  return (
    <ul role="list" className="space-y-1">
      {rules.map((rule) => {
        const overrideCategory = rule.categoryOverrideId
          ? getCategoryById(rule.categoryOverrideId)
          : null

        return (
          <li
            key={rule.id}
            role="listitem"
            className="flex items-center gap-2 text-sm py-1"
          >
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {rule.pattern}
            </code>
            <span className="text-muted-foreground">
              ({rule.matchCount} matches)
            </span>
            {overrideCategory ? (
              <span className="text-muted-foreground">
                → {overrideCategory.name}
              </span>
            ) : (
              <span className="text-muted-foreground">(default)</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

### useExistingMerchant Hook

```typescript
// src/features/merchants/hooks/useExistingMerchant.ts

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Merchant } from '@/types/merchant.types'
import { Rule } from '@/types/rule.types'

type UseExistingMerchantReturn = {
  merchant: Merchant | null
  rules: Rule[]
  isLoading: boolean
}

export const useExistingMerchant = (
  merchantId: string | null
): UseExistingMerchantReturn => {
  const result = useLiveQuery(
    async () => {
      if (!merchantId) {
        return { merchant: null, rules: [] }
      }

      const merchant = await db.merchants.get(merchantId)
      const rules = await db.rules
        .where('merchantId')
        .equals(merchantId)
        .toArray()

      return { merchant: merchant ?? null, rules }
    },
    [merchantId],
    { merchant: null, rules: [] }
  )

  return {
    merchant: result?.merchant ?? null,
    rules: result?.rules ?? [],
    isLoading: result === undefined,
  }
}
```

### addRuleToMerchant Service

```typescript
// src/features/rules/services/addRuleToMerchant.ts

import { db } from '@/lib/db'
import { Rule } from '@/types/rule.types'
import { applyRuleToTransactions } from './applyRule'
import { generateId } from '@/lib/utils/generateId'

type AddRuleToMerchantParams = {
  merchantId: string
  pattern: string
  categoryOverrideId: string | null
}

type AddRuleToMerchantResult = {
  ruleId: string
  matchCount: number
  affectedTransactionIds: string[]
}

export const addRuleToMerchant = async (
  params: AddRuleToMerchantParams
): Promise<AddRuleToMerchantResult> => {
  const { merchantId, pattern, categoryOverrideId } = params

  // Verify merchant exists
  const merchant = await db.merchants.get(merchantId)
  if (!merchant) {
    throw new Error(`Merchant not found: ${merchantId}`)
  }

  // Determine category to apply
  const categoryId = categoryOverrideId ?? merchant.defaultCategoryId

  // Create the rule
  const ruleId = generateId()
  const rule: Rule = {
    id: ruleId,
    merchantId,
    pattern,
    categoryOverrideId,
    matchCount: 0,
    createdAt: new Date(),
  }

  // Use transaction for atomicity
  const result = await db.transaction(
    'rw',
    [db.rules, db.transactions],
    async () => {
      // Add the rule
      await db.rules.add(rule)

      // Apply rule to matching transactions
      const affectedIds = await applyRuleToTransactions(rule, categoryId)

      // Update rule match count
      await db.rules.update(ruleId, { matchCount: affectedIds.length })

      return { ruleId, matchCount: affectedIds.length, affectedTransactionIds: affectedIds }
    }
  )

  return result
}
```

### detectRuleConflict Service

```typescript
// src/features/rules/services/detectRuleConflict.ts

import { db } from '@/lib/db'

type ConflictResult = {
  hasConflict: boolean
  conflictingMerchant?: string
  conflictingPattern?: string
  specificity?: 'more' | 'less' | 'equal'
}

export const detectRuleConflict = async (
  pattern: string,
  excludeMerchantId?: string
): Promise<ConflictResult> => {
  // Get all rules from other merchants
  const allRules = await db.rules.toArray()
  const otherRules = excludeMerchantId
    ? allRules.filter((r) => r.merchantId !== excludeMerchantId)
    : allRules

  // Test new pattern as regex
  let newRegex: RegExp
  try {
    newRegex = new RegExp(pattern, 'i')
  } catch {
    return { hasConflict: false }
  }

  // Check for overlaps with existing rules
  for (const rule of otherRules) {
    try {
      const existingRegex = new RegExp(rule.pattern, 'i')

      // Test with sample strings - check if patterns can match same strings
      // A simple heuristic: extract literal parts and check overlap
      const patternsOverlap = checkPatternOverlap(pattern, rule.pattern)

      if (patternsOverlap) {
        const merchant = await db.merchants.get(rule.merchantId)

        // Compare specificity by pattern length (crude but effective)
        const specificity = compareSpecificity(pattern, rule.pattern)

        return {
          hasConflict: true,
          conflictingMerchant: merchant?.name ?? 'Unknown',
          conflictingPattern: rule.pattern,
          specificity,
        }
      }
    } catch {
      // Invalid regex in existing rule, skip
      continue
    }
  }

  return { hasConflict: false }
}

const checkPatternOverlap = (pattern1: string, pattern2: string): boolean => {
  // Extract literal prefixes for comparison
  const getLiteralPrefix = (pattern: string): string => {
    // Remove regex special chars at start to get literal prefix
    const match = pattern.match(/^\^?([A-Za-z0-9]+)/)
    return match ? match[1].toLowerCase() : ''
  }

  const prefix1 = getLiteralPrefix(pattern1)
  const prefix2 = getLiteralPrefix(pattern2)

  // Patterns overlap if one prefix starts with the other
  return (
    prefix1.length > 0 &&
    prefix2.length > 0 &&
    (prefix1.startsWith(prefix2) || prefix2.startsWith(prefix1))
  )
}

const compareSpecificity = (
  newPattern: string,
  existingPattern: string
): 'more' | 'less' | 'equal' => {
  // Longer patterns are generally more specific
  const newLength = newPattern.replace(/[.*+?^${}()|[\]\\]/g, '').length
  const existingLength = existingPattern.replace(/[.*+?^${}()|[\]\\]/g, '').length

  if (newLength > existingLength) return 'more'
  if (newLength < existingLength) return 'less'
  return 'equal'
}
```

### Modal State Management Updates

```typescript
// In MerchantAssignmentModal - additional state
const [assignmentMode, setAssignmentMode] = useState<'new' | 'existing'>('new')
const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null)
const [categoryOverrideEnabled, setCategoryOverrideEnabled] = useState(false)

const { merchant: existingMerchant, rules: existingRules } = useExistingMerchant(
  assignmentMode === 'existing' ? selectedMerchantId : null
)

// When existing merchant is selected, default category to merchant's default
useEffect(() => {
  if (existingMerchant) {
    setSelectedCategory(existingMerchant.defaultCategoryId)
    setCategoryOverrideEnabled(false)
  }
}, [existingMerchant])

// Submit handler branching
const handleSubmit = async () => {
  if (assignmentMode === 'new') {
    // Existing Story 4.3 flow
    await createMerchantWithRule(...)
  } else {
    // New flow for existing merchant
    if (!selectedMerchantId) return

    const categoryId = categoryOverrideEnabled
      ? selectedCategory
      : existingMerchant?.defaultCategoryId

    const result = await addRuleToMerchant({
      merchantId: selectedMerchantId,
      pattern: selectedPattern,
      categoryOverrideId: categoryOverrideEnabled ? selectedCategory : null,
    })

    // Show toast with undo
    toast({
      title: `${result.matchCount} transactions → ${existingMerchant?.name}`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => handleUndoAddRule(result)}
        >
          Undo
        </ToastAction>
      ),
    })
  }
}
```

### Undo Handler for Existing Merchant

```typescript
// Undo for add-rule operation (doesn't delete merchant)
const handleUndoAddRule = async (result: AddRuleToMerchantResult) => {
  await db.transaction('rw', [db.rules, db.transactions], async () => {
    // Delete the rule
    await db.rules.delete(result.ruleId)

    // Reset affected transactions
    for (const txId of result.affectedTransactionIds) {
      await db.transactions.update(txId, {
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
├── features/
│   └── merchants/
│       ├── components/
│       │   ├── MerchantAssignmentModal/
│       │   │   └── index.tsx (modify - add existing merchant flow)
│       │   ├── MerchantSearchSelect/
│       │   │   ├── index.tsx (new)
│       │   │   └── MerchantSearchSelect.test.tsx (new)
│       │   └── MerchantRulesList/
│       │       ├── index.tsx (new)
│       │       └── MerchantRulesList.test.tsx (new)
│       ├── hooks/
│       │   ├── useExistingMerchant.ts (new)
│       │   └── useExistingMerchant.test.ts (new)
│       └── index.ts (update exports)
└── features/
    └── rules/
        └── services/
            ├── addRuleToMerchant.ts (new)
            ├── addRuleToMerchant.test.ts (new)
            ├── detectRuleConflict.ts (new)
            └── detectRuleConflict.test.ts (new)
```

### Dependencies on Previous Stories

This story depends on:
- **Story 4.1:** Category system setup (CategoryPicker, useCategories hook)
- **Story 4.2:** Unmatched transactions view (FocusModeContext, transaction filtering)
- **Story 4.3:** Create Merchant with Rule (MerchantAssignmentModal, applyRuleToTransactions, Merchant/Rule types and Dexie tables)

### Preparation for Future Stories

This story is a **foundation** for:
- **Story 4.5:** Rules Engine Auto-Apply on Import - reuses rule matching logic
- **Story 4.6:** View and Manage Rules - reuses MerchantRulesList component
- **Story 5.2:** Batch Merchant Assignment - similar existing merchant selection

### Integration Points

**From Story 4.3:**
- Reuse `MerchantAssignmentModal` (extend it)
- Reuse `applyRuleToTransactions` service
- Reuse `PatternSuggestionRadioGroup` component
- Reuse `MatchPreviewList` component
- Reuse merchant and rule types from `src/types/`

**From Story 4.1:**
- Import `CategoryPicker` for category override selection
- Import `useCategories` for category lookup
- Import `CategoryBadge` for displaying categories in rules list

**From Story 4.2:**
- After adding rule, unmatched count auto-updates via Dexie live queries
- Transaction list updates automatically when transactions are assigned

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Merchant search | <100ms | Dexie query, client-side fuzzy filter |
| Rules list load | <50ms | Dexie indexed query on merchantId |
| Conflict detection | <100ms | Iterate all rules, simple pattern comparison |
| Rule addition | <1s for 100 txns | Dexie bulkUpdate |

- Merchant list should be fetched once and cached via useLiveQuery
- Rules list is small per merchant (typically <10 rules)
- Conflict detection can be debounced during pattern input

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT fetch all transactions to check conflicts (use Dexie query)

### Error Handling

| Scenario | Response |
|----------|----------|
| Merchant not found | Show error, prevent submission |
| Duplicate pattern | Inline error, disable "Add Rule" |
| Invalid regex | Show validation error from Story 4.3 |
| Database error | Toast with error message, don't close modal |
| No matching transactions | Allow creation anyway, show info message |

### Validation Checklist

Before marking complete:
- [ ] "Existing merchant" option appears in modal
- [ ] Merchant search dropdown is searchable and keyboard navigable
- [ ] Selecting merchant shows its existing rules
- [ ] Category defaults to merchant's default
- [ ] Category override checkbox enables category picker
- [ ] Pattern suggestions show correct match counts
- [ ] Conflict warning displays when pattern overlaps
- [ ] "Add Rule" creates rule linked to existing merchant
- [ ] Matching transactions are updated
- [ ] Toast shows success message with Undo
- [ ] Undo removes rule without deleting merchant
- [ ] Undo resets affected transactions
- [ ] Duplicate pattern within merchant shows error
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces changes
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### References

- [Source: epics.md#Epic-4-Story-4.4-Assign-Transaction-to-Existing-Merchant]
- [Source: prd.md#FR7 - User can create categorization rules with regex pattern matching]
- [Source: prd.md#FR10 - User can edit existing rules]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Merchant-Assignment-UX]
- [Source: ux-design-specification.md#Add-Rule-to-Existing-Merchant]
- [Story 4.1: Category system setup]
- [Story 4.2: Unmatched transactions view]
- [Story 4.3: Create Merchant with Rule (R key)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
