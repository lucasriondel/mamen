# Story 2.5: PDF Statement Import with LLM Parsing

Status: ready-for-dev

## Story

As a **user**,
I want **to import PDF bank statements using LLM parsing**,
So that **I can extract transactions from PDFs without manual data entry (FR1, FR2, FR4)**.

## Acceptance Criteria

1. **Given** I have configured LLM settings
   **When** I drag-and-drop a PDF onto a month slot
   **Then** the system shows "Parsing statement..." with a spinner
   **And** the PDF is sent to the configured LLM endpoint
   **And** the LLM extracts transaction data (date, amount, merchant string)

2. **Given** the LLM successfully parses the PDF
   **When** parsing completes
   **Then** a preview modal shows extracted transactions
   **And** I can review and confirm before importing
   **And** I can edit any incorrectly parsed transactions
   **And** I click "Import" to save transactions

3. **Given** transactions are imported from PDF
   **When** import completes
   **Then** transactions appear in the list with date, amount, raw merchant string
   **And** they are marked as "unmatched"
   **And** a toast confirms "X transactions imported"

4. **Given** the LLM fails to parse the PDF
   **When** an error occurs
   **Then** I see a clear error message: "PDF parsing failed"
   **And** I'm offered the option to try CSV import instead
   **And** the error is not catastrophic - app continues working

5. **Given** the LLM is not configured
   **When** I try to import a PDF
   **Then** I see "LLM not configured" message
   **And** a link to Settings page
   **And** suggestion to use CSV import as alternative

## Tasks / Subtasks

