# Story 10.2: Settings Page Consolidation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **a comprehensive settings page to configure all app options**,
So that **I can customize mamen to my preferences and manage my data in one place**.

## Acceptance Criteria

1. **Given** I navigate to Settings
   **When** the page loads
   **Then** I see organized settings sections:
   - LLM Configuration (from Story 2.4)
   - Display Preferences
   - Data Management
   - About

2. **Given** I view LLM Configuration
   **When** looking at the section
   **Then** I see the settings from Story 2.4 (endpoint, API key, model)
   **And** I can test connection
   **And** settings persist across sessions

3. **Given** I view Display Preferences
   **When** looking at the options
   **Then** I can configure:
   - Currency symbol (default, $, £, etc.)
   - Date format (DD/MM/YYYY, MM/DD/YYYY, etc.)
   - Default time period for dashboard
   - Anomaly threshold (2x, 3x, or custom)

4. **Given** I change a display preference
   **When** I save the setting
   **Then** it applies immediately throughout the app
   **And** persists across sessions

5. **Given** I view Data Management
   **When** looking at the section
   **Then** I see:
   - Export All Data button (already implemented in Story 10.1)
   - Import Data button (placeholder for Story 10.3)
   - Clear All Data button (with strong warning)
   - Storage usage indicator

6. **Given** I click "Clear All Data"
   **When** the confirmation appears
   **Then** I see a strong warning: "This will permanently delete all data"
   **And** I must type "DELETE" to confirm
   **And** upon confirmation, all data is cleared
   **And** app returns to first-run state

7. **Given** I view the About section
   **When** looking at the information
   **Then** I see: app version, build date
   **And** link to documentation/help
   **And** link to report issues

## Tasks / Subtasks

