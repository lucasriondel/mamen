# Story 2.3: CSV Statement Import and Parsing

Status: ready-for-dev

## Story

As a **user**,
I want **to import bank statements in CSV format**,
So that **I can see my transactions in the app without needing LLM parsing (FR1, FR3, FR4)**.

## Acceptance Criteria

1. **Given** I have a CSV bank statement file
   **When** I drag-and-drop it onto a month slot (or use file picker)
   **Then** the system reads the CSV file
   **And** a preview modal shows the first few rows
   **And** I can map columns to: Date, Amount, Description/Merchant
   **And** the system auto-detects common column names

2. **Given** I have mapped the columns
   **When** I click "Import"
   **Then** transactions are parsed from the CSV
   **And** each transaction has: date, amount, raw merchant string (FR4)
   **And** transactions are linked to the selected account and month
   **And** transactions are saved to the database
   **And** a toast confirms "X transactions imported"

3. **Given** the CSV has an unrecognized format
   **When** auto-detection fails
   **Then** I can manually select which column is Date, Amount, Description
   **And** I can specify date format if needed

4. **Given** I import transactions
   **When** the import completes
   **Then** transactions appear in the transaction list
   **And** they are marked as "unmatched" (no merchant assigned yet)
   **And** the month slot in the grid shows as imported with count

## Tasks / Subtasks