- [ ] Task 1: Create PDF file detection and handling (AC: #1, #5)
  - [ ] Extend `ImportDropzone` in `src/features/import/components/ImportDropzone/index.tsx` to accept PDF files
  - [ ] Update file type validation: accept `.pdf` in addition to `.csv`
  - [ ] Detect file type from MIME type or extension
  - [ ] Route PDF files to LLM parsing flow, CSV files to existing CSV parsing flow
  - [ ] Check LLM configuration before starting PDF parse using `checkLLMRequirements()` from Story 2.4

- [ ] Task 2: Create PDF to text extraction utility (AC: #1)
  - [ ] Create `src/features/import/services/pdfExtractor.ts`
  - [ ] Use `pdf.js` library to extract text from PDF pages
  - [ ] Install pdf.js: `npm install pdfjs-dist`
  - [ ] Handle multi-page PDFs - concatenate all pages
  - [ ] Return extracted text ready for LLM prompt
  - [ ] Handle extraction errors gracefully

- [ ] Task 3: Create LLM parsing service for bank statements (AC: #1)
  - [ ] Create `src/features/import/services/llmStatementParser.ts`
  - [ ] Use LLM client from Story 2.4 (`createLLMClient` from `src/lib/llm/client.ts`)
  - [ ] Craft structured prompt for transaction extraction:
    ```
    Extract all transactions from this bank statement. Return JSON array with:
    - date: YYYY-MM-DD format
    - amount: negative for debits, positive for credits
    - description: raw merchant/description string

    Bank Statement Text:
    {extracted_text}
    ```
  - [ ] Parse LLM response as JSON array of transactions
  - [ ] Validate response structure with Zod schema
  - [ ] Handle malformed LLM responses gracefully

- [ ] Task 4: Create parsing progress UI (AC: #1)
  - [ ] Create loading state in `AccountMonthGrid` when PDF is being parsed
  - [ ] Show spinner with "Parsing statement..." text on the month slot
  - [ ] Prevent additional drops on the same slot while parsing
  - [ ] Add parsing timeout (60 seconds) with progress feedback
  - [ ] Use existing loading patterns from architecture

- [ ] Task 5: Create PDF transaction preview modal (AC: #2)
  - [ ] Create `src/features/import/components/PDFImportPreview/index.tsx`
  - [ ] Reuse patterns from CSV preview modal (Story 2.3)
  - [ ] Display extracted transactions in a table:
    - Date column (editable)
    - Description column (editable)
    - Amount column (editable)
  - [ ] Show transaction count: "Found X transactions"
  - [ ] Add "Import" and "Cancel" buttons
  - [ ] Use shadcn Dialog, Table, Input components

- [ ] Task 6: Implement transaction editing in preview (AC: #2)
  - [ ] Make Date, Description, Amount fields editable inline
  - [ ] Validate date format on edit
  - [ ] Validate amount is a valid number on edit
  - [ ] Allow removing individual transactions from preview (X button per row)
  - [ ] Show validation errors inline
  - [ ] Keep changes in local state until "Import" clicked

- [ ] Task 7: Implement PDF import save logic (AC: #3)
  - [ ] On "Import" click, save transactions to Dexie using existing transaction save logic
  - [ ] Link transactions to selected account and month
  - [ ] Mark all as "unmatched" (no merchantId)
  - [ ] Show toast: "X transactions imported" with count
  - [ ] Update AccountMonthGrid to show imported state (checkmark, count)
  - [ ] Clear preview modal and parsing state

- [ ] Task 8: Implement LLM error handling (AC: #4, #5)
  - [ ] Create error states in `llmStatementParser.ts`:
    - Network error: "Cannot connect to LLM"
    - Timeout: "LLM parsing timed out"
    - Parse error: "Could not extract transactions from PDF"
    - Invalid response: "LLM returned invalid data"
  - [ ] Display user-friendly error messages in modal
  - [ ] Add "Try CSV import instead" button on error
  - [ ] Add "Retry" button for transient errors
  - [ ] Log errors for debugging (console only, no external logging)

- [ ] Task 9: Implement LLM not configured handling (AC: #5)
  - [ ] Check `isLLMConfigured()` before starting PDF parse
  - [ ] If not configured, show modal with:
    - Message: "LLM not configured. Set up an LLM to parse PDF statements."
    - Button: "Go to Settings" (navigates to /settings)
    - Alternative: "Import as CSV instead"
  - [ ] Prevent PDF drop from starting if LLM not configured (immediate feedback)

- [ ] Task 10: Add PDF-specific prompt engineering (AC: #1, #2)
  - [ ] Create `src/lib/llm/prompts.ts` with bank statement parsing prompt
  - [ ] Include examples of expected output format
  - [ ] Handle various bank statement formats:
    - Table-based layouts
    - Line-by-line transaction lists
    - Date formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
    - Amount formats (1,234.56, 1.234,56, -100.00, (100.00))
  - [ ] Add instructions for handling credits vs debits

- [ ] Task 11: Create Zod schema for LLM response validation (AC: #1)
  - [ ] Create `src/lib/schemas/llmTransaction.schema.ts`
  - [ ] Define schema:
    ```typescript
    const llmTransactionSchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number(),
      description: z.string().min(1)
    })
    const llmResponseSchema = z.array(llmTransactionSchema)
    ```
  - [ ] Use schema to validate LLM response before displaying
  - [ ] Provide helpful error messages when validation fails

- [ ] Task 12: Write unit and integration tests (AC: all)
  - [ ] Create `src/features/import/services/llmStatementParser.test.ts`
    - Test successful parsing with mocked LLM response
    - Test handling of malformed LLM response
    - Test timeout handling
  - [ ] Create `src/features/import/services/pdfExtractor.test.ts`
    - Test text extraction from sample PDF
    - Test multi-page PDF handling
  - [ ] Create `src/features/import/components/PDFImportPreview/PDFImportPreview.test.tsx`
    - Test preview renders with transactions
    - Test editing transactions
    - Test removing transactions
    - Test import button saves to Dexie
  - [ ] Tests co-located with source files

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#LLM-Integration]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary | Local LLM (Ollama/LM Studio) | Privacy-first, no external dependency |
| Fallback | BYOK cloud (Claude, OpenAI) | User provides own API key |
| Interface | OpenAI-compatible API | Same code works for local + cloud |
| Pipeline | File embedded directly in prompt → LLM extracts JSON | Vision-capable models handle PDF natively |

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- Transactions saved via `db.transactions.bulkAdd()` for batch import
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

**New transactions from PDF should:**
- Have `source: 'pdf'`
- Have `merchantId: undefined` (unmatched)
- Have `categoryId: undefined` (uncategorized)
- Have `importedAt: new Date()`

### LLM Prompt Engineering

**Structured Prompt Template:**

```typescript
const BANK_STATEMENT_PARSING_PROMPT = `
You are a financial data extraction assistant. Extract all transactions from the following bank statement text.

Return ONLY a valid JSON array with NO additional text. Each transaction object must have:
- "date": string in YYYY-MM-DD format
- "amount": number (negative for debits/purchases, positive for credits/deposits)
- "description": string with the raw merchant/description text

Example output:
[
  {"date": "2026-01-15", "amount": -42.50, "description": "AMAZON.COM*123ABC"},
  {"date": "2026-01-16", "amount": 1500.00, "description": "DIRECT DEPOSIT PAYROLL"}
]

Common patterns:
- Debits/withdrawals/purchases are NEGATIVE amounts
- Credits/deposits/refunds are POSITIVE amounts
- Dates may appear as DD/MM/YYYY, MM/DD/YYYY, or written (Jan 15, 2026) - convert to YYYY-MM-DD
- Amounts may have currency symbols, commas, or parentheses for negatives - extract the number

Bank Statement Text:
---
{statement_text}
---

Return ONLY the JSON array, no explanations.
`
```

### PDF.js Integration

**Installation:**
```bash
npm install pdfjs-dist
```

**Usage Pattern:**

```typescript
// src/features/import/services/pdfExtractor.ts
import * as pdfjs from 'pdfjs-dist'

// Set worker source (required for pdf.js)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }

  return fullText
}
```

### Previous Story Context (Story 2.4)

**Story 2.4 established these utilities that this story MUST use:**

From `src/lib/llm/client.ts`:
- `createLLMClient(settings: LLMSettings)` - Returns configured LLM client
- `isLLMConfigured(settings?: LLMSettings)` - Returns true if valid config exists
- `getLLMError(settings?: LLMSettings)` - Returns user-friendly error if not configured

From `src/lib/llm/guards.ts`:
- `checkLLMRequirements()` - Returns `{ ready: boolean, message?: string, redirectToSettings?: boolean }`

From `src/features/settings/hooks/useSettings.ts`:
- `useSettings()` - Hook to access current settings via `useLiveQuery`

**Integration Pattern:**

```typescript
// In PDF import flow
import { useSettings } from '@/features/settings'
import { checkLLMRequirements, createLLMClient } from '@/lib/llm'

const handlePDFDrop = async (file: File) => {
  const llmCheck = await checkLLMRequirements()
  if (!llmCheck.ready) {
    showError(llmCheck.message)
    if (llmCheck.redirectToSettings) {
      // Show "Go to Settings" option
    }
    return
  }

  // Proceed with PDF parsing
  const settings = await db.settings.get('app')
  const client = createLLMClient(settings.llm)
  // ... use client for parsing
}
```

### CSV Import Patterns to Reuse (Story 2.3)

**From existing CSV import, reuse these patterns:**

1. **Dropzone Integration:**
   - `ImportDropzone` already handles file drops
   - Extend to accept PDF MIME types
   - Route to different parsers based on file type

2. **Preview Modal Pattern:**
   - Similar structure to CSV column mapping modal
   - Table of transactions with editing capability
   - Import/Cancel buttons at bottom

3. **Toast Feedback:**
   - "X transactions imported" success message
   - Error toasts with clear messages
   - Undo functionality (if applicable)

4. **AccountMonthGrid Integration:**
   - Month slot shows "importing" state during process
   - Updates to show checkmark and count after success

### Error Handling Matrix

| Error Type | User Message | Actions Available |
|------------|--------------|-------------------|
| LLM not configured | "LLM not configured. Set up an LLM in Settings to parse PDF statements." | Go to Settings, Import CSV instead |
| Network error | "Cannot connect to LLM at {endpoint}. Check if it's running." | Retry, Import CSV instead |
| Timeout (60s) | "PDF parsing timed out. Try a shorter statement or different LLM." | Retry, Import CSV instead |
| Parse error | "Could not extract transactions from this PDF. The format may not be supported." | Import CSV instead |
| Invalid response | "LLM returned unexpected data. Try again or use CSV import." | Retry, Import CSV instead |
| PDF read error | "Could not read PDF file. The file may be corrupted or password-protected." | Try different file |

### Performance Considerations

- PDF text extraction should complete in <5 seconds for typical statements
- LLM parsing timeout: 60 seconds (large models can be slow)
- Show progress indicator during both extraction and parsing phases
- For very large PDFs, consider chunking or warning user

### Security Considerations

- PDF content is sent to the configured LLM endpoint
- If using cloud LLM, user's financial data leaves their device
- Show warning for cloud LLM providers: "Your statement will be sent to {provider}"
- Local LLM (Ollama) keeps data on device - privacy-first option

### UX Flow Diagram

```
User drops PDF on month slot
         │
         ▼
    Check LLM configured?
         │
    NO ──┼── YES
         │      │
    Show │      ▼
  error  │   Extract text from PDF
  modal  │   (show "Extracting..." spinner)
         │      │
         │      ▼
         │   Send to LLM for parsing
         │   (show "Parsing..." spinner)
         │      │
         │   ERROR ──┼── SUCCESS
         │      │          │
         │   Show     Show preview
         │   error    modal with
         │   modal    transactions
         │              │
         │              ▼
         │         User reviews/edits
         │              │
         │         ┌────┴────┐
         │      Cancel    Import
         │         │         │
         │      Close     Save to Dexie
         │      modal     Show toast
         │                Update grid
```

### Component Structure

```
src/features/import/
├── components/
│   ├── ImportDropzone/
│   │   └── index.tsx           # Extended to handle PDF
│   ├── AccountMonthGrid/
│   │   └── index.tsx           # Already exists
│   └── PDFImportPreview/
│       ├── index.tsx           # New: Preview modal
│       └── PDFImportPreview.test.tsx
├── services/
│   ├── pdfExtractor.ts         # New: PDF text extraction
│   ├── pdfExtractor.test.ts
│   ├── llmStatementParser.ts   # New: LLM parsing logic
│   └── llmStatementParser.test.ts
└── hooks/
    └── usePDFImport.ts         # New: PDF import state hook

src/lib/llm/
├── client.ts                   # From Story 2.4
├── guards.ts                   # From Story 2.4
└── prompts.ts                  # New: Parsing prompts
```

### shadcn Components to Use

- `Dialog` - Preview modal container
- `Table` - Transaction preview table
- `Input` - Inline editing fields
- `Button` - Import, Cancel, Retry actions
- `Toast` - Success/error feedback
- `Spinner/Loader` - Loading states (create or use existing)

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Feature stays within `src/features/import/`
- Shared utilities in `src/lib/llm/`
- No detected conflicts with existing patterns

### Validation Checklist

Before marking complete:
- [ ] PDF files accepted in dropzone (alongside CSV)
- [ ] LLM configuration checked before parsing
- [ ] "LLM not configured" error with Settings link
- [ ] PDF text extracted successfully
- [ ] LLM receives text and returns transactions
- [ ] Preview modal shows extracted transactions
- [ ] Transactions editable in preview
- [ ] Transactions removable from preview
- [ ] Import saves to Dexie correctly
- [ ] Toast shows "X transactions imported"
- [ ] AccountMonthGrid updates after import
- [ ] Error handling for all failure modes
- [ ] "Import CSV instead" fallback available
- [ ] Timeout handling (60s)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store transactions in React state after import - let Dexie + useLiveQuery handle it
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT hardcode LLM endpoints - use settings from Story 2.4
- DO NOT send data to LLM without checking configuration first
- DO NOT swallow errors silently - always show user feedback
- DO NOT add comments/docstrings to code you didn't change
- DO NOT duplicate LLM client logic - use Story 2.4's client

### References

- [Source: epics.md#Story-2.5-PDF-Statement-Import-with-LLM-Parsing]
- [Source: architecture.md#LLM-Integration]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Data-Model]
- [Source: project-context.md#LLM-Integration]
- [Source: story 2-4 (LLM Settings Configuration)]
- [Source: story 2-3 (CSV Statement Import)]
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Dexie.js bulkAdd](https://dexie.org/docs/Table/Table.bulkAdd())
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create)
- [Ollama API](https://docs.ollama.com/api)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
