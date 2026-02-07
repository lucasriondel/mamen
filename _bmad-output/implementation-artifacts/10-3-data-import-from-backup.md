# Story 10.3: Data Import from Backup

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to import a previously exported backup file**,
So that **I can restore my data or move to a new device (FR43 complete)**.

## Acceptance Criteria

1. **Given** I have a mamen backup JSON file
   **When** I go to Settings > Data Management > Import Data
   **Then** I can select or drag-drop my backup file
   **And** the file is validated before import

2. **Given** I select a valid backup file
   **When** the file is parsed
   **Then** I see a preview: "X accounts, Y transactions, Z merchants"
   **And** I see the export date and app version from the backup

3. **Given** I have existing data
   **When** I import a backup
   **Then** I'm asked: "Replace all data" or "Merge with existing"
   **And** Replace: clears current data first, then imports
   **And** Merge: adds new records, skips duplicates

4. **Given** I choose "Replace all data"
   **When** import runs
   **Then** all current data is cleared
   **And** backup data is imported
   **And** a toast confirms: "Data restored from backup"

5. **Given** I choose "Merge with existing"
   **When** import runs
   **Then** new accounts/merchants are added
   **And** duplicate transactions are skipped (same account + date + amount + merchant)
   **And** a summary shows: "Added X, skipped Y duplicates"

6. **Given** the backup file is invalid or corrupted
   **When** validation fails
   **Then** I see an error: "Invalid backup file"
   **And** specific issue is explained if possible
   **And** import is aborted, no data is changed

7. **Given** the backup is from a newer app version
   **When** I try to import
   **Then** I see a warning: "Backup from newer version, some data may not import"
   **And** I can proceed or cancel

8. **Given** import completes successfully
   **When** I navigate the app
   **Then** all imported data is available
   **And** merchants, rules, and relationships are intact
   **And** dashboard reflects imported transactions

## Tasks / Subtasks

