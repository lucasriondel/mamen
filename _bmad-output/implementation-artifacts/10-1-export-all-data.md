# Story 10.1: Export All Data

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to export all my data as a backup file**,
So that **I can safeguard my data and restore it if needed (FR44)**.

## Acceptance Criteria

1. **Given** I navigate to Settings > Data Management
   **When** I click "Export All Data"
   **Then** a JSON file is generated containing all my data
   **And** the file downloads automatically
   **And** filename includes date: "mamen-backup-YYYY-MM-DD.json"

2. **Given** the export runs
   **When** the file is generated
   **Then** it includes:
   - All accounts
   - All transactions (with anomaly flags, refund links, duplicate exclusions)
   - All merchants with their rules
   - All categories (including custom if any)
   - App settings (LLM config, display preferences)
   - Subscription detection data
   - Linked refund relationships

3. **Given** I have a large dataset (10,000+ transactions)
   **When** I export
   **Then** export completes within reasonable time
   **And** a progress indicator shows if it takes more than 1 second
   **And** the file is well-structured and valid JSON

4. **Given** the export completes
   **When** I view the downloaded file
   **Then** the JSON is formatted (pretty-printed) for readability
   **And** includes a metadata section: export date, app version, record counts

5. **Given** I want to export specific data
   **When** I view export options
   **Then** I can choose: "Export All" (default) or select specific data types
   **And** I can export just transactions, just merchants, etc.

6. **Given** I export my data
   **When** the export completes
   **Then** a toast confirms: "Data exported successfully"
   **And** the file is saved to my downloads folder

## Tasks / Subtasks

