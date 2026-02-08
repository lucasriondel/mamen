# Story 2.6: Duplicate Transaction Detection

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **the system to detect duplicate transactions when I import**,
So that **I don't accidentally import the same statement twice (FR6)**.

## Acceptance Criteria

1. **Given** I import a statement
   **When** transactions match existing transactions (same account + date + amount + merchant string)
   **Then** duplicates are flagged in the preview
   **And** I see "X duplicates found" warning
   **And** duplicates are highlighted in the preview list

2. **Given** duplicates are detected
   **When** I view the import preview
   **Then** I can choose to: Skip duplicates (default), Import anyway, Cancel import
   **And** the default is to skip duplicates

3. **Given** I choose to skip duplicates
   **When** I confirm import
   **Then** only non-duplicate transactions are imported
   **And** the toast shows "X imported, Y duplicates skipped"

4. **Given** I re-import the same month
   **When** all transactions are duplicates
   **Then** I see "All transactions already exist"
   **And** no new transactions are created

## Tasks / Subtasks

- [x] Task 1: Create duplicate detection service (AC: #1)
  - [x] Create `src/features/import/services/duplicateDetector.ts`
  - [x] Implement function `detectDuplicates(accountId: number, newTransactions: ParsedTransaction[]): Promise<DuplicateCheckResult>`
  - [x] Query Dexie for existing transactions matching account
  - [x] Compare using composite key: `accountId + date + amount + rawMerchantString`
  - [x] Return structure: `{ duplicates: Transaction[], unique: Transaction[], hasDuplicates: boolean }`
  - [x] Create Zod schema for validation at `src/lib/schemas/duplicateCheck.schema.ts`

- [x] Task 2: Create duplicate detection types (AC: #1)
  - [x] Create `src/features/import/types/duplicate.types.ts`
  - [x] Define `DuplicateCheckResult` type
  - [x] Define `ParsedTransaction` type (input to duplicate check)
  - [x] Define `DuplicateDecision` enum: `'skip' | 'import-anyway' | 'cancel'`

- [x] Task 3: Integrate duplicate detection into CSV import flow (AC: #1, #2, #3, #4)
  - [x] Modify `CSVImportPreview` component to run duplicate check after parsing
  - [x] Call `detectDuplicates()` before showing preview modal
  - [x] Store duplicate detection results in component state

- [x] Task 4: Integrate duplicate detection into PDF import flow (AC: #1, #2, #3, #4)
  - [x] Modify `PDFImportPreview` component to run duplicate check after LLM parsing
  - [x] Call `detectDuplicates()` before showing preview modal
  - [x] Store duplicate detection results in component state

- [x] Task 5: Create duplicate warning UI in preview modal (AC: #1, #2)
  - [x] Add warning banner at top of preview when duplicates detected
  - [x] Display count: "X duplicates found out of Y transactions"
  - [x] Style banner with warning color (yellow/amber from shadcn theme)
  - [x] Add InfoIcon with tooltip explaining duplicate detection criteria

- [x] Task 6: Highlight duplicate rows in preview table (AC: #1)
  - [x] Add visual indicator (row background color, badge, or strikethrough)
  - [x] Show "Duplicate" badge next to each duplicate row
  - [x] Use muted/amber styling to differentiate from unique transactions
  - [x] Add tooltip on duplicate badge: "Matches existing transaction from [date]"

- [x] Task 7: Create duplicate handling action buttons (AC: #2)
  - [x] Add button group in modal footer for duplicate decision
  - [x] "Skip Duplicates" button (primary, default action)
  - [x] "Import Anyway" button (secondary/destructive variant)
  - [x] "Cancel" button (outline variant)
  - [x] Disable "Skip Duplicates" if all are duplicates (show message instead)

- [x] Task 8: Implement skip duplicates logic (AC: #3)
  - [x] On "Skip Duplicates" click, filter out duplicate transactions
  - [x] Save only unique transactions to Dexie via `db.transactions.bulkAdd()`
  - [x] Show toast: "X transactions imported, Y duplicates skipped"
  - [x] Close modal and update AccountMonthGrid

- [x] Task 9: Implement import anyway logic (AC: #2)
  - [x] On "Import Anyway" click, save ALL transactions including duplicates
  - [x] Show confirmation dialog first: "Are you sure? This may create duplicate entries."
  - [x] Show toast: "X transactions imported (including Y duplicates)"
  - [x] Close modal and update AccountMonthGrid

- [x] Task 10: Handle all-duplicates scenario (AC: #4)
  - [x] Detect when 100% of parsed transactions are duplicates
  - [x] Show specific message: "All X transactions already exist in this account"
  - [x] Disable "Skip Duplicates" button (no action needed)
  - [x] Only show "Import Anyway" and "Cancel" options
  - [x] Add helper text: "This statement appears to have been imported previously"

- [x] Task 11: Optimize duplicate detection performance (AC: #1)
  - [x] Use Dexie indexed query on `accountId` for initial filter
  - [x] Batch lookup instead of individual queries
  - [x] Amount normalization for precision comparison
  - [x] Target: <500ms for 500 transactions against 5000 existing

- [x] Task 12: Write unit and integration tests (AC: all)
  - [x] Create `src/features/import/services/duplicateDetector.test.ts`
    - Test detection of exact duplicates
    - Test partial matches (same date/amount, different merchant) are NOT duplicates
    - Test empty existing transactions (no duplicates possible)
    - Test within-batch duplicate detection
  - [x] 11 tests covering all core scenarios
  - [x] Tests co-located with source files

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- Query existing transactions via Dexie for comparison
- After save, any component using `useLiveQuery` on transactions will auto-update

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Co-locate tests with source files
- Event handlers: `handle{Event}` naming

### Data Model Reference

**Source: [architecture.md#Data-Model]**

```typescript
// src/types/transaction.types.ts
type Transaction = {
  id?: number              // Auto-increment
  accountId: number        // FK to accounts
  date: Date
  amount: number           // Negative for debits, positive for credits
  rawMerchantString: string
  merchantId?: number      // FK to merchants (undefined = unmatched)
  categoryId?: number      // FK to categories
  importedAt: Date
  source: 'csv' | 'pdf'    // Track import source
}
```

### Duplicate Detection Algorithm

**Composite Key for Duplicate Detection:**

A transaction is considered a duplicate if ALL of the following match:
1. `accountId` - Same bank account
2. `date` - Same transaction date (compare date only, not time)
3. `amount` - Exact same amount (including sign)
4. `rawMerchantString` - Exact same merchant description string

**Implementation Approach:**

```typescript
// src/features/import/services/duplicateDetector.ts
import { db } from '@/lib/db'

type ParsedTransaction = {
  date: Date
  amount: number
  rawMerchantString: string
}

type DuplicateCheckResult = {
  duplicates: ParsedTransaction[]
  unique: ParsedTransaction[]
  existingMatches: Map<string, Transaction> // key -> existing transaction for tooltips
  hasDuplicates: boolean
  allDuplicates: boolean
}

const generateKey = (accountId: number, date: Date, amount: number, merchant: string): string => {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD
  return `${accountId}|${dateStr}|${amount}|${merchant}`
}

export const detectDuplicates = async (
  accountId: number,
  newTransactions: ParsedTransaction[]
): Promise<DuplicateCheckResult> => {
  // Get existing transactions for this account
  const existing = await db.transactions
    .where('accountId')
    .equals(accountId)
    .toArray()

  // Build lookup set of existing transaction keys
  const existingKeys = new Map<string, Transaction>()
  for (const tx of existing) {
    const key = generateKey(accountId, tx.date, tx.amount, tx.rawMerchantString)
    existingKeys.set(key, tx)
  }

  // Check each new transaction
  const duplicates: ParsedTransaction[] = []
  const unique: ParsedTransaction[] = []
  const existingMatches = new Map<string, Transaction>()

  for (const tx of newTransactions) {
    const key = generateKey(accountId, tx.date, tx.amount, tx.rawMerchantString)
    if (existingKeys.has(key)) {
      duplicates.push(tx)
      existingMatches.set(key, existingKeys.get(key)!)
    } else {
      unique.push(tx)
    }
  }

  return {
    duplicates,
    unique,
    existingMatches,
    hasDuplicates: duplicates.length > 0,
    allDuplicates: duplicates.length === newTransactions.length && newTransactions.length > 0
  }
}
```

### Previous Story Context (Stories 2.3 & 2.5)

**Story 2.3 CSV Import established:**
- `CSVImportPreview` component at `src/features/import/components/CSVImportPreview/`
- Preview modal pattern with table of transactions
- Import/Cancel button pattern in modal footer
- Toast feedback pattern: "X transactions imported"

**Story 2.5 PDF Import established:**
- `PDFImportPreview` component at `src/features/import/components/PDFImportPreview/`
- Similar preview modal pattern
- Editable transaction rows in preview
- Uses same save logic as CSV import

**Both flows should integrate duplicate detection at the same point:**
```
Parse file (CSV/PDF)
    ↓
Extract transactions
    ↓
Run detectDuplicates()  ← NEW STEP
    ↓
Show preview modal with duplicate warnings  ← ENHANCED
    ↓
User chooses action
    ↓
Save (all or unique only)
```

### UI Design for Duplicate Handling

**Warning Banner Component:**

```tsx
// In preview modal, above the table
{duplicateResult.hasDuplicates && (
  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md mb-4">
    <AlertTriangle className="h-5 w-5 text-amber-500" />
    <div>
      <p className="text-sm font-medium text-amber-500">
        {duplicateResult.allDuplicates
          ? `All ${duplicateResult.duplicates.length} transactions already exist`
          : `${duplicateResult.duplicates.length} duplicate${duplicateResult.duplicates.length > 1 ? 's' : ''} found`
        }
      </p>
      <p className="text-xs text-muted-foreground">
        Duplicates are identified by matching account, date, amount, and description
      </p>
    </div>
  </div>
)}
```

**Duplicate Row Styling:**

```tsx
// In transaction table row
<TableRow
  className={cn(
    isDuplicate && "bg-amber-500/5 opacity-70"
  )}
>
  <TableCell>
    {isDuplicate && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-amber-500 border-amber-500/50">
              Duplicate
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Matches existing transaction from {formatDate(existingTx.importedAt)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
  </TableCell>
  {/* ...other cells */}
</TableRow>
```

**Button Group Pattern:**

```tsx
// Modal footer
<DialogFooter className="gap-2">
  <Button variant="outline" onClick={handleCancel}>
    Cancel
  </Button>

  {duplicateResult.hasDuplicates && !duplicateResult.allDuplicates && (
    <Button
      variant="secondary"
      onClick={handleImportAnyway}
    >
      Import Anyway
    </Button>
  )}

  {duplicateResult.allDuplicates ? (
    <Button onClick={handleImportAnyway}>
      Import Anyway
    </Button>
  ) : (
    <Button onClick={handleImportWithSkip}>
      {duplicateResult.hasDuplicates
        ? `Import ${duplicateResult.unique.length} (Skip ${duplicateResult.duplicates.length} duplicates)`
        : `Import ${transactions.length} transactions`
      }
    </Button>
  )}
</DialogFooter>
```

### Toast Messages

| Scenario | Toast Message |
|----------|---------------|
| Normal import (no duplicates) | "X transactions imported" |
| Import with duplicates skipped | "X transactions imported, Y duplicates skipped" |
| Import anyway (with duplicates) | "X transactions imported (including Y duplicates)" |
| All duplicates, user imports anyway | "X transactions imported (all were duplicates)" |

### Performance Considerations

**Target Performance:**
- Duplicate detection for 500 new transactions against 5000 existing: <500ms
- Detection should not block the UI

**Optimization Strategies:**

1. **Indexed Queries:** Ensure Dexie has index on `accountId`:
   ```typescript
   // In src/lib/db/schema.ts
   transactions: '++id, accountId, date, merchantId, [accountId+date]'
   ```

2. **Batch Processing:** Load all existing transactions for the account once, build lookup set in memory

3. **String Hashing (Optional):** If performance is still slow, consider hashing the composite key:
   ```typescript
   const hashKey = async (key: string): Promise<string> => {
     const encoder = new TextEncoder()
     const data = encoder.encode(key)
     const hashBuffer = await crypto.subtle.digest('SHA-256', data)
     return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
   }
   ```

### Edge Cases to Handle

| Edge Case | Handling |
|-----------|----------|
| Empty existing transactions | No duplicates possible, return all as unique |
| Empty new transactions | Return empty result (no duplicates, no unique) |
| Same transaction imported multiple times in same batch | Consider only first occurrence as unique, rest as duplicates within batch |
| Date stored with different timezone | Normalize dates to UTC before comparison |
| Merchant string with extra whitespace | Trim and normalize before comparison |
| Amount precision differences | Use fixed precision comparison (2 decimal places) |

### Component Structure

```
src/features/import/
├── components/
│   ├── CSVImportPreview/
│   │   └── index.tsx           # Modified to include duplicate detection
│   ├── PDFImportPreview/
│   │   └── index.tsx           # Modified to include duplicate detection
│   ├── DuplicateWarningBanner/
│   │   └── index.tsx           # New: Reusable warning banner
│   └── ImportActions/
│       └── index.tsx           # New: Shared action buttons for import modals
├── services/
│   ├── duplicateDetector.ts    # New: Duplicate detection logic
│   └── duplicateDetector.test.ts
├── types/
│   └── duplicate.types.ts      # New: Duplicate-related types
└── hooks/
    └── useDuplicateDetection.ts # Optional: Hook wrapper for detection
```

### shadcn Components to Use

- `Badge` - Duplicate indicator on rows
- `Button` - Action buttons (variant: default, secondary, outline)
- `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` - Explanation tooltips
- `AlertDialog` - Confirmation for "Import Anyway" action
- `Alert` or custom div - Warning banner (use amber colors)

### Project Structure Notes

- Feature stays within `src/features/import/`
- Duplicate detection service is import-specific, not shared
- Types defined locally in feature, not in `src/types/`
- No detected conflicts with existing patterns

### Git Intelligence (Recent Commits)

Recent commits show story file creation pattern:
- `9e7ccd9` feat(story): create story 2-5 PDF statement import with LLM parsing
- `e9b7ee2` feat(story): create story 2-4 LLM settings configuration

This story (2-6) is the final story in Epic 2 before the retrospective.

### Validation Checklist

Before marking complete:
- [ ] Duplicate detection correctly identifies matching transactions
- [ ] Preview modal shows duplicate warning banner when duplicates found
- [ ] Duplicate rows are visually distinct (highlighted/badged)
- [ ] "Skip Duplicates" button works and imports only unique
- [ ] "Import Anyway" button works with confirmation dialog
- [ ] Toast messages are correct for all scenarios
- [ ] All-duplicates scenario shows appropriate message
- [ ] Detection performance is acceptable (<500ms for typical import)
- [ ] Works for both CSV and PDF import flows
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store duplicate results in global state - keep in component
- DO NOT query Dexie repeatedly for each transaction - batch lookup
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT compare dates without normalizing timezone
- DO NOT skip confirmation for "Import Anyway" action
- DO NOT add comments/docstrings to code you didn't change

### References

- [Source: epics.md#Story-2.6-Duplicate-Transaction-Detection]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Data-Model]
- [Source: project-context.md#Data-Access]
- [Source: story 2-3 (CSV Statement Import)]
- [Source: story 2-5 (PDF Statement Import with LLM Parsing)]
- [Dexie.js where queries](https://dexie.org/docs/Collection/Collection.where())
- [Dexie.js compound indexes](https://dexie.org/docs/Compound-Index)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- TypeScript compilation: clean (0 errors)
- Full test suite: 213/213 pass (1 pre-existing test file fails due to pdfjs-dist DOMMatrix in jsdom — unrelated)
- New tests: 11/11 pass

### Completion Notes List

- Created `duplicateDetector.ts` service with batch lookup pattern: queries all account transactions once, builds in-memory Map for O(1) key lookups. Handles within-batch duplicates, whitespace trimming, and amount precision normalization.
- Created `duplicate.types.ts` with `ParsedTransaction`, `DuplicateCheckResult`, and `DuplicateDecision` types.
- Created `duplicateCheck.schema.ts` with Zod validation schemas.
- Refactored `csvImporter.ts` to expose `parseCSVTransactions()` and `importTransactions()` functions, enabling the CSV modal to parse first, check duplicates, then import selectively.
- Updated `ImportCSVModal` with full duplicate detection flow: amber warning banner, duplicate-highlighted rows with Badge + Tooltip, three-button action group (Skip Duplicates / Import Anyway / Cancel), AlertDialog confirmation for Import Anyway.
- Updated `PDFImportPreview` with identical duplicate detection flow, adapting from LLMTransaction format to ParsedTransaction for detection. Disables editing when in duplicate review state.
- Both modals use `importTransactions()` from csvImporter for the actual save, consolidating the import logic.
- All-duplicates scenario: shows "All X transactions already exist" message with helper text, only offers Import Anyway and Cancel.
- Toast messages follow the story spec exactly for all four scenarios.

### Change Log

- 2026-02-08: Implemented story 2-6 duplicate transaction detection — all 12 tasks complete, 11 unit tests added

### File List

- `src/features/import/types/duplicate.types.ts` (new)
- `src/features/import/services/duplicateDetector.ts` (new)
- `src/features/import/services/duplicateDetector.test.ts` (new)
- `src/features/import/services/csvImporter.ts` (modified — added parseCSVTransactions, importTransactions)
- `src/features/import/components/ImportCSVModal/index.tsx` (modified — duplicate detection integration)
- `src/features/import/components/PDFImportPreview/index.tsx` (modified — duplicate detection integration)
- `src/lib/schemas/duplicateCheck.schema.ts` (new)