- [ ] Task 1: Define display preferences types and Dexie schema (AC: #3, #4)
  - [ ] Create `src/features/settings/types/preferences.types.ts`:
    ```typescript
    type CurrencySymbol = '€' | '$' | '£' | '¥' | '₹' | 'kr' | 'CHF'

    type DateFormatOption = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

    type DashboardTimePeriod = 'this-month' | 'last-month' | 'last-3-months' | 'this-year'

    type AnomalyThreshold = {
      multiplier: number  // default 2
      absoluteAmount?: number  // optional fixed threshold
    }

    type DisplayPreferences = {
      currencySymbol: CurrencySymbol
      dateFormat: DateFormatOption
      defaultDashboardPeriod: DashboardTimePeriod
      anomalyThreshold: AnomalyThreshold
    }
    ```
  - [ ] Use `type` not `interface` (project convention)
  - [ ] Named exports only
  - [ ] Default values: `{ currencySymbol: '€', dateFormat: 'DD/MM/YYYY', defaultDashboardPeriod: 'this-month', anomalyThreshold: { multiplier: 2 } }`
  - [ ] Test: DisplayPreferences type has all required fields

- [ ] Task 2: Create display preferences service (AC: #3, #4)
  - [ ] Create `src/features/settings/services/preferencesService.ts`:
    ```typescript
    export const getDisplayPreferences = async (): Promise<DisplayPreferences>
    export const updateDisplayPreferences = async (prefs: Partial<DisplayPreferences>): Promise<void>
    ```
  - [ ] Read/write from Dexie `settings` table with key `'displayPreferences'`
  - [ ] Return defaults if no saved preferences exist
  - [ ] Merge partial updates with existing preferences
  - [ ] Test: Returns defaults when no preferences saved
  - [ ] Test: Updates individual fields without overwriting others
  - [ ] Test: Persists across reads (write then read returns same)
  - [ ] Test: Handles all currency symbols and date formats

- [ ] Task 3: Create useDisplayPreferences hook (AC: #4)
  - [ ] Create `src/features/settings/hooks/useDisplayPreferences.ts`:
    ```typescript
    export const useDisplayPreferences = () => {
      const prefs = useLiveQuery(() => db.settings.get('displayPreferences'))
      // Return parsed preferences with defaults
    }
    ```
  - [ ] Use `useLiveQuery` for reactive updates (Dexie pattern)
  - [ ] Changes apply instantly across all components consuming this hook
  - [ ] Test: Returns default values initially
  - [ ] Test: Updates reactively when preferences change

- [ ] Task 4: Restructure SettingsPage with sections (AC: #1, #2)
  - [ ] Modify `src/features/settings/components/SettingsPage/index.tsx`:
    - Organize into 4 Card sections: LLM Configuration, Display Preferences, Data Management, About
    - LLM Configuration section: preserved as-is from Story 2.4
    - Use shadcn Card for each section container
    - Each section has clear heading (h2) and description
  - [ ] Layout: vertical stack of Card sections with `space-6` gap
  - [ ] Scroll if content exceeds viewport
  - [ ] Keyboard navigation: Tab between interactive elements
  - [ ] Test: All 4 sections render
  - [ ] Test: LLM Configuration section intact from Story 2.4

- [ ] Task 5: Build Display Preferences section (AC: #3, #4)
  - [ ] Add Display Preferences Card to SettingsPage:
    - Currency symbol: shadcn Select dropdown with symbol options
    - Date format: shadcn Select dropdown with format options
    - Default dashboard period: shadcn Select dropdown
    - Anomaly threshold: Number input (multiplier) + optional absolute amount input
  - [ ] Changes save immediately on selection (no "Save" button needed)
  - [ ] Show toast on save: "Preferences updated"
  - [ ] Use shadcn Select, Input components
  - [ ] Test: Currency symbol select renders all options
  - [ ] Test: Selecting currency triggers save and toast
  - [ ] Test: Date format select works
  - [ ] Test: Anomaly threshold input accepts valid numbers
  - [ ] Test: Invalid anomaly threshold shows inline error
  - [ ] Test: All selects are keyboard navigable

- [ ] Task 6: Build Data Management section (AC: #5, #6)
  - [ ] Add Data Management Card to SettingsPage:
    - "Export All Data" button -- reuse export from Story 10.1
    - "Import Data" button -- disabled placeholder with tooltip "Coming soon"
    - "Clear All Data" button -- destructive variant
    - Storage usage indicator: show record counts per table
  - [ ] Storage usage: Query Dexie for counts: `db.transactions.count()`, `db.accounts.count()`, etc.
  - [ ] Display as: "X accounts, Y transactions, Z merchants, W rules"
  - [ ] "Clear All Data" flow:
    1. Click destructive button
    2. Dialog opens with strong warning
    3. Input field requires typing "DELETE" (case-sensitive)
    4. Confirm button disabled until "DELETE" typed correctly
    5. On confirm: `db.delete()` then `db.open()` (recreates empty tables)
    6. Toast: "All data cleared"
    7. Navigate to Dashboard (first-run empty state)
  - [ ] Test: Export button triggers exportAllData from Story 10.1
  - [ ] Test: Import button disabled with tooltip
  - [ ] Test: Clear All Data dialog requires "DELETE" input
  - [ ] Test: Confirm disabled until "DELETE" typed
  - [ ] Test: Clears all Dexie tables on confirm
  - [ ] Test: Toast appears after clear
  - [ ] Test: Storage usage shows correct counts
  - [ ] Test: Storage usage updates reactively (useLiveQuery)

- [ ] Task 7: Build About section (AC: #7)
  - [ ] Add About Card to SettingsPage:
    - App version from `APP_VERSION` constant (Story 10.1)
    - Build date (can use `__BUILD_DATE__` Vite define or hardcoded)
    - Link: "Documentation" (placeholder href)
    - Link: "Report an issue" (placeholder href)
  - [ ] Use muted text styling for version info
  - [ ] Links open in new tab (`target="_blank" rel="noopener noreferrer"`)
  - [ ] Test: Version displays from APP_VERSION
  - [ ] Test: Links render with correct attributes

- [ ] Task 8: Create formatCurrency and formatDate utilities (AC: #4)
  - [ ] Modify or create `src/lib/utils/formatCurrency.ts`:
    ```typescript
    export const formatCurrency = (amount: number, symbol: CurrencySymbol = '€'): string => {
      return `${symbol}${Math.abs(amount).toFixed(2)}`
    }
    ```
  - [ ] Modify or create `src/lib/utils/formatDate.ts`:
    ```typescript
    export const formatDate = (date: Date | string, format: DateFormatOption = 'DD/MM/YYYY'): string
    ```
  - [ ] These utilities should read from display preferences when called without explicit format
  - [ ] Check if these files already exist from earlier stories and EXTEND, do not recreate
  - [ ] Test: formatCurrency handles all symbols
  - [ ] Test: formatCurrency handles negative amounts (show as positive with symbol)
  - [ ] Test: formatDate handles all 3 format options
  - [ ] Test: formatDate handles Date objects and ISO strings

- [ ] Task 9: Write integration tests (AC: all)
  - [ ] `src/features/settings/components/SettingsPage/SettingsPage.test.tsx`:
  - [ ] Full page renders all 4 sections
  - [ ] LLM Configuration preserved from Story 2.4
  - [ ] Display preferences persist: change currency, reload, verify persisted
  - [ ] Clear All Data end-to-end: seed data -> clear -> verify empty
  - [ ] Storage usage reflects actual data counts
  - [ ] About section shows version
  - [ ] Keyboard navigation: Tab through all controls
  - [ ] Export button integration with exportAllData

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` for reactive settings | Settings changes reflect instantly |
| Storage | `settings` table in Dexie | Key-value pairs: `displayPreferences`, `llmConfig` |
| UI State | React state for Clear dialog | Local UI interaction, not persisted |
| Service Location | `src/features/settings/` | All settings logic in one feature module |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to source |
| Hooks | camelCase with `use` prefix |
| Event handlers | `handle{Event}` naming |

### Data Model -- Settings Table

The `settings` table stores key-value pairs. Keys used:

| Key | Value Type | Set By |
|-----|-----------|--------|
| `llmConfig` | `{ endpoint: string, apiKey?: string, model: string }` | Story 2.4 |
| `displayPreferences` | `DisplayPreferences` | This story |

**Read pattern:** `db.settings.get('displayPreferences')` returns the settings object.
**Write pattern:** `db.settings.put({ id: 'displayPreferences', ...prefs })` upserts.

### Previous Story Intelligence

**From Story 10.1 (Export All Data):**
- `exportAllData` service in `src/features/settings/services/exportService.ts`
- `downloadFile` utility in `src/features/settings/services/downloadFile.ts`
- `APP_VERSION` constant in `src/lib/constants.ts`
- Data Management section already partially scaffolded in SettingsPage
- Export button with loading state, selective checkboxes already implemented
- **Reuse the existing export button/UI** -- do not recreate

**From Story 2.4 (LLM Settings Configuration):**
- LLM Configuration section exists in SettingsPage
- Settings stored in Dexie `settings` table with key `llmConfig`
- Test connection button already implemented
- **Preserve all existing LLM UI** -- do not break or remove

**Overall project status:**
- All stories 1.1 through 10.1 are `ready-for-dev` -- no implementation code exists yet
- This story consolidates existing settings patterns and adds new sections
- The SettingsPage component may need to be created from scratch since no code exists yet, but must include provisions for Story 2.4 and 10.1 sections

### Git Intelligence

Recent commits are all story creation (no implementation code yet):
- `3dd5df8` feat(story): create story 10-1 export all data
- Previous commits: story creation for epics 7-9

No implementation patterns to extract. The project is in planning phase.

### UX Design Considerations

**Source: [ux-design-specification.md]**

- **Settings page structure:** 4 organized sections -- LLM Configuration, Display Preferences, Data Management, About
- **Card-based layout:** Each section in a shadcn Card component
- **Immediate save:** Preferences save on change (no "Save" button), toast confirms
- **Destructive actions:** "Clear All Data" requires typing "DELETE" to confirm
- **Keyboard accessible:** All controls Tab-navigable, selects use arrow keys
- **Error messages:** Plain English: "Please enter a valid threshold number"
- **Loading states:** Not needed (settings read is instant from IndexedDB)
- **Toast pattern:** "Preferences updated" for saves, "All data cleared" for destructive

**Data Management section layout (from UX spec):**
- Export All Data button (from Story 10.1)
- Import Data button (disabled placeholder for Story 10.3)
- Clear All Data button (destructive variant with confirmation dialog)
- Storage usage indicator showing record counts

### File Structure for This Story

```
src/
├── features/
│   └── settings/
│       ├── types/
│       │   ├── export.types.ts (EXISTS from Story 10.1)
│       │   └── preferences.types.ts (NEW -- DisplayPreferences, CurrencySymbol, etc.)
│       ├── services/
│       │   ├── exportService.ts (EXISTS from Story 10.1 -- reuse)
│       │   ├── downloadFile.ts (EXISTS from Story 10.1 -- reuse)
│       │   ├── preferencesService.ts (NEW -- get/update display preferences)
│       │   ├── preferencesService.test.ts (NEW)
│       │   ├── clearDataService.ts (NEW -- clear all Dexie data)
│       │   └── clearDataService.test.ts (NEW)
│       ├── hooks/
│       │   ├── useDisplayPreferences.ts (NEW -- reactive preferences hook)
│       │   └── useDisplayPreferences.test.ts (NEW)
│       ├── components/
│       │   ├── SettingsPage/
│       │   │   ├── index.tsx (MODIFY -- restructure with 4 sections)
│       │   │   └── SettingsPage.test.tsx (NEW/MODIFY)
│       │   ├── DisplayPreferencesSection/
│       │   │   └── index.tsx (NEW -- Display Preferences card)
│       │   ├── DataManagementSection/
│       │   │   └── index.tsx (NEW -- Data Management card with clear + storage)
│       │   ├── ClearDataDialog/
│       │   │   └── index.tsx (NEW -- confirmation dialog with DELETE input)
│       │   └── AboutSection/
│       │       └── index.tsx (NEW -- About card)
│       └── index.ts (MODIFY -- export new services and hooks)
├── lib/
│   ├── utils/
│   │   ├── formatCurrency.ts (NEW or MODIFY -- currency formatting)
│   │   └── formatDate.ts (NEW or MODIFY -- date formatting)
│   └── constants.ts (EXISTS -- APP_VERSION from Story 10.1)
└── types/
    └── settings.types.ts (MODIFY if needed -- add display preferences)
```

### Existing Services to Reuse (NOT re-implement)

| Service | Location | Purpose |
|---------|----------|---------|
| `db` (Dexie instance) | `src/lib/db/index.ts` | Database access |
| `exportAllData` | `src/features/settings/services/exportService.ts` | Data export (Story 10.1) |
| `downloadFile` | `src/features/settings/services/downloadFile.ts` | File download (Story 10.1) |
| `APP_VERSION` | `src/lib/constants.ts` | Version constant (Story 10.1) |
| `toast` | shadcn/ui toast | Notifications |
| `Card`, `Button`, `Select`, `Input`, `Dialog` | shadcn/ui | UI components |

### Existing Components NOT to Modify

| Component | Reason |
|-----------|--------|
| `TransactionRow/` | No changes needed |
| `Dashboard/` | Dashboard reads preferences reactively via hook |
| `CommandPalette/` | No changes needed |
| `Sidebar.tsx` | No changes needed |
| Any import flow components | Unrelated to settings |
| Any merchant/rule components | Unrelated to settings |

### Performance Requirements

| Metric | Target | Approach |
|--------|--------|----------|
| Settings page load | Instant | `useLiveQuery` from IndexedDB, no API calls |
| Preference save | Instant | Single Dexie `put()` call |
| Clear all data | <3 seconds | `db.delete()` + `db.open()` |
| Storage counts | Instant | Dexie `count()` queries (indexed) |
| Preference propagation | Instant | `useLiveQuery` reactivity |

### Edge Cases to Handle

1. **First-run state:** No preferences exist -- use defaults everywhere
2. **Concurrent preference changes:** Not possible (single user), but `useLiveQuery` handles reactivity
3. **Clear data during export:** Disable Clear button while export is running
4. **Clear data confirmation typo:** "Delete" (lowercase) should NOT confirm -- only "DELETE" (exact match)
5. **Browser back after clear:** Dashboard shows empty state, no crash
6. **Large storage counts:** Display formatted numbers (e.g., "12,345 transactions")
7. **Invalid anomaly threshold:** Validate > 0, show inline error
8. **Storage usage while importing:** Counts update reactively via `useLiveQuery`

### Anti-Patterns to AVOID

- DO NOT use `interface` -- use `type`
- DO NOT use default exports -- use named exports
- DO NOT create `__tests__/` directories -- co-locate tests
- DO NOT duplicate Dexie data in React state -- use `useLiveQuery`
- DO NOT recreate export functionality -- reuse from Story 10.1
- DO NOT add a "Save" button for preferences -- save immediately on change
- DO NOT use `localStorage` for preferences -- use Dexie `settings` table
- DO NOT use `window.confirm()` for Clear All Data -- use shadcn Dialog
- DO NOT modify the Dexie schema/migrations for preferences -- use the existing `settings` table with key-value pairs
- DO NOT add theme switching (dark/light) -- dark-only per UX spec
- DO NOT add language/i18n settings -- English only per spec

### Scope Boundaries

**In scope (this story):**
- Settings page with 4 organized sections (Cards)
- Display Preferences: currency, date format, dashboard period, anomaly threshold
- Data Management: export button (reuse 10.1), import placeholder, clear all data, storage usage
- About section: version, links
- Preference persistence via Dexie settings table
- `useDisplayPreferences` hook for reactive app-wide consumption
- `formatCurrency` and `formatDate` utility updates
- Clear All Data with "DELETE" confirmation dialog
- Unit and integration tests

**Out of scope (future stories):**
- Data import from backup (Story 10.3)
- Theme switching (dark-only per UX spec)
- Language/i18n settings
- Keyboard shortcut customization
- Notification preferences
- Data sync / cloud backup
- Account-level settings
- Advanced LLM model management

### Validation Checklist

Before marking complete:
- [ ] Settings page has 4 sections: LLM Config, Display Preferences, Data Management, About
- [ ] LLM Configuration section preserved intact from Story 2.4
- [ ] Currency symbol select works with all options
- [ ] Date format select works with all options
- [ ] Dashboard default period select works
- [ ] Anomaly threshold input validates correctly
- [ ] All preferences save immediately on change (no Save button)
- [ ] All preferences persist across browser sessions
- [ ] `useDisplayPreferences` hook returns current preferences reactively
- [ ] Export All Data button reuses Story 10.1 implementation
- [ ] Import Data button is disabled placeholder
- [ ] Clear All Data requires typing "DELETE" exactly
- [ ] Clear All Data removes all Dexie data
- [ ] Clear All Data navigates to first-run state
- [ ] Storage usage shows correct record counts
- [ ] Storage usage updates reactively
- [ ] About section shows APP_VERSION
- [ ] About section has external links (new tab)
- [ ] formatCurrency handles all currency symbols
- [ ] formatDate handles all date format options
- [ ] All controls keyboard accessible (Tab, arrow keys, Enter)
- [ ] Toast notifications on preference save and data clear
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All new tests pass

### Project Structure Notes

- All new files under `src/features/settings/` (settings feature module)
- No new Dexie tables -- use existing `settings` table with key-value pairs
- Extends SettingsPage component with new sections
- New utilities in `src/lib/utils/` for formatting
- The `useDisplayPreferences` hook will be consumed by dashboard, transaction list, and other features in future
- Clear All Data uses `db.delete()` which drops and recreates the database

### References

- [Source: epics.md#Epic-10-Story-10.2-Settings-Page-Consolidation]
- [Source: prd.md#FR42 - Local data storage]
- [Source: prd.md#FR43 - Data persistence]
- [Source: architecture.md#Data-Architecture - Dexie settings table]
- [Source: architecture.md#Implementation-Patterns - Named exports, type not interface, co-located tests]
- [Source: architecture.md#Project-Structure - src/features/settings/]
- [Source: project-context.md#Technology-Stack - Dexie ^4.2, React 19, Vitest]
- [Source: project-context.md#Critical-Implementation-Rules - No state duplication, useLiveQuery]
- [Source: project-context.md#Anti-Patterns - No interface, no default exports, no __tests__]
- [Source: ux-design-specification.md#Settings-Page-Layout - 4 sections]
- [Source: ux-design-specification.md#Toast-Notifications - Success toast pattern]
- [Source: ux-design-specification.md#Error-Patterns - Plain English messages]
- [Source: ux-design-specification.md#Form-Patterns - Inline validation, select dropdowns]
- [Source: 10-1-export-all-data.md - Export service, APP_VERSION, downloadFile utility]
- [Source: 2-4-llm-settings-configuration.md - LLM Configuration section in SettingsPage]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
