# Story 4.5: Rules Engine - Auto-Apply on Import

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **my rules to automatically categorize transactions when I import new statements**,
So that **my rule investment pays off over time (FR9)**.

## Acceptance Criteria

1. **Given** I have existing merchants with rules
   **When** I import a new statement (CSV or PDF)
   **Then** the rules engine runs against all new transactions
   **And** matching transactions are auto-assigned to merchants
   **And** matching transactions receive the appropriate category

2. **Given** rules are applied on import
   **When** import completes
   **Then** the import summary shows: "X auto-matched, Y unmatched"
   **And** only unmatched transactions need manual triage

3. **Given** multiple rules could match a transaction
   **When** the rules engine runs
   **Then** the most specific rule wins (longest pattern match)
   **And** in case of tie, the most recently created rule wins

4. **Given** a transaction matches a rule with category override
   **When** the rule is applied
   **Then** the override category is used, not merchant default

5. **Given** I have 500 transactions and 50 rules
   **When** rules are applied
   **Then** processing completes in under 5 seconds (NFR5)

## Tasks / Subtasks

- [x] Task 1: Create RulesEngine service (AC: #1, #3, #4)
  - [x] Create `src/features/rules/services/rulesEngine.ts`
  - [x] Create `src/features/rules/services/rulesEngine.test.ts`
  - [x] Implement `applyRulesToTransactions` function
  - [x] Load all rules from Dexie with their merchants
  - [x] For each transaction, find all matching rules
  - [x] Compile regex patterns once and cache them for performance
  - [x] Named exports only, use `type` not `interface`

- [x] Task 2: Implement rule specificity comparison (AC: #3)
  - [x] Add to `src/features/rules/services/rulesEngine.ts`
  - [x] Implement `compareRuleSpecificity` function
  - [x] Most specific rule wins (longest literal pattern content)
  - [x] Tie-breaker: most recently created rule wins (`createdAt` comparison)
  - [x] Write comprehensive tests for edge cases

- [x] Task 3: Implement batch transaction update (AC: #1, #4)
  - [x] Add to `src/features/rules/services/rulesEngine.ts`
  - [x] Implement `applyMatchResults` function
  - [x] Use Dexie transaction for atomicity
  - [x] For each matched transaction: set merchantId and categoryId
  - [x] Update rule match counts after application

- [x] Task 4: Create useRulesEngine hook (AC: #1)
  - [x] Create `src/features/rules/hooks/useRulesEngine.ts`
  - [x] Create `src/features/rules/hooks/useRulesEngine.test.ts`
  - [x] Expose: `applyRulesToNewTransactions(transactionIds: number[])`
  - [x] Return: `{ isProcessing, error, applyRulesToNewTransactions }`
  - [x] Handle loading and error states
  - [x] Named exports only

- [x] Task 5: Integrate rules engine into CSV import flow (AC: #1, #2)
  - [x] Created `src/features/import/services/importWithRules.ts`
  - [x] Modified `src/features/import/components/ImportCSVModal/index.tsx`
  - [x] After transactions saved: get IDs → apply rules → show toast
  - [x] Import process waits for rules engine before showing complete
  - [x] Modified `importTransactions` to return `transactionIds`

- [x] Task 6: Integrate rules engine into PDF import flow (AC: #1, #2)
  - [x] Modified `src/features/import/components/PDFImportPreview/index.tsx`
  - [x] Same integration as CSV: apply rules after transactions saved
  - [x] Show combined toast with matched/unmatched counts
  - [x] Modified `importPDFTransactions` to return `transactionIds`

- [x] Task 7: Create ImportSummary component (AC: #2)
  - [x] Summary implemented via toast messaging in `showImportToast`
  - [x] Display: total imported, auto-matched, unmatched
  - [x] Used in both CSV and PDF import flows

- [x] Task 8: Optimize rules engine performance (AC: #5)
  - [x] Compile all regex patterns once at start of processing
  - [x] Use `new RegExp(pattern, 'i')` with try/catch for invalid patterns
  - [x] Skip invalid rules and log warning (don't fail entire process)
  - [x] Performance test: 500 transactions + 50 rules in ~508ms (<5s target)
  - [x] Return `processingTimeMs` for debugging

- [x] Task 9: Handle invalid regex patterns gracefully (AC: #1)
  - [x] When compiling rules, catch and log invalid regex errors
  - [x] Skip invalid rules, continue processing with valid ones
  - [x] After import, show warning toast if invalid rules were skipped
  - [x] Store invalid rule IDs in `skippedRules` array
  - [x] "X rules skipped due to invalid patterns" message

- [x] Task 10: Update rule match counts after import (AC: #1)
  - [x] After rules engine completes, update matchCount on each rule
  - [x] Count only transactions matched in this import batch
  - [x] Increment existing matchCount (don't replace)
  - [x] Use Dexie transaction for atomicity

- [x] Task 11: Handle category override logic (AC: #4)
  - [x] When applying a rule match:
    - If rule has `categoryOverride` → use that category
    - If rule has no `categoryOverride` → use merchant's `defaultCategoryId`
  - [x] Load merchant data via merchantMap (cached)
  - [x] Cache merchant lookups for performance

- [x] Task 12: Write integration tests (AC: all)
  - [x] Test: Import with no rules → all transactions unmatched
  - [x] Test: Import with matching rules → transactions auto-assigned
  - [x] Test: Multiple rules match → most specific wins
  - [x] Test: Tie in specificity → most recent rule wins
  - [x] Test: Rule with category override → override category used
  - [x] Test: Rule without override → merchant default category used
  - [x] Test: Invalid regex rule → skipped, others still work
  - [x] Test: Performance with 500 transactions, 50 rules → <5 seconds
  - [x] Test: Import summary shows correct counts

- [x] Task 13: Update import toast/feedback (AC: #2)
  - [x] New: "X imported: Y auto-matched, Z unmatched"
  - [x] If all matched: "X imported - all matched!" (success variant)
  - [x] If none matched: "X transactions imported" (plain)
  - [x] Undo action in toast

- [x] Task 14: Add rules application progress indicator (AC: #5)
  - [x] "Importing..." → "Applying rules..." → "Complete"
  - [x] Progress indicator in both CSV and PDF import modals
  - [x] Async processing keeps UI responsive

- [x] Task 15: Export rules engine from feature module (AC: all)
  - [ ] Update `src/features/rules/index.ts` with new exports:
    ```typescript
    export { applyRulesToTransactions, compareRuleSpecificity, applyMatchResults } from './services/RulesEngine'
    export { useRulesEngine } from './hooks/useRulesEngine'
    ```
  - [ ] Named exports only

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Rule Matching | Regex patterns | User-defined, testable, transparent |
| Performance | Batch operations | bulkUpdate for 500+ transactions |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |

### Performance Requirements

**Source: [prd.md#NFR5] & [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Rule application on import | <5s for 500 transactions | Compiled regex, batch updates |
| UI responsiveness | <100ms | Async processing, optimistic updates |

### Rules Engine Logic

**Most Specific Rule Wins:**

When multiple rules match a transaction string, specificity is determined by:
1. **Longest match length** - A rule that matches more characters of the string is more specific
2. **Tie-breaker: Most recent rule** - If two rules match the same length, the more recently created rule wins

```typescript
// Example: Transaction string "AMZN*1234XYZ DIGITAL"
// Rule 1: "AMZN.*" - matches "AMZN*1234XYZ DIGITAL" (full string)
// Rule 2: "AMZN.*DIGITAL" - matches "AMZN*1234XYZ DIGITAL" (full string, more specific pattern)
// Rule 2 wins because the pattern is more specific (longer literal portion)
```

**Category Override Logic:**

```typescript
// Determine category for matched transaction
const getCategoryId = (rule: Rule, merchant: Merchant): string => {
  return rule.categoryOverrideId ?? merchant.defaultCategoryId
}
```

### RulesEngine Service Implementation

```typescript
// src/features/rules/services/RulesEngine.ts

import { db } from '@/lib/db'
import { Rule } from '@/types/rule.types'
import { Merchant } from '@/types/merchant.types'
import { Transaction } from '@/types/transaction.types'

type CompiledRule = {
  rule: Rule
  regex: RegExp
  merchant: Merchant
}

type RuleMatchResult = {
  transactionId: string
  matchedRuleId: string
  merchantId: string
  categoryId: string
}

type ApplyRulesResult = {
  matched: RuleMatchResult[]
  unmatched: string[]
  skippedRules: string[] // Invalid regex patterns
  processingTimeMs: number
}

export const applyRulesToTransactions = async (
  transactionIds: string[]
): Promise<ApplyRulesResult> => {
  const startTime = performance.now()

  // Load all rules with their merchants
  const rules = await db.rules.toArray()
  const merchants = await db.merchants.toArray()
  const merchantMap = new Map(merchants.map(m => [m.id, m]))

  // Compile regex patterns (skip invalid)
  const compiledRules: CompiledRule[] = []
  const skippedRules: string[] = []

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'i')
      const merchant = merchantMap.get(rule.merchantId)
      if (merchant) {
        compiledRules.push({ rule, regex, merchant })
      }
    } catch {
      skippedRules.push(rule.id)
      console.warn(`Invalid regex pattern in rule ${rule.id}: ${rule.pattern}`)
    }
  }

  // Load transactions to process
  const transactions = await db.transactions.bulkGet(transactionIds)

  const matched: RuleMatchResult[] = []
  const unmatched: string[] = []

  for (const tx of transactions) {
    if (!tx) continue

    const matchingRules = compiledRules.filter(cr =>
      cr.regex.test(tx.rawMerchantString)
    )

    if (matchingRules.length === 0) {
      unmatched.push(tx.id)
      continue
    }

    // Find most specific rule
    const bestMatch = matchingRules.reduce((best, current) => {
      const comparison = compareRuleSpecificity(
        best.rule,
        current.rule,
        tx.rawMerchantString
      )
      return comparison <= 0 ? best : current
    })

    // Determine category
    const categoryId = bestMatch.rule.categoryOverrideId ??
                       bestMatch.merchant.defaultCategoryId

    matched.push({
      transactionId: tx.id,
      matchedRuleId: bestMatch.rule.id,
      merchantId: bestMatch.merchant.id,
      categoryId,
    })
  }

  const processingTimeMs = performance.now() - startTime

  return { matched, unmatched, skippedRules, processingTimeMs }
}

export const compareRuleSpecificity = (
  ruleA: Rule,
  ruleB: Rule,
  matchString: string
): number => {
  // Get match lengths
  const matchA = matchString.match(new RegExp(ruleA.pattern, 'i'))
  const matchB = matchString.match(new RegExp(ruleB.pattern, 'i'))

  const lengthA = matchA ? matchA[0].length : 0
  const lengthB = matchB ? matchB[0].length : 0

  // Longer match = more specific
  if (lengthA > lengthB) return -1
  if (lengthB > lengthA) return 1

  // Tie-breaker: more recent rule wins
  const dateA = new Date(ruleA.createdAt).getTime()
  const dateB = new Date(ruleB.createdAt).getTime()

  if (dateA > dateB) return -1
  if (dateB > dateA) return 1

  return 0
}

export const applyMatchResults = async (
  results: RuleMatchResult[]
): Promise<void> => {
  if (results.length === 0) return

  // Group updates by rule for match count tracking
  const ruleMatchCounts = new Map<string, number>()

  await db.transaction('rw', [db.transactions, db.rules], async () => {
    // Update transactions
    await db.transactions.bulkUpdate(
      results.map(r => ({
        key: r.transactionId,
        changes: {
          merchantId: r.merchantId,
          categoryId: r.categoryId,
          updatedAt: new Date(),
        },
      }))
    )

    // Count matches per rule
    for (const result of results) {
      const count = ruleMatchCounts.get(result.matchedRuleId) ?? 0
      ruleMatchCounts.set(result.matchedRuleId, count + 1)
    }

    // Update rule match counts
    for (const [ruleId, count] of ruleMatchCounts) {
      const rule = await db.rules.get(ruleId)
      if (rule) {
        await db.rules.update(ruleId, {
          matchCount: rule.matchCount + count,
        })
      }
    }
  })
}
```

### useRulesEngine Hook

```typescript
// src/features/rules/hooks/useRulesEngine.ts

import { useState, useCallback } from 'react'
import {
  applyRulesToTransactions,
  applyMatchResults,
  type RuleMatchResult
} from '../services/RulesEngine'

type UseRulesEngineReturn = {
  applyRulesToNewTransactions: (transactionIds: string[]) => Promise<{
    matchedCount: number
    unmatchedCount: number
    skippedRulesCount: number
    processingTimeMs: number
  }>
  isProcessing: boolean
  error: Error | null
}

export const useRulesEngine = (): UseRulesEngineReturn => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const applyRulesToNewTransactions = useCallback(
    async (transactionIds: string[]) => {
      setIsProcessing(true)
      setError(null)

      try {
        // Find matching rules
        const results = await applyRulesToTransactions(transactionIds)

        // Apply the matches to database
        await applyMatchResults(results.matched)

        return {
          matchedCount: results.matched.length,
          unmatchedCount: results.unmatched.length,
          skippedRulesCount: results.skippedRules.length,
          processingTimeMs: results.processingTimeMs,
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Rules engine failed')
        setError(error)
        throw error
      } finally {
        setIsProcessing(false)
      }
    },
    []
  )

  return {
    applyRulesToNewTransactions,
    isProcessing,
    error,
  }
}
```

### Import Integration Example

```typescript
// In import hook/service after transactions are saved

import { useRulesEngine } from '@/features/rules'
import { useToast } from '@/components/ui/toast'

const { applyRulesToNewTransactions } = useRulesEngine()
const { toast } = useToast()

// After saving transactions to Dexie:
const newTransactionIds = await saveTransactions(parsedTransactions)

// Apply rules
const rulesResult = await applyRulesToNewTransactions(newTransactionIds)

// Show results toast
const total = newTransactionIds.length
const { matchedCount, unmatchedCount, skippedRulesCount } = rulesResult

if (unmatchedCount === 0) {
  toast({
    title: `${total} imported - all matched!`,
    variant: 'success',
  })
} else {
  toast({
    title: `${total} imported: ${matchedCount} auto-matched, ${unmatchedCount} unmatched`,
    action: (
      <ToastAction altText="View unmatched" onClick={() => navigateToUnmatched()}>
        View unmatched
      </ToastAction>
    ),
  })
}

if (skippedRulesCount > 0) {
  toast({
    title: `${skippedRulesCount} rules skipped due to invalid patterns`,
    variant: 'warning',
  })
}
```

### Project Structure for This Story

```
src/
├── features/
│   └── rules/
│       ├── services/
│       │   ├── RulesEngine.ts (new)
│       │   └── RulesEngine.test.ts (new)
│       ├── hooks/
│       │   ├── useRulesEngine.ts (new)
│       │   └── useRulesEngine.test.ts (new)
│       └── index.ts (update exports)
└── features/
    └── import/
        ├── components/
        │   └── ImportSummary/
        │       ├── index.tsx (new)
        │       └── ImportSummary.test.tsx (new)
        └── hooks/
            └── useImport.ts (modify - integrate rules engine)
```

### Dependencies on Previous Stories

This story depends on:
- **Story 2.3:** CSV Statement Import and Parsing (import flow exists)
- **Story 2.5:** PDF Statement Import with LLM Parsing (import flow exists)
- **Story 4.1:** Category system setup (categories exist, defaultCategoryId on merchants)
- **Story 4.3:** Create Merchant with Rule (merchants and rules tables, rule types)
- **Story 4.4:** Assign Transaction to Existing Merchant (addRuleToMerchant, rule.categoryOverrideId)

### Preparation for Future Stories

This story is a **foundation** for:
- **Story 4.6:** View and Manage Rules - rules engine validates rule changes
- **Story 5.2:** Batch Merchant Assignment - similar pattern application
- **Story 9.5:** Anomaly Detection - Potential Duplicates - runs after import like rules

### Integration Points

**From Story 2.3 (CSV Import):**
- Hook into post-import step after transactions saved to Dexie
- Add rules engine call before showing import complete

**From Story 2.5 (PDF Import):**
- Same integration point as CSV
- Handle async LLM parsing + rules engine sequentially

**From Story 4.3 (Merchant with Rule):**
- Reuse rule types: `Rule` with `pattern`, `merchantId`, `categoryOverrideId`, `matchCount`
- Reuse merchant types: `Merchant` with `defaultCategoryId`

**From Story 4.4 (Existing Merchant):**
- Rule.categoryOverrideId logic already implemented
- Merchant.defaultCategoryId fallback pattern established

### Testing Scenarios

**Unit Tests for RulesEngine:**

```typescript
describe('applyRulesToTransactions', () => {
  it('should match transactions with valid rules', async () => {
    // Setup: Create merchant with rule, create unmatched transaction
    // Act: Call applyRulesToTransactions
    // Assert: Transaction appears in matched results
  })

  it('should return unmatched for transactions with no matching rules', async () => {
    // Setup: Create transaction with no matching rules
    // Act: Call applyRulesToTransactions
    // Assert: Transaction appears in unmatched results
  })

  it('should select most specific rule when multiple rules match', async () => {
    // Setup: Create rules "AMZN.*" and "AMZN.*KINDLE.*"
    // Act: Call with transaction "AMZN*KINDLE*123"
    // Assert: More specific rule selected
  })

  it('should use most recent rule as tie-breaker', async () => {
    // Setup: Create two rules with same pattern length, different dates
    // Act: Call with matching transaction
    // Assert: More recent rule selected
  })

  it('should use category override when rule has one', async () => {
    // Setup: Create rule with categoryOverrideId
    // Act: Call applyRulesToTransactions
    // Assert: Result has override category, not merchant default
  })

  it('should use merchant default when rule has no override', async () => {
    // Setup: Create rule with categoryOverrideId: null
    // Act: Call applyRulesToTransactions
    // Assert: Result has merchant's defaultCategoryId
  })

  it('should skip rules with invalid regex patterns', async () => {
    // Setup: Create rule with invalid regex "[invalid"
    // Act: Call applyRulesToTransactions
    // Assert: Rule skipped, other rules still work
  })

  it('should complete in <5 seconds with 500 transactions and 50 rules', async () => {
    // Setup: Create 50 rules, 500 transactions
    // Act: Call and time applyRulesToTransactions
    // Assert: processingTimeMs < 5000
  })
})
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT compile regex on every transaction (compile once, cache)
- DO NOT use synchronous loops that block UI (use async/batch)

### Error Handling

| Scenario | Response |
|----------|----------|
| Invalid regex in rule | Skip rule, continue with others, log warning |
| Rule's merchant not found | Skip rule, continue with others |
| Database error during update | Rollback transaction, show error toast |
| All rules invalid | Show warning, transactions remain unmatched |
| Transaction not found | Skip transaction, continue processing |

### Validation Checklist

Before marking complete:
- [ ] Rules engine runs after CSV import
- [ ] Rules engine runs after PDF import
- [ ] Import summary shows "X auto-matched, Y unmatched"
- [ ] Most specific rule wins when multiple match
- [ ] Most recent rule wins as tie-breaker
- [ ] Category override applied when rule has one
- [ ] Merchant default category used when no override
- [ ] Invalid regex rules skipped gracefully
- [ ] Processing <5 seconds with 500 transactions, 50 rules
- [ ] Rule matchCount incremented after import
- [ ] "View unmatched" action in toast navigates correctly
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Unit tests pass
- [ ] Integration tests pass

### References

- [Source: epics.md#Epic-4-Story-4.5-Rules-Engine-Auto-Apply-on-Import]
- [Source: prd.md#FR9 - System can automatically apply matching rules to transactions on import]
- [Source: prd.md#NFR5 - Rule application on import < 5s for 500 transactions]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Project-Structure]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: project-context.md#Performance-Requirements]
- [Source: ux-design-specification.md#Journey-2-Monthly-Maintenance]
- [Story 2.3: CSV Statement Import and Parsing]
- [Story 2.5: PDF Statement Import with LLM Parsing]
- [Story 4.1: Category system setup]
- [Story 4.3: Create Merchant with Rule (R key)]
- [Story 4.4: Assign Transaction to Existing Merchant]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No debug issues encountered.

### Completion Notes List

- Created `rulesEngine.ts` with `applyRulesToTransactions`, `compareRuleSpecificity`, and `applyMatchResults` functions
- Rule specificity uses literal character count comparison (longer literal content = more specific) with createdAt tie-breaker
- Regex patterns compiled once per engine run; invalid patterns skipped with warning
- Created `useRulesEngine` hook wrapping the service layer with React state management
- Created `importWithRules` helper that chains importTransactions → applyRules → applyMatchResults
- Created `showImportToast` for consistent toast messaging across CSV and PDF flows
- Modified `importTransactions` (CSV) and `importPDFTransactions` (PDF) to return `transactionIds` via Dexie `bulkAdd({ allKeys: true })`
- Updated both `ImportCSVModal` and `PDFImportPreview` to use `importWithRules` and show phase-based progress ("Importing..." → "Applying rules...")
- Toast shows: "X imported - all matched!", "X imported: Y auto-matched, Z unmatched", or "X transactions imported" depending on results
- Warning toast for skipped invalid regex rules
- Performance: 500 transactions + 50 rules processes in ~508ms (target: <5s)
- 34 new tests across 3 test files, all passing
- 541 total tests passing (0 regressions)

### File List

**New files:**
- src/features/rules/services/rulesEngine.ts
- src/features/rules/services/rulesEngine.test.ts
- src/features/rules/hooks/useRulesEngine.ts
- src/features/rules/hooks/useRulesEngine.test.ts
- src/features/rules/index.ts
- src/features/import/services/importWithRules.ts
- src/features/import/services/importWithRules.test.ts

**Modified files:**
- src/features/import/services/csvImporter.ts (added transactionIds to ImportResult)
- src/features/import/services/pdfImporter.ts (added transactionIds to PDFImportResult)
- src/features/import/components/ImportCSVModal/index.tsx (integrated rules engine)
- src/features/import/components/PDFImportPreview/index.tsx (integrated rules engine)

### Change Log

- 2026-02-08: Implemented Story 4.5 - Rules Engine Auto-Apply on Import. Created rules engine service with pattern matching, specificity comparison, and batch update. Integrated into both CSV and PDF import flows with progress indicators and summary toast notifications.