- [ ] Task 1: Define export data types and metadata schema (AC: #2, #4)
  - [ ] Create `src/features/settings/types/export.types.ts`:
    ```typescript
    type ExportMetadata = {
      exportDate: string          // ISO 8601
      appVersion: string
      exportFormat: string        // "mamen-backup-v1"
      recordCounts: {
        accounts: number
        transactions: number
        merchants: number
        rules: number
        settings: number
      }
    }

    type ExportData = {
      metadata: ExportMetadata
      accounts: Account[]
      transactions: Transaction[]
      merchants: Merchant[]
      rules: Rule[]
      settings: Settings[]
    }

    type ExportOptions = {
      includeAccounts: boolean
      includeTransactions: boolean
      includeMerchants: boolean
      includeRules: boolean
      includeSettings: boolean
    }
    ```
  - [ ] Use `type` not `interface` (project convention)
  - [ ] Named exports only
  - [ ] Re-use existing types from `src/types/` for Account, Transaction, Merchant, Rule, Settings
  - [ ] Test: ExportMetadata type contains required fields
  - [ ] Test: ExportData type includes all data tables

- [ ] Task 2: Implement export service (AC: #1, #2, #3, #4)
  - [ ] Create `src/features/settings/services/exportService.ts`:
    ```typescript
    export const exportAllData = async (
      options?: Partial<ExportOptions>
    ): Promise<Blob> => {
      const opts: ExportOptions = {
        includeAccounts: true,
        includeTransactions: true,
        includeMerchants: true,
        includeRules: true,
        includeSettings: true,
        ...options,
      }

      // 1. Query each table from Dexie based on options
      const accounts = opts.includeAccounts ? await db.accounts.toArray() : []
      const transactions = opts.includeTransactions ? await db.transactions.toArray() : []
      const merchants = opts.includeMerchants ? await db.merchants.toArray() : []
      const rules = opts.includeRules ? await db.rules.toArray() : []
      const settings = opts.includeSettings ? await db.settings.toArray() : []

      // 2. Build metadata
      const metadata: ExportMetadata = {
        exportDate: new Date().toISOString(),
        appVersion: APP_VERSION,
        exportFormat: 'mamen-backup-v1',
        recordCounts: {
          accounts: accounts.length,
          transactions: transactions.length,
          merchants: merchants.length,
          rules: rules.length,
          settings: settings.length,
        },
      }

      // 3. Compose export object
      const exportData: ExportData = {
        metadata,
        accounts,
        transactions,
        merchants,
        rules,
        settings,
      }

      // 4. Serialize as pretty-printed JSON
      const json = JSON.stringify(exportData, null, 2)

      // 5. Create Blob
      return new Blob([json], { type: 'application/json' })
    }
    ```
  - [ ] `APP_VERSION` from `src/lib/constants.ts` (add if not exists)
  - [ ] Pretty-print with `JSON.stringify(data, null, 2)`
  - [ ] Return `Blob` for download
  - [ ] Test: Export includes all tables when no options provided
  - [ ] Test: Export respects partial options (e.g., transactions only)
  - [ ] Test: Metadata has correct record counts
  - [ ] Test: Metadata has correct exportDate (ISO format)
  - [ ] Test: Metadata has correct exportFormat string
  - [ ] Test: JSON is valid and parseable
  - [ ] Test: Pretty-printed (contains newlines and indentation)
  - [ ] Test: Empty database exports valid JSON with zero counts
  - [ ] Test: 10,000+ transactions export completes (performance)

- [ ] Task 3: Implement file download utility (AC: #1, #6)
  - [ ] Create `src/features/settings/services/downloadFile.ts`:
    ```typescript
    export const downloadFile = (blob: Blob, filename: string): void => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }

    export const generateExportFilename = (): string => {
      const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      return `mamen-backup-${date}.json`
    }
    ```
  - [ ] Use `URL.createObjectURL` + temporary anchor element pattern
  - [ ] Clean up object URL after download to avoid memory leaks
  - [ ] Filename format: `mamen-backup-YYYY-MM-DD.json`
  - [ ] Test: Generated filename matches expected format
  - [ ] Test: Download creates and clicks anchor element
  - [ ] Test: Object URL is revoked after download

- [ ] Task 4: Create Data Management section in Settings page (AC: #1, #5, #6)
  - [ ] Modify `src/features/settings/components/SettingsPage/index.tsx`:
    - Add "Data Management" section (below existing LLM Configuration section if present)
    - Add "Export All Data" button (primary variant)
    - Add selective export checkboxes:
      - Accounts
      - Transactions
      - Merchants & Rules
      - Settings
    - Default: all checked
  - [ ] Section layout: Card component with heading "Data Management"
  - [ ] Export button shows spinner when exporting
  - [ ] Disable button during export to prevent double-click
  - [ ] On success: toast "Data exported successfully"
  - [ ] On error: toast with error message and retry suggestion
  - [ ] Use shadcn Card, Button, Checkbox components
  - [ ] Test: "Export All Data" button renders in Settings
  - [ ] Test: Button shows loading state during export
  - [ ] Test: Button disabled during export
  - [ ] Test: Success toast appears after export
  - [ ] Test: Error toast appears on failure
  - [ ] Test: Selective checkboxes toggle export options
  - [ ] Test: Keyboard accessible (Tab, Enter to export)

- [ ] Task 5: Implement progress indicator for large exports (AC: #3)
  - [ ] Add loading state to export button: spinner + "Exporting..." text
  - [ ] If export takes >1 second, show a progress indication
  - [ ] For large datasets, consider `requestAnimationFrame` to avoid UI freeze
  - [ ] Test: Loading state shown during export
  - [ ] Test: UI remains responsive during large export

- [ ] Task 6: Add export action to command palette (AC: #1)
  - [ ] Add "Export All Data" action to command palette Actions section
  - [ ] Triggers the same export flow as the Settings button
  - [ ] Shows in command palette search results when typing "export" or "backup"
  - [ ] Test: "Export All Data" appears in command palette
  - [ ] Test: Selecting it triggers export

- [ ] Task 7: Add APP_VERSION constant (AC: #4)
  - [ ] Add to `src/lib/constants.ts`:
    ```typescript
    export const APP_VERSION = '0.1.0'
    ```
  - [ ] Used in export metadata
  - [ ] Will be updated during releases
  - [ ] Test: APP_VERSION is defined and non-empty

- [ ] Task 8: Write integration tests (AC: all)
  - [ ] Add `src/features/settings/services/exportService.test.ts`:
  - [ ] Full export: seed database with accounts, transactions, merchants, rules, settings -> export -> parse JSON -> verify all data present
  - [ ] Selective export: export transactions only -> verify only transactions in output, other arrays empty
  - [ ] Empty database: export with no data -> valid JSON with zero counts
  - [ ] Metadata correctness: verify exportDate, appVersion, exportFormat, recordCounts
  - [ ] Large dataset: seed 10,000 transactions -> export completes within 5 seconds
  - [ ] Data integrity: exported transactions have all fields (anomalyFlags, isRefund, etc.)
  - [ ] Refund relationships preserved: linked refunds export with correct references
  - [ ] Merchant-rule relationships preserved: merchants export with their rules
  - [ ] Special characters: transactions with unicode/special chars in merchant strings export correctly
  - [ ] File download: verify Blob creation and anchor element behavior

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `toArray()` for bulk read | Export reads all records, no reactive query needed |
| Storage | Read from all 5 Dexie tables | accounts, transactions, merchants, rules, settings |
| Output | JSON Blob via `URL.createObjectURL` | Browser-native download, no server needed |
| Service Location | `src/features/settings/services/` | Export is a settings feature |
| Validation | Zod schemas for import (Story 10.3) | Export just dumps raw data; validation is for import |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |
| Feature modules | Self-contained under `src/features/settings/` |

### Data Model -- What Gets Exported

**All Dexie tables:**

1. **`accounts`** -- Bank accounts (name, type, createdAt)
2. **`transactions`** -- All transactions with:
   - Core fields: date, amount, rawMerchantString, accountId
   - Merchant link: merchantId, categoryId
   - Anomaly data: anomalyFlags array (high-amount, new-merchant, potential-duplicate)
   - Refund data: isRefund, linkedRefundId
   - Duplicate data: isDuplicateExcluded, duplicateNote
3. **`merchants`** -- Merchant entities (name, defaultCategoryId, createdAt)
4. **`rules`** -- Regex patterns (pattern, merchantId, categoryOverrideId)
5. **`settings`** -- App configuration (LLM endpoint, API key, display prefs, anomaly thresholds)

**Metadata envelope:**
- `exportDate`: ISO 8601 timestamp
- `appVersion`: From `APP_VERSION` constant
- `exportFormat`: `"mamen-backup-v1"` (versioned for future import compatibility)
- `recordCounts`: Per-table counts for quick summary

### Previous Story Intelligence

**Overall project status:**
- All stories 1.1 through 9.5 are `ready-for-dev` -- no implementation code exists yet
- Recent commits are all story creation (planning phase)
- No implementation patterns or code conventions to extract from actual code
- Story 10.1 is the first story in the final epic

**From Story 2.4 (LLM Settings Configuration):**
- Settings page exists at `src/features/settings/components/SettingsPage/index.tsx`
- LLM Configuration section already defined there
- Data Management section should be added below LLM section

**From Story 2.6 (Duplicate Transaction Detection):**
- Import-time dedup is separate from export
- Export should include all transactions including duplicates (user decides what to do with backup)

**From Story 9.3-9.5 (Anomaly Detection):**
- Transactions may have `anomalyFlags` array -- must be included in export
- `isDuplicateExcluded` field on transactions -- must be included
- All anomaly data is embedded on transactions (no separate table)

**From Story 8.1-8.3 (Refund Handling):**
- Transactions may have `isRefund`, `linkedRefundId` -- must be included
- Refund relationships are encoded as foreign keys within transactions

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `4067955` feat(story): create story 9-5 anomaly detection potential duplicates
- `228eced` feat(story): create story 9-4 anomaly detection new merchants

No implementation patterns to analyze. The project is in planning phase.

### UX Design Considerations

**Source: [ux-design-specification.md]**

- **Settings page structure:** Organized sections -- LLM Configuration, Display Preferences, Data Management, About
- **Data Management section:** Export All Data button, Import Data button (Story 10.3), Clear All Data (Story 10.2), Storage usage indicator
- **Toast pattern:** Success toast "Data exported successfully" with standard success variant
- **Loading state:** Disabled button with spinner during export (per loading state patterns)
- **Keyboard accessible:** Tab to button, Enter to trigger export
- **Error messages:** Plain English: "Export failed. Please try again." (per error handling patterns)
- **Undo pattern:** Not applicable (export is non-destructive)

### File Structure for This Story

```
src/
├── features/
│   └── settings/
│       ├── types/
│       │   └── export.types.ts (NEW -- ExportMetadata, ExportData, ExportOptions)
│       ├── services/
│       │   ├── exportService.ts (NEW -- exportAllData function)
│       │   ├── exportService.test.ts (NEW -- unit + integration tests)
│       │   ├── downloadFile.ts (NEW -- browser download utility)
│       │   └── downloadFile.test.ts (NEW -- download tests)
│       ├── components/
│       │   └── SettingsPage/
│       │       └── index.tsx (MODIFY -- add Data Management section)
│       └── index.ts (MODIFY -- export new service functions)
├── lib/
│   └── constants.ts (MODIFY -- add APP_VERSION)
└── components/
    └── CommandPalette/
        └── index.tsx (MODIFY -- add "Export All Data" action)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access for `toArray()` |
| `toast` | `src/components/ui/toast.tsx` | Success/error notifications |
| `cn` | `@/lib/utils` | Conditional class names |
| `Button` | shadcn/ui | Export button |
| `Card` | shadcn/ui | Data Management section container |
| `Checkbox` | shadcn/ui | Selective export options |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `SettingsPage/index.tsx` | Add Data Management section with export UI | Low -- additive section |
| `constants.ts` | Add `APP_VERSION` | Low -- new constant |
| `CommandPalette/index.tsx` | Add "Export All Data" action | Low -- new action item |
| `settings/index.ts` | Export new service functions | Low -- additive |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `TransactionRow/index.tsx` | No transaction-level export UI |
| `Dashboard/` | No dashboard changes for export |
| `Sidebar.tsx` | No sidebar changes |
| `db/schema.ts` | No schema changes (read-only export) |
| `MerchantPage/` | No merchant page changes |
| Anomaly detection services | Export reads data as-is |
| Import flow | Export is independent of import |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| Export 10k transactions | <5 seconds | Single `toArray()` per table, no joins needed |
| UI responsiveness | Not blocked | Use async/await, show loading state |
| JSON serialization | <2 seconds | Native `JSON.stringify`, browser-optimized |
| File download | Instant after generation | `URL.createObjectURL` is synchronous |
| Memory | Reasonable for dataset | JSON string lives in memory briefly, then Blob |

**Optimization notes:**
- Dexie `toArray()` is highly optimized for bulk reads
- `JSON.stringify` with pretty-print adds ~20% overhead vs minified, acceptable for backup files
- For extremely large datasets (100k+), could chunk reads, but 10k target is well within browser capability
- Object URL is created from Blob (efficient memory) and revoked immediately after download

### Edge Cases to Handle

1. **Empty database:** Export valid JSON with empty arrays and zero counts
2. **Export during import:** Allow -- reads snapshot of current data, import continues separately
3. **Browser download restrictions:** Some browsers block auto-downloads; fallback to showing download link
4. **Very large dataset (100k+ transactions):** May take several seconds; progress indicator prevents confusion
5. **Special characters in data:** `JSON.stringify` handles unicode natively; no special encoding needed
6. **Concurrent exports:** Disable button during export to prevent double-click
7. **Browser crashes during export:** Data is read-only; no data loss risk. User retries.
8. **IndexedDB locked:** Extremely rare with Dexie; if occurs, catch error and show retry toast
9. **File size limits:** JSON for 10k transactions ~5-10MB; well within browser Blob limits (up to 2GB)
10. **Date formatting in filename:** Use UTC date to avoid timezone-related filename issues

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` -- use `type`
- DO NOT use default exports -- use named exports
- DO NOT create `__tests__/` directories -- co-locate tests
- DO NOT duplicate Dexie data in React state for export -- read directly from Dexie
- DO NOT modify any Dexie tables during export -- this is a read-only operation
- DO NOT stream/chunk the export unless dataset exceeds 100k records -- YAGNI
- DO NOT add server-side export -- this is a local-first app, export happens in browser
- DO NOT compress the JSON (gzip/zip) -- keep it simple and human-readable for v1
- DO NOT add CSV export option -- JSON only for v1 (matches import format in Story 10.3)
- DO NOT validate data during export -- validation is for import (Story 10.3)
- DO NOT encrypt the backup -- user stores it locally, encryption is their choice

### Scope Boundaries

**In scope (this story):**
- `exportAllData` service function reading all Dexie tables
- `downloadFile` utility for browser download via object URL
- `generateExportFilename` with date-stamped filename
- Export types: `ExportMetadata`, `ExportData`, `ExportOptions`
- Data Management section in Settings page with export button
- Selective export checkboxes (accounts, transactions, merchants/rules, settings)
- Loading state on export button
- Success/error toast notifications
- "Export All Data" action in command palette
- `APP_VERSION` constant
- Pretty-printed JSON output with metadata envelope
- Unit and integration tests

**Out of scope (future stories):**
- CSV export format (Story 10.2 or future)
- Data import from backup (Story 10.3)
- Clear All Data (Story 10.2)
- Storage usage indicator (Story 10.2)
- Export scheduling or auto-backup
- Cloud backup / sync
- Encrypted export
- Export to specific folder (browser limitation)
- Export history / log

### Validation Checklist

Before marking complete:
- [ ] `exportAllData` reads all 5 Dexie tables correctly
- [ ] Metadata includes exportDate (ISO), appVersion, exportFormat, recordCounts
- [ ] JSON is pretty-printed with 2-space indentation
- [ ] Filename format: `mamen-backup-YYYY-MM-DD.json`
- [ ] File downloads via `URL.createObjectURL` + anchor element
- [ ] Object URL revoked after download (no memory leak)
- [ ] Selective export works (e.g., transactions only)
- [ ] Empty database produces valid JSON with zero counts
- [ ] Loading state shown on button during export
- [ ] Button disabled during export (no double-click)
- [ ] Success toast: "Data exported successfully"
- [ ] Error toast on failure with retry suggestion
- [ ] "Export All Data" action in command palette works
- [ ] All transaction fields preserved (anomalyFlags, isRefund, linkedRefundId, isDuplicateExcluded)
- [ ] All merchant-rule relationships preserved
- [ ] Settings exported correctly
- [ ] `APP_VERSION` constant added and used
- [ ] 10,000+ transactions export completes within 5 seconds
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No unnecessary external dependencies added
- [ ] Keyboard accessible (Tab to button, Enter to export)

### Project Structure Notes

- All new files under `src/features/settings/` (export is a settings feature)
- No new Dexie tables or schema changes (read-only operation)
- Minor modification to SettingsPage component (add section)
- Minor modification to CommandPalette (add action)
- New constant in `src/lib/constants.ts`
- No cross-feature dependencies beyond reading Dexie tables

### References

- [Source: epics.md#Epic-10-Story-10.1-Export-All-Data]
- [Source: prd.md#FR44 - User can export their data]
- [Source: prd.md#NFR15 - Backup capability]
- [Source: prd.md#NFR11 - User controls all data export]
- [Source: architecture.md#Data-Architecture - Dexie tables: accounts, transactions, merchants, rules, settings]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/settings/ for settings features]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Settings-Page - Data Management section with Export, Import, Clear]
- [Source: ux-design-specification.md#Toast-Notifications - Success toast pattern]
- [Source: ux-design-specification.md#Loading-States - Disabled button with spinner]
- [Source: ux-design-specification.md#Error-Patterns - Plain English error messages]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