- [ ] Task 1: Install and configure PapaParse for CSV parsing (AC: #1)
  - [ ] Install papaparse: `npm install papaparse`
  - [ ] Install types: `npm install -D @types/papaparse`
  - [ ] Create `src/lib/csv/parser.ts` for CSV parsing utilities
  - [ ] Export typed parser function with header detection

- [ ] Task 2: Create ImportCSVModal component (AC: #1, #2)
  - [ ] Create `src/features/import/components/ImportCSVModal/index.tsx`
  - [ ] Use shadcn Dialog component as base
  - [ ] Accept props: file (File object), accountId, monthKey, onClose, onImport
  - [ ] Display modal title: "Import Statement" with month/account context

- [ ] Task 3: Implement CSV preview section (AC: #1)
  - [ ] Parse first 5-10 rows using PapaParse preview option
  - [ ] Display in a table using shadcn Table component
  - [ ] Show column headers (if detected) or column indices
  - [ ] Style as dense table matching UX spec

- [ ] Task 4: Implement column mapping UI (AC: #1, #3)
  - [ ] Create three Select dropdowns: Date, Amount, Description
  - [ ] Auto-detect columns by header name patterns:
    - Date: "date", "transaction date", "posted date", "trans date"
    - Amount: "amount", "debit", "credit", "value", "sum"
    - Description: "description", "merchant", "narrative", "details", "payee"
  - [ ] Show detected mappings as default selections
  - [ ] Allow manual override via Select components
  - [ ] Validate that all three columns are mapped before allowing import

- [ ] Task 5: Implement date format detection and selection (AC: #3)
  - [ ] Add date format Select with common formats:
    - Auto-detect (default)
    - DD/MM/YYYY
    - MM/DD/YYYY
    - YYYY-MM-DD
    - DD-MM-YYYY
    - MM-DD-YYYY
    - DD.MM.YYYY
  - [ ] Attempt auto-detection from sample data
  - [ ] Show detected format as default, allow override
  - [ ] Parse dates using selected format

- [ ] Task 6: Create transaction creation logic (AC: #2, #4)
  - [ ] Create `src/features/import/services/csvImporter.ts`
  - [ ] Parse full CSV with PapaParse (worker: true for performance)
  - [ ] Map each row to Transaction type:
    - date: Date (parsed from mapped column)
    - amount: number (parsed, handle negative/positive)
    - rawMerchantString: string (from description column)
    - accountId: number (from props)
    - merchantId: null (unmatched)
    - categoryId: null (unmatched)
    - importedAt: new Date()
    - monthKey: string (YYYY-MM format)
  - [ ] Return array of transactions to save

- [ ] Task 7: Handle amount parsing edge cases (AC: #2)
  - [ ] Handle comma decimal separator (European format: 1.234,56)
  - [ ] Handle period decimal separator (US format: 1,234.56)
  - [ ] Detect format from sample data or let user specify
  - [ ] Handle negative amounts in different formats:
    - Minus sign: -50.00
    - Parentheses: (50.00)
    - Separate debit/credit columns
  - [ ] Ensure amounts are stored as negative for expenses, positive for income

- [ ] Task 8: Implement Dexie transaction saving (AC: #2)
  - [ ] Use `db.transactions.bulkAdd()` for batch insert
  - [ ] Wrap in Dexie transaction for atomicity
  - [ ] Handle errors gracefully (show error toast if fails)
  - [ ] Return count of successfully imported transactions

- [ ] Task 9: Integrate with AccountMonthGrid drop handler (AC: #1, #4)
  - [ ] Update MonthSlot onFileDropped callback from Story 2.2
  - [ ] When file is dropped:
    - If CSV file: Open ImportCSVModal with file
    - If PDF file: Show "PDF import coming in Story 2.5" message
  - [ ] Pass accountId and monthKey to modal
  - [ ] After successful import, close modal and refresh grid

- [ ] Task 10: Implement import confirmation toast (AC: #2)
  - [ ] Use shadcn Toast component
  - [ ] Show: "X transactions imported" message
  - [ ] Include Undo action (10 second window per UX spec)
  - [ ] Undo should delete all just-imported transactions
  - [ ] Track importBatchId for undo functionality

- [ ] Task 11: Add file picker fallback (AC: #1)
  - [ ] Add "Browse files" button in empty month slot
  - [ ] Use hidden input[type="file"] with accept=".csv"
  - [ ] Trigger same ImportCSVModal flow as drag-drop

- [ ] Task 12: Handle re-import confirmation (AC from Story 2.2 #4)
  - [ ] If month already has transactions, show AlertDialog first:
    - "This month already has X transactions. Replace them?"
    - Options: "Cancel", "Replace"
  - [ ] If "Replace" selected, delete existing transactions for account+month first
  - [ ] Then proceed with normal import flow

- [ ] Task 13: Write unit tests for CSV parsing (AC: all)
  - [ ] Create `src/lib/csv/parser.test.ts`
  - [ ] Test date format detection with various formats
  - [ ] Test amount parsing (US, European formats)
  - [ ] Test column header auto-detection
  - [ ] Test handling of malformed rows

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- After import, `useLiveQuery` in AccountMonthGrid will automatically update counts
- Transaction list views will auto-refresh via live queries

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming (`handleImport`, `handleFileSelect`)
- Props types: `{ComponentName}Props`

### CSV Parsing Library

**Source: Web Research (January 2026)**

Use **PapaParse** (or react-papaparse) for CSV parsing:

```bash
npm install papaparse
npm install -D @types/papaparse
```

**Key PapaParse features to use:**

```typescript
import Papa from 'papaparse'

// Parse with header detection
Papa.parse(file, {
  header: true,           // First row is header
  dynamicTyping: true,    // Auto-convert numbers/booleans
  skipEmptyLines: true,   // Ignore blank rows
  worker: true,           // Use web worker for large files
  preview: 10,            // For preview modal
  complete: (results) => {
    // results.data is typed array
    // results.meta.fields is header array
    // results.errors is any parse errors
  }
})
```

**References:**
- [PapaParse Official](https://www.papaparse.com/)
- [react-papaparse npm](https://www.npmjs.com/package/react-papaparse)
- [TypeScript with PapaParse](https://typescript.tv/hands-on/parsing-csv-files-in-typescript-with-papa-parse/)

### Data Model Reference

**Source: [architecture.md#Data-Model] and [story 1-2]**

Transaction type from existing schema:

```typescript
type Transaction = {
  id?: number             // Auto-increment
  accountId: number       // FK to accounts
  date: Date              // Transaction date
  amount: number          // Negative for expense, positive for income
  rawMerchantString: string  // Original bank description
  merchantId?: number     // FK to merchants (null = unmatched)
  categoryId?: number     // FK to categories (null = uncategorized)
  importedAt: Date        // When imported
  monthKey: string        // "YYYY-MM" for efficient queries
  importBatchId?: string  // UUID for undo functionality
}
```

### UX Design Requirements

**Source: [ux-design-specification.md#Import-Architecture]**

Import flow from UX spec:

```
Drop CSV → Preview Modal → Map Columns → Confirm → Toast
                ↓
         Auto-detect headers
         Show first 5-10 rows
         Date/Amount/Description selects
```

**Cell States for MonthSlot (already from Story 2.2):**

| State | Appearance | Interaction |
|-------|------------|-------------|
| Empty | Dashed border, muted | Drop target, click to browse |
| Drag over | Highlight border, "Drop here" text | Release to import |
| Processing | Spinner, "Parsing..." | Non-interactive |
| Error | Destructive border, retry icon | Click to retry or browse |
| Imported | Solid border, checkmark, count | Click to view transactions |

**Source: [ux-design-specification.md#Feedback-Patterns]**

Toast feedback pattern:
- "X transactions imported"
- Include Undo button (10 second window)
- Use shadcn Toast component

### Component Structure

```
src/features/import/
├── components/
│   ├── AccountMonthGrid/           # From Story 2.2
│   │   └── index.tsx
│   ├── MonthSlot/                  # From Story 2.2
│   │   └── index.tsx
│   ├── ImportCSVModal/             # NEW
│   │   └── index.tsx
│   └── ColumnMapper/               # NEW (optional extraction)
│       └── index.tsx
├── hooks/
│   ├── useAccountMonthData.ts      # From Story 2.2
│   └── useCSVImport.ts             # NEW
├── services/
│   └── csvImporter.ts              # NEW
└── index.ts

src/lib/csv/
├── parser.ts                       # NEW - PapaParse wrapper
└── parser.test.ts                  # NEW - Unit tests
```

### Column Auto-Detection Patterns

Common header variations to detect:

```typescript
const DATE_PATTERNS = [
  'date', 'transaction date', 'posted date', 'trans date',
  'posting date', 'value date', 'effective date', 'trans. date'
]

const AMOUNT_PATTERNS = [
  'amount', 'debit', 'credit', 'value', 'sum', 'transaction amount',
  'withdrawal', 'deposit', 'money out', 'money in'
]

const DESCRIPTION_PATTERNS = [
  'description', 'merchant', 'narrative', 'details', 'payee',
  'transaction description', 'name', 'particulars', 'reference'
]
```

### Date Format Detection

Common bank statement date formats:

```typescript
const DATE_FORMATS = [
  { pattern: /^\d{2}\/\d{2}\/\d{4}$/, parse: 'DD/MM/YYYY' },  // UK
  { pattern: /^\d{2}\/\d{2}\/\d{4}$/, parse: 'MM/DD/YYYY' },  // US
  { pattern: /^\d{4}-\d{2}-\d{2}$/, parse: 'YYYY-MM-DD' },    // ISO
  { pattern: /^\d{2}-\d{2}-\d{4}$/, parse: 'DD-MM-YYYY' },    // Alt UK
  { pattern: /^\d{2}\.\d{2}\.\d{4}$/, parse: 'DD.MM.YYYY' },  // German
]
```

**Strategy:** Try parsing sample dates with each format, use the one that produces valid dates. Default to letting user select if ambiguous (e.g., 01/02/2024 could be Jan 2 or Feb 1).

### Amount Parsing Logic

Handle different amount formats:

```typescript
const parseAmount = (value: string, isDebitColumn?: boolean): number => {
  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[€$£\s]/g, '')

  // Detect format
  const hasCommaDecimal = /\d,\d{2}$/.test(cleaned)  // European: 1.234,56
  const hasPeriodDecimal = /\d\.\d{2}$/.test(cleaned)  // US: 1,234.56

  if (hasCommaDecimal) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    cleaned = cleaned.replace(/,/g, '')
  }

  // Handle parentheses for negative
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }

  const amount = parseFloat(cleaned)

  // If this is a debit column, ensure negative
  return isDebitColumn ? -Math.abs(amount) : amount
}
```

### Integration with AccountMonthGrid

**From Story 2.2:** MonthSlot has `onFileDropped` callback.

Update to integrate CSV import:

```typescript
// In MonthSlot or parent component
const handleFileDropped = (file: File, monthKey: string) => {
  if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
    setImportModalState({
      isOpen: true,
      file,
      accountId,
      monthKey
    })
  } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    // PDF parsing is Story 2.5
    toast({
      title: "PDF Import",
      description: "PDF import coming soon. Please use CSV for now.",
      variant: "default"
    })
  } else {
    toast({
      title: "Unsupported File",
      description: "Please upload a CSV or PDF file.",
      variant: "destructive"
    })
  }
}
```

### Undo Functionality

Implement via `importBatchId`:

```typescript
// Generate unique batch ID for each import
const importBatchId = crypto.randomUUID()

// Add to each transaction
transactions.forEach(tx => {
  tx.importBatchId = importBatchId
})

// Save transactions
await db.transactions.bulkAdd(transactions)

// Toast with undo
toast({
  title: `${transactions.length} transactions imported`,
  action: (
    <ToastAction altText="Undo" onClick={() => handleUndo(importBatchId)}>
      Undo
    </ToastAction>
  ),
  duration: 10000  // 10 seconds per UX spec
})

// Undo handler
const handleUndo = async (batchId: string) => {
  await db.transactions.where('importBatchId').equals(batchId).delete()
  toast({ title: "Import undone" })
}
```

### shadcn Components to Use

- `Dialog` - Import preview modal container
- `Table` - CSV preview display
- `Select` - Column mapping dropdowns
- `Button` - Import/Cancel actions
- `AlertDialog` - Re-import confirmation (month has existing data)
- `Toast` - Success/error notifications with Undo
- `Label` - Form field labels
- `Skeleton` - Loading state during parsing (if large file)

### Previous Story Context

**Story 2.2 established:**
- AccountMonthGrid component at `src/features/import/components/AccountMonthGrid/`
- MonthSlot component at `src/features/import/components/MonthSlot/`
- useAccountMonthData hook at `src/features/import/hooks/useAccountMonthData.ts`
- Drag-and-drop handlers on MonthSlot (visual feedback)
- Re-import confirmation AlertDialog (show warning, user confirms)

**This story completes:**
- Actual CSV file parsing when file is dropped
- Preview modal with column mapping
- Transaction creation in Dexie database
- Toast notifications with undo

### Performance Considerations

- Use `worker: true` in PapaParse for files > 100 rows (non-blocking)
- Use `preview: 10` for initial preview (don't parse entire file)
- Use `db.transactions.bulkAdd()` for efficient batch insert
- Parsing should complete in < 5s for 500 transactions (NFR5)

### Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Invalid CSV format | "This file doesn't appear to be a valid CSV" | Offer to try different delimiter |
| Parse error | "Some rows couldn't be parsed" | Show count, continue with valid rows |
| Date parse failure | "Couldn't parse date in row X" | Highlight row, suggest format change |
| Database error | "Failed to save transactions" | Retry button, error details in console |
| Empty file | "This file appears to be empty" | Cancel and close modal |

### Validation Checklist

Before marking complete:
- [ ] Can drop CSV file on empty month slot → modal opens
- [ ] Preview shows first 5-10 rows in table
- [ ] Column headers auto-detected for common formats
- [ ] Can manually select Date, Amount, Description columns
- [ ] Date format detection works for common formats
- [ ] Can override date format manually
- [ ] Amount parsing handles US and European formats
- [ ] Amount parsing handles negative amounts (-, parentheses)
- [ ] Import button saves transactions to Dexie
- [ ] Transactions have correct accountId, monthKey
- [ ] Transactions are marked as unmatched (no merchantId)
- [ ] Toast shows "X transactions imported" with Undo
- [ ] Undo button deletes just-imported transactions
- [ ] Month slot updates to show imported state with count
- [ ] Re-import on month with data shows confirmation first
- [ ] File picker button works as alternative to drag-drop
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store parsed CSV data in React state - parse once, save to Dexie
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT block UI during parsing - use worker for large files
- DO NOT hardcode date/amount formats - detect or let user select
- DO NOT add comments/docstrings to code you didn't change

### Edge Cases to Handle

1. **Empty CSV file:** Show error, close modal
2. **CSV with only headers:** Show "No data rows found"
3. **CSV with no headers:** Allow user to manually map column indices
4. **Mixed date formats in same file:** Use majority format or ask user
5. **Amounts with currency symbols:** Strip before parsing
6. **Separate debit/credit columns:** Allow mapping both, combine
7. **Very large files (1000+ rows):** Show progress indicator
8. **Non-UTF8 encoding:** PapaParse handles most, may need encoding detection

### References

- [Source: epics.md#Story-2.3-CSV-Statement-Import-and-Parsing]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Data-Model]
- [Source: ux-design-specification.md#Import-Architecture]
- [Source: ux-design-specification.md#Feedback-Patterns]
- [Source: project-context.md#Data-Access-MOST-IMPORTANT]
- [Source: story 2-2 (previous story)]
- [PapaParse Official](https://www.papaparse.com/)
- [react-papaparse npm](https://www.npmjs.com/package/react-papaparse)
- [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/dialog)
- [shadcn/ui Table](https://ui.shadcn.com/docs/components/table)
- [shadcn/ui Select](https://ui.shadcn.com/docs/components/select)
- [shadcn/ui Toast](https://ui.shadcn.com/docs/components/toast)
- [Dexie.js bulkAdd](https://dexie.org/docs/Table/Table.bulkAdd())

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