- [ ] Task 1: Define import types and validation schemas (AC: #1, #2, #6, #7)
  - [ ] Create `src/features/settings/types/import.types.ts`:
    ```typescript
    type ImportMode = 'replace' | 'merge'

    type ImportPreview = {
      metadata: ExportMetadata
      recordCounts: {
        accounts: number
        transactions: number
        merchants: number
        rules: number
        settings: number
      }
      isNewerVersion: boolean
      isValidFormat: boolean
      validationErrors: string[]
    }

    type ImportResult = {
      success: boolean
      mode: ImportMode
      added: {
        accounts: number
        transactions: number
        merchants: number
        rules: number
        settings: number
      }
      skipped: {
        transactions: number
      }
      errors: string[]
    }
    ```
  - [ ] Create `src/features/settings/schemas/import.schema.ts`:
    ```typescript
    import { z } from 'zod'

    const exportMetadataSchema = z.object({
      exportDate: z.string(),
      appVersion: z.string(),
      exportFormat: z.string(),
      recordCounts: z.object({
        accounts: z.number(),
        transactions: z.number(),
        merchants: z.number(),
        rules: z.number(),
        settings: z.number(),
      }),
    })

    const exportDataSchema = z.object({
      metadata: exportMetadataSchema,
      accounts: z.array(z.any()),
      transactions: z.array(z.any()),
      merchants: z.array(z.any()),
      rules: z.array(z.any()),
      settings: z.array(z.any()),
    })
    ```
  - [ ] Use `type` not `interface` (project convention)
  - [ ] Named exports only
  - [ ] Re-use `ExportMetadata` from `src/features/settings/types/export.types.ts`
  - [ ] Test: ImportPreview type has all required fields
  - [ ] Test: ImportResult type tracks added/skipped counts
  - [ ] Test: Zod schema validates correct backup structure
  - [ ] Test: Zod schema rejects invalid backup (missing metadata)
  - [ ] Test: Zod schema rejects backup with missing tables

- [ ] Task 2: Implement import validation service (AC: #1, #2, #6, #7)
  - [ ] Create `src/features/settings/services/importService.ts`:
    ```typescript
    export const parseBackupFile = async (file: File): Promise<ImportPreview> => {
      // 1. Read file as text
      const text = await file.text()

      // 2. Parse JSON (catch SyntaxError)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return {
          metadata: null,
          recordCounts: { accounts: 0, transactions: 0, merchants: 0, rules: 0, settings: 0 },
          isNewerVersion: false,
          isValidFormat: false,
          validationErrors: ['File is not valid JSON'],
        }
      }

      // 3. Validate against Zod schema
      const result = exportDataSchema.safeParse(parsed)
      if (!result.success) {
        return { ..., isValidFormat: false, validationErrors: formatZodErrors(result.error) }
      }

      // 4. Check version compatibility
      const isNewerVersion = compareVersions(result.data.metadata.appVersion, APP_VERSION) > 0

      // 5. Return preview
      return {
        metadata: result.data.metadata,
        recordCounts: result.data.metadata.recordCounts,
        isNewerVersion,
        isValidFormat: true,
        validationErrors: [],
      }
    }
    ```
  - [ ] Use `File.text()` to read file content (async, no FileReader needed)
  - [ ] Wrap `JSON.parse` in try/catch for corrupted files
  - [ ] Validate with Zod `exportDataSchema` from Task 1
  - [ ] Simple semver comparison for version check (split on '.', compare numerically)
  - [ ] Return descriptive validation errors (not raw Zod paths)
  - [ ] Test: Valid backup file returns correct preview with counts
  - [ ] Test: Non-JSON file returns isValidFormat=false with error message
  - [ ] Test: JSON without metadata returns validation error
  - [ ] Test: JSON with wrong structure returns specific Zod errors
  - [ ] Test: Newer version detected correctly
  - [ ] Test: Same version returns isNewerVersion=false
  - [ ] Test: Older version returns isNewerVersion=false
  - [ ] Test: Empty file returns appropriate error

- [ ] Task 3: Implement "Replace" import mode (AC: #4)
  - [ ] Add to `src/features/settings/services/importService.ts`:
    ```typescript
    export const importDataReplace = async (data: ExportData): Promise<ImportResult> => {
      // 1. Clear all tables (same as Clear All Data from Story 10.2)
      await db.delete()
      await db.open()

      // 2. Import all data using Dexie bulkPut
      await db.accounts.bulkPut(data.accounts)
      await db.transactions.bulkPut(data.transactions)
      await db.merchants.bulkPut(data.merchants)
      await db.rules.bulkPut(data.rules)
      await db.settings.bulkPut(data.settings)

      // 3. Return result
      return {
        success: true,
        mode: 'replace',
        added: {
          accounts: data.accounts.length,
          transactions: data.transactions.length,
          merchants: data.merchants.length,
          rules: data.rules.length,
          settings: data.settings.length,
        },
        skipped: { transactions: 0 },
        errors: [],
      }
    }
    ```
  - [ ] Use `db.delete()` then `db.open()` to clear all tables (reuse pattern from Story 10.2 clearDataService)
  - [ ] Use `bulkPut` for efficient batch inserts (upserts by primary key)
  - [ ] Wrap in try/catch for database errors
  - [ ] If any table fails, report in `errors` array
  - [ ] Test: Replace mode clears existing data completely
  - [ ] Test: Replace mode imports all records from backup
  - [ ] Test: Replace mode returns correct added counts
  - [ ] Test: Replace mode preserves all transaction fields (anomalyFlags, isRefund, linkedRefundId)
  - [ ] Test: Replace mode preserves merchant-rule relationships (merchantId on rules)
  - [ ] Test: Replace mode handles empty backup (imports nothing, clears all)
  - [ ] Test: Replace mode recovers from partial failure (at least reports error)

- [ ] Task 4: Implement "Merge" import mode (AC: #5)
  - [ ] Add to `src/features/settings/services/importService.ts`:
    ```typescript
    export const importDataMerge = async (data: ExportData): Promise<ImportResult> => {
      const result: ImportResult = {
        success: true,
        mode: 'merge',
        added: { accounts: 0, transactions: 0, merchants: 0, rules: 0, settings: 0 },
        skipped: { transactions: 0 },
        errors: [],
      }

      // 1. Merge accounts (match by name)
      for (const account of data.accounts) {
        const existing = await db.accounts.where('name').equals(account.name).first()
        if (!existing) {
          await db.accounts.add(account)
          result.added.accounts++
        }
      }

      // 2. Merge merchants (match by name)
      for (const merchant of data.merchants) {
        const existing = await db.merchants.where('name').equals(merchant.name).first()
        if (!existing) {
          await db.merchants.add(merchant)
          result.added.merchants++
        }
      }

      // 3. Merge rules (match by merchantId + pattern)
      for (const rule of data.rules) {
        const existing = await db.rules
          .where({ merchantId: rule.merchantId, pattern: rule.pattern })
          .first()
        if (!existing) {
          await db.rules.add(rule)
          result.added.rules++
        }
      }

      // 4. Merge transactions (dedup by accountId + date + amount + rawMerchantString)
      for (const txn of data.transactions) {
        const existing = await db.transactions
          .where({ accountId: txn.accountId, date: txn.date, amount: txn.amount })
          .filter(t => t.rawMerchantString === txn.rawMerchantString)
          .first()
        if (!existing) {
          await db.transactions.add(txn)
          result.added.transactions++
        } else {
          result.skipped.transactions++
        }
      }

      // 5. Merge settings (overwrite with imported)
      for (const setting of data.settings) {
        await db.settings.put(setting)
        result.added.settings++
      }

      return result
    }
    ```
  - [ ] Accounts: match by name (case-sensitive), skip if exists
  - [ ] Merchants: match by name (case-sensitive), skip if exists
  - [ ] Rules: match by merchantId + pattern combo, skip if exists
  - [ ] Transactions: dedup by accountId + date + amount + rawMerchantString (same dedup logic as Story 2.6)
  - [ ] Settings: always overwrite with imported values (user chose to import)
  - [ ] Track added vs skipped counts for summary
  - [ ] Test: Merge adds new accounts, skips existing
  - [ ] Test: Merge adds new merchants, skips existing
  - [ ] Test: Merge deduplicates transactions by composite key
  - [ ] Test: Merge tracks correct skipped count
  - [ ] Test: Merge with completely new data imports everything
  - [ ] Test: Merge with completely duplicate data skips everything
  - [ ] Test: Merge with mixed data reports correct added/skipped
  - [ ] Test: Merge preserves existing data untouched
  - [ ] Test: Merge handles id conflicts (imported records may have same IDs as existing)

- [ ] Task 5: Create Import Preview component (AC: #2, #3, #7)
  - [ ] Create `src/features/settings/components/ImportPreviewDialog/index.tsx`:
    - Dialog showing backup file summary
    - Display: export date, app version, record counts per table
    - If `isNewerVersion`: yellow warning banner "Backup from newer version (vX.X.X), some data may not import correctly"
    - Import mode selector: two radio buttons -- "Replace all data" / "Merge with existing"
    - "Replace" shows red warning: "This will delete all your current data first"
    - "Merge" shows description: "New records will be added, duplicates skipped"
    - Buttons: "Import" (primary) and "Cancel"
  - [ ] Default mode: "Merge" (safer default)
  - [ ] Use shadcn Dialog, RadioGroup, Button components
  - [ ] Keyboard accessible: Tab between options, Enter to confirm
  - [ ] Test: Preview shows correct record counts from backup
  - [ ] Test: Preview shows export date and version
  - [ ] Test: Version warning appears when isNewerVersion=true
  - [ ] Test: Version warning hidden when isNewerVersion=false
  - [ ] Test: Radio buttons switch between Replace and Merge
  - [ ] Test: Replace warning text visible when Replace selected
  - [ ] Test: Cancel closes dialog without importing
  - [ ] Test: Import button triggers correct mode function

- [ ] Task 6: Create Import Progress/Result component (AC: #4, #5, #8)
  - [ ] Create `src/features/settings/components/ImportResultDialog/index.tsx`:
    - Shows import result summary after completion
    - For Replace: "Data restored from backup -- X accounts, Y transactions, Z merchants imported"
    - For Merge: "Import complete -- Added X accounts, Y transactions. Skipped Z duplicate transactions."
    - If errors: show error list in red
    - "Close" button dismisses dialog
  - [ ] During import: show loading spinner with "Importing data..." text
  - [ ] After import: show result summary
  - [ ] Test: Loading state shows during import
  - [ ] Test: Replace result shows correct added counts
  - [ ] Test: Merge result shows added and skipped counts
  - [ ] Test: Error state shows error messages

- [ ] Task 7: Update Data Management section with Import button (AC: #1)
  - [ ] Modify `src/features/settings/components/DataManagementSection/index.tsx`:
    - Replace disabled "Import Data" placeholder button with active button
    - "Import Data" button opens file picker for .json files
    - Accept only `.json` files: `accept=".json,application/json"`
    - Also support drag-and-drop onto the button/section area
    - On file selection: parse and show ImportPreviewDialog
    - On import complete: show ImportResultDialog
    - On error: show error toast
  - [ ] Hidden file input triggered by button click pattern:
    ```typescript
    const fileInputRef = useRef<HTMLInputElement>(null)
    const handleImportClick = () => fileInputRef.current?.click()
    ```
  - [ ] Drag-and-drop: `onDragOver`, `onDrop` handlers on button area
  - [ ] Only accept single file
  - [ ] Test: Import button is now active (not disabled)
  - [ ] Test: Clicking Import opens file picker
  - [ ] Test: Selecting .json file triggers preview dialog
  - [ ] Test: Non-.json file shows error toast
  - [ ] Test: Drag-and-drop file triggers preview dialog
  - [ ] Test: Multiple files shows error (only single file accepted)

- [ ] Task 8: Implement version comparison utility (AC: #7)
  - [ ] Create `src/features/settings/services/versionCompare.ts`:
    ```typescript
    export const compareVersions = (a: string, b: string): number => {
      const partsA = a.split('.').map(Number)
      const partsB = b.split('.').map(Number)
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] ?? 0
        const numB = partsB[i] ?? 0
        if (numA > numB) return 1
        if (numA < numB) return -1
      }
      return 0
    }
    ```
  - [ ] Simple semver comparison (major.minor.patch)
  - [ ] Returns: 1 if a > b, -1 if a < b, 0 if equal
  - [ ] Handle missing segments (e.g., "1.0" vs "1.0.0")
  - [ ] Test: "1.0.0" vs "1.0.0" returns 0
  - [ ] Test: "1.1.0" vs "1.0.0" returns 1
  - [ ] Test: "1.0.0" vs "2.0.0" returns -1
  - [ ] Test: "0.1.0" vs "0.1.0" returns 0
  - [ ] Test: "1.0" vs "1.0.0" returns 0
  - [ ] Test: Handles non-standard versions gracefully

- [ ] Task 9: Handle ID remapping for merge mode (AC: #5)
  - [ ] When merging, imported records may have IDs that conflict with existing records
  - [ ] Strategy: strip `id` fields from imported records and let Dexie auto-increment assign new IDs
  - [ ] For replace mode: keep original IDs (database is cleared first, no conflicts)
  - [ ] For merge mode: build ID mapping table during import:
    1. Import accounts without IDs, map old account ID → new account ID
    2. Import merchants without IDs, map old merchant ID → new merchant ID
    3. Import rules: remap `merchantId` using merchant ID mapping, strip rule ID
    4. Import transactions: remap `accountId`, `merchantId`, `linkedRefundId` using mappings, strip txn ID
    5. Import settings: use `put` to overwrite by key (no ID remapping needed)
  - [ ] Test: Merged accounts get new IDs
  - [ ] Test: Merged transactions have remapped accountId
  - [ ] Test: Merged rules have remapped merchantId
  - [ ] Test: Merged transactions have remapped linkedRefundId (refund links preserved)
  - [ ] Test: Replace mode keeps original IDs

- [ ] Task 10: Write integration tests (AC: all)
  - [ ] Add `src/features/settings/services/importService.test.ts`:
  - [ ] Full replace import: create backup JSON -> import replace -> verify all data present in Dexie
  - [ ] Full merge import: seed existing data -> import backup -> verify merged correctly
  - [ ] Duplicate detection in merge: seed identical transactions -> import -> verify skipped
  - [ ] Mixed merge: seed some overlapping data -> import -> verify correct added/skipped counts
  - [ ] Invalid file: non-JSON string -> parse -> verify error
  - [ ] Invalid structure: JSON without metadata -> parse -> verify validation error
  - [ ] Newer version warning: backup with version "99.0.0" -> verify isNewerVersion=true
  - [ ] Empty backup: backup with zero records -> replace -> verify empty database
  - [ ] Relationship preservation (replace): backup with linked refunds -> import -> verify links intact
  - [ ] Relationship preservation (merge): backup with merchant-rule relationships -> merge -> verify remapped correctly
  - [ ] Large dataset: 10,000 transactions backup -> import completes within 10 seconds
  - [ ] UI integration: render DataManagementSection -> click Import -> select file -> preview appears -> confirm -> result shows

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `bulkPut` for efficient batch writes | Import writes many records at once |
| Validation | Zod schemas for import data | Runtime validation critical -- untrusted file input |
| Storage | Write to all 5 Dexie tables | accounts, transactions, merchants, rules, settings |
| Service Location | `src/features/settings/services/` | Import is a settings feature |
| ID Strategy | Auto-increment for merge, preserve for replace | Avoid ID conflicts during merge |

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

### Data Model -- What Gets Imported

**All Dexie tables (same structure as export from Story 10.1):**

1. **`accounts`** -- Bank accounts (id, name, type, createdAt)
2. **`transactions`** -- All transactions with:
   - Core fields: id, date, amount, rawMerchantString, accountId
   - Merchant link: merchantId, categoryId
   - Anomaly data: anomalyFlags array
   - Refund data: isRefund, linkedRefundId
   - Duplicate data: isDuplicateExcluded, duplicateNote
3. **`merchants`** -- Merchant entities (id, name, defaultCategoryId, createdAt)
4. **`rules`** -- Regex patterns (id, pattern, merchantId, categoryOverrideId)
5. **`settings`** -- App configuration (key-value pairs: llmConfig, displayPreferences)

**Expected format envelope:**
```json
{
  "metadata": {
    "exportDate": "2026-01-22T...",
    "appVersion": "0.1.0",
    "exportFormat": "mamen-backup-v1",
    "recordCounts": { ... }
  },
  "accounts": [...],
  "transactions": [...],
  "merchants": [...],
  "rules": [...],
  "settings": [...]
}
```

### Previous Story Intelligence

**From Story 10.1 (Export All Data):**
- Export format is defined: JSON with metadata envelope + 5 table arrays
- `ExportMetadata` and `ExportData` types in `src/features/settings/types/export.types.ts`
- `APP_VERSION` constant in `src/lib/constants.ts`
- `exportAllData` service creates the format this story imports
- **Re-use `ExportData` type** for validating imported data structure
- **Re-use `ExportMetadata` type** for preview display

**From Story 10.2 (Settings Page Consolidation):**
- Settings page has 4 sections including Data Management
- `DataManagementSection` component at `src/features/settings/components/DataManagementSection/index.tsx`
- "Import Data" button currently disabled placeholder -- this story enables it
- "Clear All Data" uses `db.delete()` then `db.open()` pattern -- reuse for Replace mode
- `clearDataService.ts` at `src/features/settings/services/clearDataService.ts` -- reuse clear logic
- Storage usage indicator already shows record counts (will update after import via `useLiveQuery`)

**From Story 2.6 (Duplicate Transaction Detection):**
- Import-time dedup logic: same account + date + amount + merchant string = duplicate
- **Reuse same dedup criteria** for merge mode transaction matching
- Dedup is composite key match, not fuzzy

**From Story 8.1-8.3 (Refund Handling):**
- Transactions may have `isRefund`, `linkedRefundId` fields
- In merge mode, `linkedRefundId` must be remapped to new transaction IDs
- In replace mode, original IDs preserved so links remain intact

**Overall project status:**
- All stories 1.1 through 10.2 are `ready-for-dev` -- no implementation code exists yet
- Recent commits are all story creation (planning phase)
- No implementation patterns or code conventions to extract from actual code
- Story 10.3 is the final story in the project (45th of 45)

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `e81adcb` feat(story): create story 10-2 settings page consolidation
- `3dd5df8` feat(story): create story 10-1 export all data

No implementation patterns to analyze. The project is in planning phase.

### UX Design Considerations

**Source: [ux-design-specification.md]**

- **Import flow in Settings > Data Management section:** File picker + drag-and-drop
- **Preview before action:** Always show user what will happen before importing
- **Two-mode choice:** Replace (destructive) vs Merge (additive) -- clear descriptions for each
- **Replace warning:** Red/destructive styling, must acknowledge data loss
- **Merge as default:** Safer option pre-selected
- **Version warning:** Yellow/amber banner, non-blocking (user can proceed)
- **Loading state:** Spinner + "Importing data..." during import
- **Success toast:** "Data restored from backup" (replace) or "Import complete" (merge)
- **Error messages:** Plain English, explain what went wrong specifically
- **Keyboard accessible:** Tab between dialog controls, Enter to confirm
- **File picker:** Accept `.json` only, single file

### File Structure for This Story

```
src/
├── features/
│   └── settings/
│       ├── types/
│       │   ├── export.types.ts (EXISTS from Story 10.1 -- reuse ExportData, ExportMetadata)
│       │   └── import.types.ts (NEW -- ImportMode, ImportPreview, ImportResult)
│       ├── schemas/
│       │   └── import.schema.ts (NEW -- Zod validation for backup file)
│       ├── services/
│       │   ├── exportService.ts (EXISTS from Story 10.1 -- reuse)
│       │   ├── importService.ts (NEW -- parseBackupFile, importDataReplace, importDataMerge)
│       │   ├── importService.test.ts (NEW -- unit + integration tests)
│       │   ├── versionCompare.ts (NEW -- semver comparison utility)
│       │   ├── versionCompare.test.ts (NEW)
│       │   ├── clearDataService.ts (EXISTS from Story 10.2 -- reuse for replace)
│       │   └── downloadFile.ts (EXISTS from Story 10.1 -- not modified)
│       ├── hooks/
│       │   └── useDisplayPreferences.ts (EXISTS from Story 10.2 -- not modified)
│       ├── components/
│       │   ├── SettingsPage/
│       │   │   └── index.tsx (NOT MODIFIED)
│       │   ├── DataManagementSection/
│       │   │   └── index.tsx (MODIFY -- enable Import button, add file handler)
│       │   ├── ImportPreviewDialog/
│       │   │   ├── index.tsx (NEW -- preview + mode selection dialog)
│       │   │   └── ImportPreviewDialog.test.tsx (NEW)
│       │   ├── ImportResultDialog/
│       │   │   ├── index.tsx (NEW -- result summary dialog)
│       │   │   └── ImportResultDialog.test.tsx (NEW)
│       │   ├── ClearDataDialog/
│       │   │   └── index.tsx (EXISTS from Story 10.2 -- not modified)
│       │   └── AboutSection/
│       │       └── index.tsx (EXISTS from Story 10.2 -- not modified)
│       └── index.ts (MODIFY -- export new import service functions)
└── lib/
    └── constants.ts (EXISTS -- APP_VERSION, not modified)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access for `bulkPut`, `add`, `where` |
| `ExportData`, `ExportMetadata` types | `src/features/settings/types/export.types.ts` | Reuse for import validation |
| `clearDataService` | `src/features/settings/services/clearDataService.ts` | Reuse `db.delete()` + `db.open()` for Replace mode |
| `APP_VERSION` | `src/lib/constants.ts` | Version comparison for import |
| `toast` | shadcn/ui toast | Success/error notifications |
| `Dialog`, `Button`, `RadioGroup` | shadcn/ui | UI components |

### Existing Components to Modify

| Component | Change | Risk |
|-----------|--------|------|
| `DataManagementSection/index.tsx` | Enable Import button, add file handler and dialogs | Medium -- changing existing UI behavior |
| `settings/index.ts` | Export new import service functions | Low -- additive |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `SettingsPage/index.tsx` | Section structure already correct from Story 10.2 |
| `DisplayPreferencesSection/` | Unrelated |
| `ClearDataDialog/` | Unrelated |
| `AboutSection/` | Unrelated |
| `exportService.ts` | Export is independent (read-only) |
| `db/schema.ts` | No schema changes |
| Any non-settings feature | Import is self-contained in settings |

### Performance Requirements

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Approach |
|--------|--------|----------|
| File parsing | <2 seconds for 10MB | `File.text()` + `JSON.parse` is fast |
| Zod validation | <1 second | Schema validates structure, not each record deeply |
| Replace import 10k txns | <5 seconds | `db.delete()` + `bulkPut()` is batch-optimized |
| Merge import 10k txns | <10 seconds | Individual queries for dedup are slower than bulk |
| UI responsiveness | Not blocked | Async operations with loading state |
| Memory | Reasonable | Parsed JSON object + Dexie writes; GC after import |

**Optimization notes:**
- `File.text()` is more efficient than FileReader for getting string content
- `JSON.parse` is natively optimized, handles large files well
- Dexie `bulkPut()` for replace mode is much faster than individual `put()` calls
- Merge mode must check for duplicates per-record, which is slower -- acceptable tradeoff for data safety
- For extremely large backups (100k+), could batch the merge in chunks of 1000, but 10k target is well within capability
- Loading state prevents user from thinking app is frozen

### Edge Cases to Handle

1. **Empty backup file:** Valid JSON with zero records -- import succeeds with zero added
2. **Non-JSON file:** `.json` extension but invalid content -- show "File is not valid JSON" error
3. **Valid JSON but wrong structure:** Missing `metadata` or tables -- Zod validation catches, descriptive error
4. **Backup from newer version:** Warning banner, allow proceed (forward compatibility best-effort)
5. **Backup from much older format:** If `exportFormat` is unrecognized, warn user
6. **ID conflicts in merge:** Strip IDs and let Dexie auto-increment -- remap foreign keys
7. **Refund links in merge:** `linkedRefundId` must be remapped to new transaction IDs
8. **Import during export:** Disable Import button while export is running (from Story 10.1)
9. **Import during import:** Disable Import button during import to prevent concurrent imports
10. **Browser crash during import:** Partial data may exist -- Replace mode risk is higher (data cleared then crash before insert). Mitigation: user can re-import. Future: wrap in Dexie transaction.
11. **Very large file (>50MB):** `File.text()` handles it but may be slow -- loading state covers UX
12. **File with extra fields:** Zod `z.any()` on arrays allows extra fields -- forward compatible
13. **Unicode/special characters:** JSON handles natively, no special encoding needed
14. **Orphaned rules after merge:** If merchant wasn't imported (duplicate), rules pointing to old merchantId would be orphaned -- ID remapping prevents this
15. **Settings merge overwrites:** Importing settings always overwrites existing -- user chose to import, this is expected

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` -- use `type`
- DO NOT use default exports -- use named exports
- DO NOT create `__tests__/` directories -- co-locate tests
- DO NOT duplicate Dexie data in React state -- use `useLiveQuery`
- DO NOT read file with `FileReader` -- use `File.text()` (modern, simpler)
- DO NOT validate individual records deeply during import -- validate structure only, trust export format
- DO NOT add streaming JSON parser -- `JSON.parse` is sufficient for expected file sizes
- DO NOT compress/decompress -- backup files are plain JSON (matching export from Story 10.1)
- DO NOT add cloud import -- local file only
- DO NOT auto-detect import mode -- always ask user (Replace vs Merge)
- DO NOT modify export format -- import must match existing export format exactly
- DO NOT add schema migration during import -- if formats diverge, handle in future story
- DO NOT skip ID remapping in merge mode -- this will cause data corruption

### Scope Boundaries

**In scope (this story):**
- `parseBackupFile` function to read, parse, and validate backup JSON
- `importDataReplace` function for full data replacement
- `importDataMerge` function with duplicate detection and ID remapping
- Zod validation schema for backup file structure
- `ImportPreviewDialog` component showing backup summary and mode selection
- `ImportResultDialog` component showing import results
- Version comparison utility
- Enable "Import Data" button in DataManagementSection (replacing placeholder)
- File picker and drag-and-drop support for .json files
- Loading state during import
- Success/error toast notifications
- Unit and integration tests

**Out of scope (future):**
- CSV import format (separate from backup restore)
- Cloud backup import
- Schema migration between backup versions
- Incremental/partial import (e.g., "import only transactions from January")
- Import history / log
- Undo import (would require snapshotting current state first)
- Encrypted backup import
- Batch chunking for >100k records (YAGNI for now)

### Validation Checklist

Before marking complete:
- [ ] File picker accepts .json files only
- [ ] Drag-and-drop works for .json files
- [ ] Invalid/non-JSON files show descriptive error
- [ ] Valid backup shows preview with record counts
- [ ] Preview shows export date and app version
- [ ] Version warning appears for newer backups
- [ ] Replace mode clears all data then imports
- [ ] Replace mode toast: "Data restored from backup"
- [ ] Merge mode adds new records, skips duplicates
- [ ] Merge mode shows "Added X, skipped Y" summary
- [ ] Transaction dedup uses accountId + date + amount + rawMerchantString
- [ ] ID remapping works correctly in merge mode
- [ ] Refund links (linkedRefundId) preserved in both modes
- [ ] Merchant-rule relationships preserved in both modes
- [ ] Anomaly flags preserved on imported transactions
- [ ] Settings imported correctly (overwrite in both modes)
- [ ] Loading state during import
- [ ] Error toast on import failure
- [ ] 10,000 transactions import within 10 seconds (merge) or 5 seconds (replace)
- [ ] All data accessible after import (dashboard, transactions, merchants)
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass
- [ ] No unnecessary external dependencies added
- [ ] Keyboard accessible (Tab, Enter in dialogs)

### Project Structure Notes

- All new files under `src/features/settings/` (import is a settings feature)
- No new Dexie tables or schema changes
- Reuses export types and clear data service from previous stories
- ID remapping is the most complex logic -- critical for merge mode data integrity
- This is the final story (10.3) -- completes the entire project's story catalog

### References

- [Source: epics.md#Epic-10-Story-10.3-Data-Import-from-Backup]
- [Source: prd.md#FR43 - Data persistence across sessions]
- [Source: prd.md#NFR12 - Data persistence survives browser restarts]
- [Source: prd.md#NFR15 - Backup capability (export + import)]
- [Source: architecture.md#Data-Architecture - Dexie tables and bulkPut for batch writes]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/settings/ for settings features]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, Zod, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Settings-Page - Data Management section]
- [Source: ux-design-specification.md#Toast-Notifications - Success/error toast patterns]
- [Source: ux-design-specification.md#Loading-States - Spinner during async operations]
- [Source: 10-1-export-all-data.md - ExportData type, ExportMetadata, export format definition]
- [Source: 10-2-settings-page-consolidation.md - DataManagementSection, ClearDataService, disabled Import placeholder]
- [Source: 2-6-duplicate-transaction-detection.md - Duplicate detection criteria: account+date+amount+merchant]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
