---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
validationStatus: COMPLETE
totalEpics: 10
totalStories: 45
frCoverage: '44/44 (100%)'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/prd-validation-report.md'
  - '_bmad-output/planning-artifacts/prd-validation-report-v2.md'
---

# mamen - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for mamen, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Data Import & Parsing (FR1-6):**
- FR1: User can upload bank statement files (PDF, CSV) via drag-and-drop or file picker
- FR2: System can parse uploaded PDF bank statements using LLM to extract transaction data
- FR3: System can parse uploaded CSV bank statements to extract transaction data
- FR4: System can extract date, amount, and raw merchant string from each transaction
- FR5: User can import statements from 2 or more bank accounts
- FR6: System can detect and handle duplicate transactions across imports

**Rules Engine & Categorization (FR7-13):**
- FR7: User can create categorization rules with regex pattern matching
- FR8: User can assign categories and subcategories to rules
- FR9: System can automatically apply matching rules to transactions on import
- FR10: User can edit existing rules
- FR11: User can delete rules
- FR12: User can view all defined rules
- FR13: User can create a rule directly from a transaction (R key quick action)

**Transaction Management (FR14-21):**
- FR14: User can view all transactions in a list
- FR15: User can view only unmatched (uncategorized) transactions
- FR16: User can manually assign a category to a transaction
- FR17: User can select multiple transactions for batch operations
- FR18: User can apply a category to multiple selected transactions at once
- FR19: User can mark a transaction as a refund
- FR20: User can link a refund transaction to its original purchase
- FR21: System can exclude linked refunds from category spending totals

**Search & Navigation (FR22-28):**
- FR22: User can open command palette with Cmd+K
- FR23: User can search transactions, merchants, and categories via command palette
- FR24: User can navigate lists using keyboard (J/K for up/down, Enter to select, Esc to close)
- FR25: User can use fuzzy search with typo tolerance (up to 2 character differences)
- FR26: User can use quick actions while focused on a transaction (R=rule, C=category, F=refund)
- FR27: User can toggle focus modes (U=unmatched, M=current month, S=subscriptions)
- FR28: System displays breadcrumb navigation showing current location

**Dashboard & Visualization (FR29-32):**
- FR29: User can view spending breakdown by category
- FR30: User can view spending for a selected time period (month, custom range)
- FR31: User can compare spending between time periods (month-over-month)
- FR32: User can drill down from category totals to individual transactions

**Merchant Management (FR33-35):**
- FR33: User can view a merchant detail page showing all transactions with that merchant
- FR34: User can see total spent and transaction count per merchant
- FR35: System can identify first-time merchants (new to the user)

**Subscription Detection (FR36-38):**
- FR36: System can detect recurring transactions (same merchant, similar amount ±10%, appearing 2+ times at regular intervals)
- FR37: User can view all detected subscriptions in a dedicated view
- FR38: User can see subscription amounts and frequency

**Anomaly Detection (FR39-41):**
- FR39: System can flag transactions exceeding 2x the user's category average or a user-defined threshold
- FR40: System can flag transactions from new/unknown merchants
- FR41: System can flag potential duplicate transactions

**Data Persistence (FR42-44):**
- FR42: System stores all data locally (no server required)
- FR43: User's data persists across browser sessions
- FR44: User can export their data

### NonFunctional Requirements

**Performance:**
- NFR1: UI interaction response < 100ms
- NFR2: Command palette open < 50ms
- NFR3: Search results < 100ms for 10k+ transactions
- NFR4: Initial app load < 2s
- NFR5: Rule application on import < 5s for 500 transactions
- NFR6: Scroll performance 60fps with 1000+ visible rows

**Security & Privacy:**
- NFR7: All user data stored locally (IndexedDB/localStorage)
- NFR8: Financial data never leaves user's device
- NFR9: LLM parsing privacy - Statement content sent to LLM for parsing only; no storage by LLM provider
- NFR10: No authentication - local-only app
- NFR11: User controls all data export

**Reliability & Data Integrity:**
- NFR12: Data persistence - user data survives browser restarts, updates, crashes
- NFR13: No data loss - transactions, rules, categories never silently lost
- NFR14: Import idempotency - re-importing same statement doesn't create duplicates
- NFR15: Backup capability - user can export complete data for backup
- NFR16: Graceful degradation - if LLM parsing fails, user can still manually import CSV

**Accessibility:**
- NFR17: 100% of core actions accessible via keyboard
- NFR18: Clear visual focus state on all interactive elements

### Additional Requirements

**From Architecture - Starter Template (CRITICAL for Epic 1 Story 1):**
- Official Vite + shadcn CLI initialization
- Commands: `npm create vite@latest mamen -- --template react-swc-ts`
- Then: `npx shadcn@latest init` + add required components
- Components to add: command, dialog, table, form, button, dropdown-menu, select, toast, badge, card, tooltip, popover

**From Architecture - Core Dependencies:**
- Zustand ^5.0 for global state management
- Dexie.js ^4.2 for IndexedDB with React hooks
- TanStack Router ^1.153 for type-safe SPA routing
- TanStack Virtual for virtualized lists
- Vitest + React Testing Library for testing
- Lucide React for icons

**From Architecture - Data Model:**
- `accounts` - Bank accounts with metadata
- `transactions` - Individual transactions linked to accounts
- `merchants` - User-defined merchant entities
- `rules` - Regex patterns owned by merchants
- `settings` - App configuration including LLM settings

**From Architecture - LLM Integration:**
- Primary: Local LLM (Ollama/LM Studio) - privacy-first
- Fallback: BYOK cloud (Claude, OpenAI) - user provides own API key
- Interface: OpenAI-compatible API (same code for local + cloud)
- Configuration: Settings page with endpoint URL + optional key

**From Architecture - Implementation Patterns:**
- Use Dexie `useLiveQuery` directly - no state duplication
- Named exports only, no default exports
- Use `type` not `interface` for TypeScript definitions
- Co-located tests with source files (Component.test.tsx next to index.tsx)
- Feature module organization under src/features/
- Command pattern for undo/redo with 10-second toast undo window

**From UX Design - Keyboard-First UX:**
- Command palette (Cmd+K) as primary interface
- J/K list navigation for all lists
- Quick actions: R (assign merchant), C (quick category), F (refund link)
- Focus modes: U (unmatched), M (current month), S (subscriptions)
- Shift+J/K for multi-select, then actions apply to all selected

**From UX Design - Merchant-Centric Model:**
- Merchants own rules (rules exist to match transactions to merchants)
- Default category per merchant, with per-rule category overrides
- Merchant assignment modal with pattern suggestions
- Simple mode (R) vs Power mode (Shift+R) for rule creation
- Multi-select pattern generation from selection

**From UX Design - Custom Components Required:**
- Transaction Row with keyboard focus and quick actions
- Merchant Assignment Modal with pattern suggestions
- Pattern Suggestion Radio Group with live match counts
- Match Preview List showing affected transactions
- Cascade Animation Container for rule application feedback
- Animated Counter for unmatched count
- Account Month Grid for statement import
- Inbox Zero Empty State (celebration when unmatched = 0)
- Merchant Page Layout with stats, rules, transactions

**From UX Design - Visual Design:**
- Dark-first palette (shadcn/ui inspired)
- Linear Layout structure (sidebar + main content)
- 48px transaction row height (dense mode)
- 6px border radius default
- Inter font family with JetBrains Mono for amounts/patterns

**From UX Design - Responsive Strategy:**
- Desktop (1024px+): Primary - full keyboard UX, 220px sidebar
- Tablet (768-1023px): Secondary - collapsed sidebar, touch-friendly
- Mobile (<768px): Tertiary - read-only "check spending" view

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Upload bank statements (PDF/CSV) |
| FR2 | Epic 2 | LLM parsing of PDF statements |
| FR3 | Epic 2 | CSV statement parsing |
| FR4 | Epic 2 | Extract date, amount, merchant string |
| FR5 | Epic 2 | Multiple bank accounts |
| FR6 | Epic 2 | Duplicate detection |
| FR7 | Epic 4 | Create rules with regex |
| FR8 | Epic 4 | Assign categories to rules |
| FR9 | Epic 4 | Auto-apply rules on import |
| FR10 | Epic 4 | Edit rules |
| FR11 | Epic 4 | Delete rules |
| FR12 | Epic 4 | View all rules |
| FR13 | Epic 4 | Create rule from transaction (R key) |
| FR14 | Epic 3 | View all transactions |
| FR15 | Epic 4 | View unmatched transactions |
| FR16 | Epic 4 | Manual category assignment |
| FR17 | Epic 5 | Multi-select transactions |
| FR18 | Epic 5 | Batch category assignment |
| FR19 | Epic 8 | Mark as refund |
| FR20 | Epic 8 | Link refund to purchase |
| FR21 | Epic 8 | Exclude refunds from totals |
| FR22 | Epic 3 | Command palette (Cmd+K) |
| FR23 | Epic 3 | Search via palette |
| FR24 | Epic 3 | Keyboard navigation (J/K) |
| FR25 | Epic 3 | Fuzzy search |
| FR26 | Epic 5 | Quick actions (R/C/F) |
| FR27 | Epic 5 | Focus modes (U/M/S) |
| FR28 | Epic 3 | Breadcrumb navigation |
| FR29 | Epic 6 | Spending by category |
| FR30 | Epic 6 | Time period filtering |
| FR31 | Epic 6 | Month-over-month comparison |
| FR32 | Epic 6 | Drill-down to transactions |
| FR33 | Epic 7 | Merchant detail page |
| FR34 | Epic 7 | Merchant stats |
| FR35 | Epic 7 | First-time merchant detection |
| FR36 | Epic 9 | Subscription detection |
| FR37 | Epic 9 | Subscriptions view |
| FR38 | Epic 9 | Subscription details |
| FR39 | Epic 9 | Flag high amounts |
| FR40 | Epic 9 | Flag new merchants |
| FR41 | Epic 9 | Flag duplicates |
| FR42 | Epic 1, 10 | Local data storage |
| FR43 | Epic 1, 10 | Data persistence |
| FR44 | Epic 10 | Data export |

## Epic List

### Epic 1: Project Foundation & Core Data Layer
Users can run the application with foundational architecture in place, including data persistence that survives browser sessions.

**FRs covered:** FR42, FR43 (partial)

**Notes:** Initializes project using Architecture-specified starter template (Vite + shadcn) and establishes Dexie database schema with all tables.

---

### Epic 2: Account Setup & Statement Import
Users can create bank accounts and import their bank statements (PDF/CSV), seeing raw transactions appear in the app.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

**Notes:** Delivers Journey 1's first phase. Includes LLM parsing integration and Account Month Grid component.

---

### Epic 3: Transaction Viewing & Keyboard Navigation
Users can view all their transactions in a fast, keyboard-navigable list with the command palette for search.

**FRs covered:** FR14, FR22, FR23, FR24, FR25, FR28

**Notes:** Establishes "Linear-like" UX with J/K navigation, Cmd+K command palette, and fuzzy search.

---

### Epic 4: Merchants, Rules & Categorization
Users can create merchants with rules, categorize transactions, and watch the "cascade" effect as rules auto-match transactions.

**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR15, FR16

**Notes:** Core "aha moment" - R key merchant assignment modal, pattern suggestions, cascade animation. Includes Unmatched view.

---

### Epic 5: Batch Operations & Quick Actions
Users can efficiently categorize multiple transactions at once using multi-select and quick actions (R/C/F keys).

**FRs covered:** FR17, FR18, FR26, FR27

**Notes:** Completes power-user workflow with batch operations and focus modes (U/M/S).

---

### Epic 6: Dashboard & Spending Visualization
Users can see where their money goes with category breakdowns, time period filtering, and drill-down to transactions.

**FRs covered:** FR29, FR30, FR31, FR32

**Notes:** Answers "where does my money go?" with spending visualization and comparison.

---

### Epic 7: Merchant Management & Investigation
Users can investigate spending by merchant, seeing detailed stats, all transactions, and managing merchant rules.

**FRs covered:** FR33, FR34, FR35

**Notes:** Supports Journey 3 (Investigation) with merchant detail pages.

---

### Epic 8: Refund Handling
Users can link refunds to original purchases, ensuring accurate net spending calculations.

**FRs covered:** FR19, FR20, FR21

**Notes:** Journey 4 - Refund linking flow with F key quick action.

---

### Epic 9: Subscription & Anomaly Detection
Users can view detected subscriptions and get flagged about unusual transactions (high amounts, new merchants, duplicates).

**FRs covered:** FR36, FR37, FR38, FR39, FR40, FR41

**Notes:** Intelligent detection features that add value over time.

---

### Epic 10: Data Export & Settings
Users can export their data for backup and configure LLM settings for parsing.

**FRs covered:** FR44, FR43 (complete), FR42 (complete)

**Notes:** Completes data persistence with export and settings management.

---

## Epic 1: Project Foundation & Core Data Layer

Users can run the application with foundational architecture in place, including data persistence that survives browser sessions.

### Story 1.1: Initialize Project with Vite and shadcn/ui

As a **developer**,
I want **the project initialized with the specified tech stack (Vite + React + TypeScript + shadcn/ui)**,
So that **I have a solid foundation matching the architecture decisions for building mamen**.

**Acceptance Criteria:**

**Given** I have Node.js installed
**When** I run the project initialization commands
**Then** a new Vite project is created with React 19 and TypeScript 5
**And** SWC compiler is configured for faster builds
**And** shadcn/ui is initialized with Tailwind v4
**And** the following shadcn components are added: command, dialog, table, form, button, dropdown-menu, select, toast, badge, card, tooltip, popover
**And** path aliases are configured (@/components, @/lib, @/features, @/hooks, @/types)
**And** the project runs successfully with `npm run dev`
**And** all core dependencies are installed (zustand, dexie, dexie-react-hooks, @tanstack/react-router, lucide-react)
**And** dev dependencies are installed (vitest, @testing-library/react, @testing-library/jest-dom, jsdom)

---

### Story 1.2: Establish Dexie Database Schema

As a **user**,
I want **my financial data stored locally in a persistent database**,
So that **my data survives browser sessions and is never sent to external servers (FR42, FR43)**.

**Acceptance Criteria:**

**Given** the project is initialized
**When** I create the Dexie database schema
**Then** the following tables are created: accounts, transactions, merchants, rules, settings
**And** TypeScript types are defined in src/types/ for each entity
**And** Zod schemas are defined in src/lib/schemas/ for validation
**And** the Dexie instance is exported from src/lib/db/index.ts
**And** useLiveQuery hook is available for reactive data access
**And** data persists after browser refresh
**And** data persists after browser close and reopen

**Given** I want to verify data integrity
**When** I add a test account and transaction
**Then** the data is stored in IndexedDB
**And** I can query it using useLiveQuery
**And** the data matches the TypeScript types

---

### Story 1.3: Create App Shell with Linear Layout

As a **user**,
I want **the application to have a clean, Linear-inspired layout with sidebar navigation**,
So that **I can navigate between different sections of the app efficiently**.

**Acceptance Criteria:**

**Given** I open the mamen application
**When** the app loads
**Then** I see a sidebar on the left (220px width on desktop)
**And** the sidebar contains navigation items: Dashboard, Transactions, Merchants, Accounts
**And** the sidebar shows placeholder stats section (Unmatched: 0, Merchants: 0)
**And** the main content area fills the remaining width
**And** a header bar shows the app name and placeholder for search trigger
**And** the dark theme from UX spec is applied (dark background, light text)

**Given** I am on desktop (1024px+)
**When** I view the layout
**Then** the sidebar is fully visible at 220px
**And** the main content area is responsive

**Given** I click a navigation item
**When** I select "Dashboard" or "Transactions"
**Then** the route changes via TanStack Router
**And** the corresponding placeholder page is displayed
**And** the active nav item is highlighted

**Given** the app loads for the first time
**When** there is no data
**Then** the Dashboard shows an appropriate empty state
**And** a clear call-to-action guides users to import statements

---

## Epic 2: Account Setup & Statement Import

Users can create bank accounts and import their bank statements (PDF/CSV), seeing raw transactions appear in the app.

### Story 2.1: Create and Manage Bank Accounts

As a **user**,
I want **to create and manage my bank accounts in the app**,
So that **I can organize my statements by account and import from multiple banks (FR5)**.

**Acceptance Criteria:**

**Given** I am on the Accounts page
**When** I click "Add Account"
**Then** a modal appears to create a new account
**And** I can enter an account name (required)
**And** I can optionally select an account type (Checking, Savings, Credit Card, Other)
**And** I can save the account

**Given** I have created an account
**When** I view the Accounts page
**Then** I see all my accounts listed
**And** each account shows its name and type
**And** each account shows transaction count (0 initially)

**Given** I want to edit an account
**When** I click edit on an account
**Then** I can modify the name and type
**And** changes are saved to the database

**Given** I want to delete an account
**When** I click delete on an account
**Then** I see a confirmation warning (account has X transactions)
**And** upon confirmation, the account and all its transactions are deleted
**And** a toast appears with 10-second undo option

**Given** I have no accounts
**When** I view the Accounts page
**Then** I see an empty state prompting me to create my first account

---

### Story 2.2: Account Month Grid for Statement Management

As a **user**,
I want **to see a visual grid of months for each account showing which statements I've imported**,
So that **I can easily track my import coverage and know where to drop new statements**.

**Acceptance Criteria:**

**Given** I have one or more accounts
**When** I view the Accounts page or Import section
**Then** I see each account with a horizontal grid of month slots
**And** the grid shows the current year's months (scrollable if needed)
**And** imported months show a checkmark and transaction count
**And** empty months show a dashed border indicating drop target

**Given** I am viewing the month grid
**When** I hover over an empty month slot
**Then** the slot highlights to indicate it's a drop target
**And** I see "Drop statement here" or similar hint

**Given** I click on an imported month
**When** I select a month with data
**Then** I navigate to transactions filtered by that account and month

**Given** I want to re-import a month
**When** I drop a file on an already-imported month
**Then** I see a confirmation: "Replace X existing transactions?"
**And** I can confirm or cancel

---

### Story 2.3: CSV Statement Import and Parsing

As a **user**,
I want **to import bank statements in CSV format**,
So that **I can see my transactions in the app without needing LLM parsing (FR1, FR3, FR4)**.

**Acceptance Criteria:**

**Given** I have a CSV bank statement file
**When** I drag-and-drop it onto a month slot (or use file picker)
**Then** the system reads the CSV file
**And** a preview modal shows the first few rows
**And** I can map columns to: Date, Amount, Description/Merchant
**And** the system auto-detects common column names

**Given** I have mapped the columns
**When** I click "Import"
**Then** transactions are parsed from the CSV
**And** each transaction has: date, amount, raw merchant string (FR4)
**And** transactions are linked to the selected account and month
**And** transactions are saved to the database
**And** a toast confirms "X transactions imported"

**Given** the CSV has an unrecognized format
**When** auto-detection fails
**Then** I can manually select which column is Date, Amount, Description
**And** I can specify date format if needed

**Given** I import transactions
**When** the import completes
**Then** transactions appear in the transaction list
**And** they are marked as "unmatched" (no merchant assigned yet)
**And** the month slot in the grid shows as imported with count

---

### Story 2.4: LLM Settings Configuration

As a **user**,
I want **to configure my LLM settings for PDF parsing**,
So that **I can use a local LLM for privacy or my own cloud API key**.

**Acceptance Criteria:**

**Given** I navigate to Settings
**When** I view the LLM Configuration section
**Then** I see options for LLM endpoint configuration
**And** I can enter an API endpoint URL (default: http://localhost:11434 for Ollama)
**And** I can optionally enter an API key (for cloud providers)
**And** I can select a model name

**Given** I have configured a local LLM (Ollama)
**When** I save settings
**Then** the endpoint URL is saved to the settings table
**And** no API key is required for local LLM

**Given** I want to use a cloud LLM (BYOK)
**When** I enter my API key and endpoint
**Then** the key is stored locally (never sent anywhere except to that endpoint)
**And** I can test the connection with a "Test Connection" button

**Given** I click "Test Connection"
**When** the LLM is reachable
**Then** I see a success message
**And** the model responds correctly

**Given** the LLM is not configured or unreachable
**When** I try to import a PDF
**Then** I see a clear error directing me to Settings
**And** CSV import still works as fallback (FR graceful degradation)

---

### Story 2.5: PDF Statement Import with LLM Parsing

As a **user**,
I want **to import PDF bank statements using LLM parsing**,
So that **I can extract transactions from PDFs without manual data entry (FR1, FR2, FR4)**.

**Acceptance Criteria:**

**Given** I have configured LLM settings
**When** I drag-and-drop a PDF onto a month slot
**Then** the system shows "Parsing statement..." with a spinner
**And** the PDF is sent to the configured LLM endpoint
**And** the LLM extracts transaction data (date, amount, merchant string)

**Given** the LLM successfully parses the PDF
**When** parsing completes
**Then** a preview modal shows extracted transactions
**And** I can review and confirm before importing
**And** I can edit any incorrectly parsed transactions
**And** I click "Import" to save transactions

**Given** transactions are imported from PDF
**When** import completes
**Then** transactions appear in the list with date, amount, raw merchant string
**And** they are marked as "unmatched"
**And** a toast confirms "X transactions imported"

**Given** the LLM fails to parse the PDF
**When** an error occurs
**Then** I see a clear error message: "PDF parsing failed"
**And** I'm offered the option to try CSV import instead
**And** the error is not catastrophic - app continues working

**Given** the LLM is not configured
**When** I try to import a PDF
**Then** I see "LLM not configured" message
**And** a link to Settings page
**And** suggestion to use CSV import as alternative

---

### Story 2.6: Duplicate Transaction Detection

As a **user**,
I want **the system to detect duplicate transactions when I import**,
So that **I don't accidentally import the same statement twice (FR6)**.

**Acceptance Criteria:**

**Given** I import a statement
**When** transactions match existing transactions (same account + date + amount + merchant string)
**Then** duplicates are flagged in the preview
**And** I see "X duplicates found" warning
**And** duplicates are highlighted in the preview list

**Given** duplicates are detected
**When** I view the import preview
**Then** I can choose to: Skip duplicates (default), Import anyway, Cancel import
**And** the default is to skip duplicates

**Given** I choose to skip duplicates
**When** I confirm import
**Then** only non-duplicate transactions are imported
**And** the toast shows "X imported, Y duplicates skipped"

**Given** I re-import the same month
**When** all transactions are duplicates
**Then** I see "All transactions already exist"
**And** no new transactions are created

---

## Epic 3: Transaction Viewing & Keyboard Navigation

Users can view all their transactions in a fast, keyboard-navigable list with the command palette for search.

### Story 3.1: Transaction List View

As a **user**,
I want **to view all my transactions in a clean, fast list**,
So that **I can see my financial activity at a glance (FR14)**.

**Acceptance Criteria:**

**Given** I have imported transactions
**When** I navigate to the Transactions page
**Then** I see all transactions in a list
**And** each row shows: date, raw merchant string, amount, category badge (or "Unmatched")
**And** amounts are formatted with currency symbol and proper alignment (monospace, right-aligned)
**And** dates are formatted consistently (e.g., "Jan 18")

**Given** I have many transactions (1000+)
**When** I view the transaction list
**Then** the list uses virtualization (TanStack Virtual)
**And** scrolling is smooth at 60fps (NFR6)
**And** only visible rows are rendered

**Given** I view the transaction list
**When** I look at the row styling
**Then** rows are 48px height (dense mode per UX spec)
**And** rows have subtle hover state
**And** unmatched transactions have a visual indicator (warning color or badge)

**Given** I have no transactions
**When** I view the Transactions page
**Then** I see an empty state: "No transactions yet"
**And** a CTA to import statements

**Given** I click on a transaction row
**When** I select a transaction
**Then** the row shows a selected state
**And** I can see more details (or future: quick actions appear)

---

### Story 3.2: Keyboard Navigation with J/K

As a **user**,
I want **to navigate the transaction list using J/K keys like in Linear**,
So that **I can quickly move through transactions without using the mouse (FR24)**.

**Acceptance Criteria:**

**Given** I am on the Transactions page
**When** I press `J`
**Then** focus moves to the next transaction in the list
**And** the focused row has a visible focus ring (per UX spec)
**And** the response is instant (<16ms for 60fps)

**Given** I am on the Transactions page
**When** I press `K`
**Then** focus moves to the previous transaction in the list

**Given** I have focused a transaction
**When** the focused row is near the edge of the viewport
**Then** the list scrolls to keep the focused row visible

**Given** I am at the first transaction
**When** I press `K`
**Then** focus stays on the first transaction (doesn't wrap)

**Given** I am at the last transaction
**When** I press `J`
**Then** focus stays on the last transaction (doesn't wrap)

**Given** I have focused a transaction
**When** I press `Enter`
**Then** the transaction is selected
**And** the row shows selected state

**Given** I have a selection or focus
**When** I press `Esc`
**Then** selection/focus is cleared
**And** keyboard focus returns to the list container

**Given** I am typing in an input field
**When** I press `J` or `K`
**Then** the keys type normally (navigation disabled in inputs)

---

### Story 3.3: Command Palette Foundation

As a **user**,
I want **to open a command palette with Cmd+K**,
So that **I can quickly access actions and search without navigating menus (FR22)**.

**Acceptance Criteria:**

**Given** I am anywhere in the app
**When** I press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
**Then** the command palette opens
**And** it opens in under 50ms (NFR2)
**And** focus is immediately in the search input

**Given** the command palette is open
**When** I view its structure
**Then** I see a search input at the top
**And** I see grouped sections below: Recent, Actions, Navigation
**And** the palette is styled per UX spec (dark popover, centered)

**Given** the command palette is open
**When** I press `Esc`
**Then** the palette closes
**And** focus returns to where it was before

**Given** the command palette is open
**When** I click outside the palette
**Then** the palette closes

**Given** the command palette shows results
**When** I press `↑` or `↓`
**Then** I can navigate through results
**And** the selected result is highlighted

**Given** I have a result selected
**When** I press `Enter`
**Then** the action is executed (navigation or action)
**And** the palette closes

**Given** the command palette is open
**When** I view the Actions section
**Then** I see: "Import statement", "View unmatched", "View subscriptions"
**And** each action shows its keyboard shortcut if applicable

---

### Story 3.4: Transaction Search via Command Palette

As a **user**,
I want **to search transactions through the command palette**,
So that **I can quickly find specific transactions by merchant or amount (FR23, FR25)**.

**Acceptance Criteria:**

**Given** the command palette is open
**When** I type a search query
**Then** results appear instantly (<100ms) (NFR3)
**And** transactions matching the query are shown
**And** results are grouped by type (Transactions, Merchants, Categories)

**Given** I search for a merchant name
**When** I type "amazon"
**Then** transactions with "amazon" in the merchant string appear
**And** the match is case-insensitive

**Given** I make a typo in my search
**When** I type "amazn" (missing 'o')
**Then** fuzzy search still finds "Amazon" transactions (FR25: up to 2 char tolerance)

**Given** I search and get results
**When** I select a transaction result
**Then** I navigate to the Transactions page
**And** the selected transaction is focused/highlighted

**Given** I search for an amount
**When** I type "29.99"
**Then** transactions with that amount appear in results

**Given** I have 10,000+ transactions
**When** I search
**Then** results still appear in under 100ms (NFR3)
**And** results are limited to top 10-20 matches for performance

**Given** my search has no results
**When** nothing matches
**Then** I see "No results for '[query]'"
**And** the palette doesn't close automatically

---

### Story 3.5: Breadcrumb Navigation

As a **user**,
I want **to see my current location in the app via breadcrumbs**,
So that **I always know where I am and can navigate back easily (FR28)**.

**Acceptance Criteria:**

**Given** I am on any page
**When** I view the header/content area
**Then** I see breadcrumb navigation showing my current location
**And** the format is: "Section > Subsection > Detail"

**Given** I am on the Dashboard
**When** I view breadcrumbs
**Then** I see: "Dashboard"

**Given** I am viewing transactions for a specific account
**When** I view breadcrumbs
**Then** I see: "Transactions > [Account Name]"

**Given** I am on a merchant detail page (future epic)
**When** I view breadcrumbs
**Then** I see: "Merchants > [Merchant Name]"

**Given** I see multiple breadcrumb segments
**When** I click on an earlier segment
**Then** I navigate to that location
**And** the URL updates accordingly

**Given** the breadcrumb path is long
**When** space is limited
**Then** middle segments are truncated: "Dashboard > ... > Detail"
**And** full path is visible on hover/tooltip

---

## Epic 4: Merchants, Rules & Categorization

Users can create merchants with rules, categorize transactions, and watch the "cascade" effect as rules auto-match transactions.

### Story 4.1: Category System Setup

As a **user**,
I want **a predefined set of spending categories with subcategories**,
So that **I can organize my transactions meaningfully (FR8)**.

**Acceptance Criteria:**

**Given** I use the app for the first time
**When** the database initializes
**Then** default categories are seeded:
- Shopping (Online, Groceries, Clothing, Electronics, Other)
- Dining (Restaurants, Coffee, Fast Food, Delivery)
- Transportation (Rideshare, Public Transit, Gas, Parking)
- Subscriptions (Streaming, Software, Memberships)
- Housing (Rent, Utilities, Insurance, Maintenance)
- Health (Medical, Pharmacy, Fitness)
- Entertainment (Events, Games, Hobbies)
- Travel (Flights, Hotels, Activities)
- Income (Salary, Freelance, Refunds, Other)
- Other (Uncategorized)

**Given** I want to view categories
**When** I access category selection (in modals or settings)
**Then** categories are shown with their subcategories
**And** the picker is searchable and keyboard-navigable

**Given** I select a category
**When** assigning to a transaction or merchant
**Then** I can select the parent category
**And** optionally select a subcategory
**And** format displays as "Category > Subcategory"

---

### Story 4.2: Unmatched Transactions View

As a **user**,
I want **to see only my unmatched (uncategorized) transactions**,
So that **I can focus on triaging my "inbox" and reach inbox zero (FR15)**.

**Acceptance Criteria:**

**Given** I have transactions with and without merchants
**When** I press `U` or select "Unmatched" in sidebar
**Then** the transaction list filters to show only unmatched transactions
**And** the view title/breadcrumb shows "Unmatched"

**Given** I am in Unmatched view
**When** I view the sidebar
**Then** "Unmatched" is highlighted as active
**And** the unmatched count is displayed (e.g., "Unmatched (12)")

**Given** I am in Unmatched view
**When** I press `U` again or click "All Transactions"
**Then** the filter is removed
**And** I see all transactions again

**Given** I have unmatched transactions
**When** I view the Unmatched count in sidebar
**Then** the count updates in real-time as transactions are categorized

**Given** all transactions are matched
**When** I am in Unmatched view
**Then** I see the Inbox Zero empty state: "All caught up!" with checkmark
**And** a CTA to "View Dashboard"

---

### Story 4.3: Create Merchant with Rule (R Key)

As a **user**,
I want **to create a new merchant with a matching rule from a transaction**,
So that **similar transactions are automatically categorized in the future (FR7, FR8, FR13)**.

**Acceptance Criteria:**

**Given** I have focused a transaction (with J/K)
**When** I press `R`
**Then** the Merchant Assignment Modal opens
**And** the transaction's raw merchant string is displayed
**And** "New merchant" is selected by default

**Given** the modal is open for a new merchant
**When** I view the form
**Then** I see a merchant name input (pre-filled with cleaned merchant string)
**And** I see pattern suggestions:
  - Exact match: "AMZN*1234XYZ" (1 transaction)
  - Prefix match: "AMZN*" (X transactions) - if common prefix found
  - Custom pattern option
**And** each suggestion shows live match count

**Given** I select a pattern suggestion
**When** the match count updates
**Then** I see how many transactions will be categorized
**And** a preview list shows sample matching transactions (first 3 + "and X more")

**Given** I fill out the merchant form
**When** I enter merchant name, select pattern, select category
**Then** the "Create" button is enabled
**And** I can check "Set as default category for this merchant"

**Given** I click "Create" (or press Enter)
**When** the merchant and rule are saved
**Then** the modal closes
**And** all matching transactions are assigned to the merchant
**And** matching transactions receive the selected category
**And** a toast shows: "X transactions → [Merchant Name]" with Undo

**Given** I want power-user regex mode
**When** I press `Shift+R` or select "Custom pattern"
**Then** I can enter a raw regex pattern
**And** live validation shows if pattern is valid
**And** a regex cheatsheet is available via [?] icon

---

### Story 4.4: Assign Transaction to Existing Merchant

As a **user**,
I want **to add a new rule to an existing merchant**,
So that **I can capture different transaction string patterns for the same merchant (FR7, FR10)**.

**Acceptance Criteria:**

**Given** the Merchant Assignment Modal is open
**When** I select "Existing merchant"
**Then** I see a searchable dropdown of existing merchants
**And** selecting a merchant shows its current rules

**Given** I select an existing merchant
**When** I view the modal
**Then** I see the merchant's existing rules listed
**And** I see options to add a new rule pattern
**And** the category defaults to the merchant's default category

**Given** I want to override the category for this rule
**When** I check "Override category for this rule"
**Then** I can select a different category
**And** this rule will categorize to the override, not merchant default

**Given** I add a rule to an existing merchant
**When** I click "Add Rule"
**Then** the new rule is saved to the merchant
**And** matching transactions are assigned to the merchant
**And** a toast confirms the action with Undo

**Given** my new pattern overlaps with another merchant's rule
**When** conflict is detected
**Then** I see a warning: "Pattern overlaps with [Other Merchant]"
**And** I'm informed which is more specific (takes priority)
**And** I can proceed or adjust

---

### Story 4.5: Rules Engine - Auto-Apply on Import

As a **user**,
I want **my rules to automatically categorize transactions when I import new statements**,
So that **my rule investment pays off over time (FR9)**.

**Acceptance Criteria:**

**Given** I have existing merchants with rules
**When** I import a new statement (CSV or PDF)
**Then** the rules engine runs against all new transactions
**And** matching transactions are auto-assigned to merchants
**And** matching transactions receive the appropriate category

**Given** rules are applied on import
**When** import completes
**Then** the import summary shows: "X auto-matched, Y unmatched"
**And** only unmatched transactions need manual triage

**Given** multiple rules could match a transaction
**When** the rules engine runs
**Then** the most specific rule wins (longest pattern match)
**And** in case of tie, the most recently created rule wins

**Given** a transaction matches a rule with category override
**When** the rule is applied
**Then** the override category is used, not merchant default

**Given** I have 500 transactions and 50 rules
**When** rules are applied
**Then** processing completes in under 5 seconds (NFR5)

---

### Story 4.6: View and Manage Rules

As a **user**,
I want **to view all my rules and edit or delete them**,
So that **I can maintain my categorization system over time (FR10, FR11, FR12)**.

**Acceptance Criteria:**

**Given** I want to see all rules
**When** I navigate to a Rules view (via Settings or dedicated page)
**Then** I see all rules grouped by merchant
**And** each rule shows: pattern, match count, category (default or override)

**Given** I view a merchant's rules
**When** I look at the rules list
**Then** I see each rule's pattern in monospace font
**And** I see how many transactions each rule has matched

**Given** I want to edit a rule
**When** I click edit on a rule
**Then** I can modify the pattern
**And** I can modify the category override
**And** changes are validated (pattern must be valid regex)
**And** I see a preview of affected transactions

**Given** I save rule changes
**When** the pattern changes
**Then** transactions are re-evaluated against the new pattern
**And** a toast confirms the change with Undo

**Given** I want to delete a rule
**When** I click delete on a rule
**Then** I see a confirmation: "Transactions will become unmatched"
**And** upon confirmation, the rule is deleted
**And** affected transactions lose their merchant/category assignment
**And** a toast confirms with Undo

---

### Story 4.7: Quick Category Assignment (C Key)

As a **user**,
I want **to assign a category directly to a transaction without creating a merchant**,
So that **I can handle one-off transactions quickly (FR16)**.

**Acceptance Criteria:**

**Given** I have focused a transaction
**When** I press `C`
**Then** a quick category picker appears
**And** it's a searchable dropdown of all categories

**Given** the category picker is open
**When** I type to search
**Then** categories are filtered by name
**And** I can use ↑↓ to navigate and Enter to select

**Given** I select a category
**When** I confirm the selection
**Then** the transaction is assigned that category
**And** the transaction is NOT assigned to any merchant
**And** a toast confirms: "Categorized as [Category]" with Undo

**Given** a transaction has a category but no merchant
**When** I view the transaction
**Then** it shows the category badge
**And** it's considered "matched" (not in Unmatched view)
**And** it shows "Manual" or similar to indicate no rule

---

### Story 4.8: Cascade Animation & Feedback

As a **user**,
I want **satisfying visual feedback when a rule categorizes multiple transactions**,
So that **I feel the reward of my rule-building investment**.

**Acceptance Criteria:**

**Given** I create a rule that matches multiple transactions
**When** the rule is applied
**Then** matching transactions briefly highlight (glow animation)
**And** category badges fade in on each row
**And** animation is staggered (50ms per row, max 10 animated)

**Given** the cascade animation plays
**When** transactions are categorized
**Then** the Unmatched counter animates down
**And** the counter shows the number decreasing with easing
**And** the animation completes in under 600ms

**Given** the user has `prefers-reduced-motion` enabled
**When** a rule is applied
**Then** animations are disabled
**And** state changes are instant
**And** counter still updates (no animation)

**Given** the unmatched count reaches zero
**When** in Unmatched view
**Then** the counter shows "0" in success color
**And** a subtle celebration state appears

**Given** a rule matches transactions
**When** the toast appears
**Then** it shows: "[X] transactions → [Merchant Name]"
**And** an Undo button is available for 10 seconds

---

## Epic 5: Batch Operations & Quick Actions

Users can efficiently categorize multiple transactions at once using multi-select and quick actions (R/C/F keys).

### Story 5.1: Multi-Select Transactions (Shift+J/K)

As a **user**,
I want **to select multiple transactions using Shift+J/K**,
So that **I can perform batch operations efficiently (FR17)**.

**Acceptance Criteria:**

**Given** I have focused a transaction with J/K
**When** I press `Shift+J`
**Then** the selection extends to include the next transaction
**And** both the original and new transaction show selected state
**And** a selection count appears: "2 selected"

**Given** I have focused a transaction
**When** I press `Shift+K`
**Then** the selection extends to include the previous transaction

**Given** I have multiple transactions selected
**When** I continue pressing `Shift+J` or `Shift+K`
**Then** the selection continues to extend
**And** the selection count updates in real-time

**Given** I have transactions selected
**When** I view the transaction list
**Then** selected transactions have a distinct visual state (checkbox visible, background highlight)
**And** the selection count shows in a status bar or floating indicator

**Given** I have transactions selected
**When** I press `Esc`
**Then** all selections are cleared
**And** focus returns to single-transaction mode

**Given** I have transactions selected
**When** I press `J` or `K` without Shift
**Then** selection is cleared
**And** focus moves to a single transaction (standard navigation)

**Given** I want to select non-contiguous transactions
**When** I navigate to another transaction and press `Space` or `X`
**Then** that transaction toggles its selection state
**And** I can build a non-contiguous selection

---

### Story 5.2: Batch Merchant Assignment

As a **user**,
I want **to assign multiple selected transactions to a merchant at once**,
So that **I can quickly categorize similar transactions (FR18)**.

**Acceptance Criteria:**

**Given** I have 2+ transactions selected
**When** I press `R`
**Then** the Merchant Assignment Modal opens
**And** it shows: "Assign X Transactions to Merchant"
**And** all selected transaction strings are listed

**Given** the batch modal is open
**When** the system analyzes selected transactions
**Then** pattern suggestions are generated:
  - Common prefix pattern if found (e.g., "UBER.*" for UBER TRIP, UBER EATS)
  - Combined pattern if different roots (e.g., "(UBER|LYFT).*")
  - "No common pattern" fallback if too diverse

**Given** a common pattern is found
**When** I view the suggestions
**Then** I see the pattern with match count
**And** match count includes selected transactions + any other matches
**And** I'm warned if pattern matches unselected transactions

**Given** the pattern matches unwanted transactions
**When** a warning appears
**Then** I see: "Pattern also matches X other transactions"
**And** I can view which transactions
**And** I can choose to adjust the pattern or create separate merchants

**Given** no common pattern is found
**When** transactions are too diverse
**Then** I see: "No common pattern found"
**And** Options: "Create merchant with multiple rules", "Assign without rule", "Cancel"

**Given** I confirm the batch assignment
**When** I click "Create" or "Add Rule"
**Then** all selected transactions are assigned to the merchant
**And** the rule(s) are created
**And** a toast shows: "X transactions → [Merchant]" with Undo
**And** selection is cleared

---

### Story 5.3: Batch Category Assignment

As a **user**,
I want **to assign a category to multiple transactions at once without creating a merchant**,
So that **I can quickly categorize one-off transactions in bulk (FR18)**.

**Acceptance Criteria:**

**Given** I have 2+ transactions selected
**When** I press `C`
**Then** the quick category picker opens
**And** it shows: "Categorize X transactions"

**Given** the category picker is open for batch
**When** I select a category
**Then** all selected transactions receive that category
**And** transactions are NOT assigned to any merchant
**And** a toast confirms: "X transactions → [Category]" with Undo

**Given** some selected transactions already have categories
**When** I apply a new category
**Then** all selected transactions are updated to the new category
**And** the toast indicates how many were changed

**Given** I complete a batch category assignment
**When** the operation finishes
**Then** selection is cleared
**And** focus returns to the first previously-selected transaction

---

### Story 5.4: Focus Mode - Current Month (M Key)

As a **user**,
I want **to quickly filter transactions to the current month**,
So that **I can focus on recent activity for my monthly review (FR27)**.

**Acceptance Criteria:**

**Given** I am on the Transactions page
**When** I press `M`
**Then** transactions are filtered to the current month only
**And** the view title/breadcrumb shows "This Month" or "January 2026"
**And** the sidebar shows "This Month" as active

**Given** I am in Month focus mode
**When** I view the sidebar
**Then** "M This Month" is highlighted
**And** the transaction count for this month is shown

**Given** I am in Month focus mode
**When** I press `M` again
**Then** the filter is toggled off
**And** I see all transactions

**Given** I am in Month focus mode
**When** I press `U` (Unmatched)
**Then** filters combine: unmatched transactions from this month
**And** both modes are shown as active

**Given** I am in Month focus mode
**When** I press `A` (All)
**Then** all filters are cleared
**And** I see all transactions

---

### Story 5.5: Focus Mode - Subscriptions Placeholder (S Key)

As a **user**,
I want **the S key to filter to subscription transactions**,
So that **I can review my recurring charges (FR27)**.

**Acceptance Criteria:**

**Given** I am on the Transactions page
**When** I press `S`
**Then** the view attempts to filter to subscriptions
**And** since subscription detection is not yet implemented (Epic 9), a placeholder state appears

**Given** subscription detection is not yet available
**When** I press `S`
**Then** I see a message: "Subscription detection coming soon"
**And** or: the filter activates but shows no results with explanation

**Given** I am in Subscriptions focus mode (placeholder)
**When** I press `S` again or `A`
**Then** the filter is cleared

**Note:** This story establishes the keyboard binding and UI structure. Full functionality comes in Epic 9.

---

## Epic 6: Dashboard & Spending Visualization

Users can see where their money goes with category breakdowns, time period filtering, and drill-down to transactions.

### Story 6.1: Spending Breakdown by Category

As a **user**,
I want **to see my spending broken down by category on the dashboard**,
So that **I can answer "where does my money go?" at a glance (FR29)**.

**Acceptance Criteria:**

**Given** I have categorized transactions
**When** I view the Dashboard
**Then** I see a spending breakdown by category
**And** each category shows its total amount
**And** categories are sorted by amount (highest first)

**Given** I view the category breakdown
**When** looking at the visualization
**Then** I see a clear visual representation (bar chart or proportional bars)
**And** each category has its assigned color from the UX color palette
**And** amounts are formatted with currency symbol

**Given** I have transactions in multiple categories
**When** I view the breakdown
**Then** I see the total spending amount at the top
**And** each category shows its percentage of total
**And** subcategories are rolled up into parent categories (expandable optional)

**Given** I have uncategorized (unmatched) transactions
**When** I view the breakdown
**Then** they appear as "Uncategorized" or "Unmatched" category
**And** this is visually distinct (muted or warning color)

**Given** I have no transactions
**When** I view the Dashboard
**Then** I see an empty state with guidance to import statements

**Given** I have only income transactions (positive amounts)
**When** I view the breakdown
**Then** income is shown separately or excluded from "spending"
**And** the dashboard focuses on expenses by default

---

### Story 6.2: Time Period Selection

As a **user**,
I want **to filter my dashboard to a specific time period**,
So that **I can analyze spending for any month or date range (FR30)**.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the time period selector
**Then** I see the currently selected period (default: current month)
**And** I can click to open a period picker

**Given** I open the period picker
**When** I view the options
**Then** I see quick options: This Month, Last Month, Last 3 Months, This Year
**And** I see a custom date range option

**Given** I select "Last Month"
**When** the selection is applied
**Then** all dashboard data updates to show only last month's transactions
**And** the period label updates (e.g., "December 2025")
**And** category totals reflect only that period

**Given** I select "Custom Range"
**When** I open the custom picker
**Then** I can select a start date and end date
**And** I see a calendar UI for date selection
**And** the range is validated (start before end)

**Given** I select a time period
**When** the dashboard updates
**Then** the update is fast (<100ms for UI response)
**And** all visualizations reflect the selected period

**Given** I change the time period
**When** I have the period selector open
**Then** I can use keyboard to navigate (arrows, Enter)
**And** Esc closes the picker

---

### Story 6.3: Month-over-Month Comparison

As a **user**,
I want **to compare my spending between time periods**,
So that **I can see if I'm spending more or less than before (FR31)**.

**Acceptance Criteria:**

**Given** I am viewing a month on the Dashboard
**When** I look at the spending summary
**Then** I see the current period total
**And** I see a comparison to the previous period
**And** the change is shown as amount and percentage

**Given** spending increased from last period
**When** I view the comparison
**Then** I see an upward indicator (arrow or icon)
**And** the change is shown in warning/red color
**And** text shows: "+€150 (+12%) vs last month"

**Given** spending decreased from last period
**When** I view the comparison
**Then** I see a downward indicator
**And** the change is shown in success/green color
**And** text shows: "-€75 (-8%) vs last month"

**Given** I view the category breakdown
**When** comparison mode is active
**Then** each category shows its change vs previous period
**And** I can see which categories increased or decreased

**Given** I'm viewing "This Year"
**When** comparison is calculated
**Then** it compares to the same period last year (if data exists)
**And** or shows "No previous data" if not available

**Given** there is no previous period data
**When** I view the comparison
**Then** I see "No previous data to compare"
**And** the comparison section is gracefully hidden or muted

---

### Story 6.4: Drill-Down to Transactions

As a **user**,
I want **to click on a category to see its individual transactions**,
So that **I can investigate my spending in detail (FR32)**.

**Acceptance Criteria:**

**Given** I am viewing the category breakdown
**When** I click on a category (e.g., "Shopping: €450")
**Then** I navigate to the Transactions page
**And** transactions are filtered to that category
**And** the time period filter is preserved

**Given** I drill down to a category
**When** I view the Transactions page
**Then** the breadcrumb shows: "Dashboard > Shopping"
**And** I can click "Dashboard" to go back
**And** the category filter is clearly indicated

**Given** I am viewing filtered transactions
**When** I want to see all transactions
**Then** I can clear the category filter
**And** pressing `A` clears all filters

**Given** I hover over a category in the breakdown
**When** I see the hover state
**Then** a tooltip shows additional info: transaction count, top merchants
**And** the category is visually highlighted as clickable

**Given** I use keyboard navigation on the dashboard
**When** I focus on a category
**Then** I can press Enter to drill down
**And** Tab moves between categories
**And** the focused category has visible focus ring

---

## Epic 7: Merchant Management & Investigation

Users can investigate spending by merchant, seeing detailed stats, all transactions, and managing merchant rules.

### Story 7.1: Merchants List View

As a **user**,
I want **to see a list of all my merchants with summary information**,
So that **I can browse and find merchants to investigate (FR33)**.

**Acceptance Criteria:**

**Given** I have created merchants via rule assignment
**When** I navigate to the Merchants page
**Then** I see a list of all merchants
**And** each merchant shows: name, default category, transaction count, total spent

**Given** I view the merchants list
**When** looking at the layout
**Then** merchants are sorted by total spent (highest first) by default
**And** I can sort by: name, transaction count, total spent, last seen

**Given** I have many merchants
**When** I want to find a specific one
**Then** I can use the search/filter input at the top
**And** filtering is instant as I type

**Given** I view a merchant in the list
**When** I click on it or press Enter while focused
**Then** I navigate to the Merchant Detail page

**Given** I use keyboard navigation
**When** I'm on the Merchants page
**Then** J/K navigates between merchants
**And** Enter opens the focused merchant

**Given** I have no merchants yet
**When** I view the Merchants page
**Then** I see an empty state: "No merchants yet"
**And** guidance explains merchants are created when assigning transactions

---

### Story 7.2: Merchant Detail Page

As a **user**,
I want **to see a detailed page for each merchant showing stats, rules, and transactions**,
So that **I can investigate spending and manage rules for that merchant (FR33, FR34)**.

**Acceptance Criteria:**

**Given** I navigate to a merchant detail page
**When** the page loads
**Then** I see the merchant name prominently displayed
**And** the default category is shown below the name
**And** a back button/breadcrumb allows navigation back

**Given** I view the merchant stats section
**When** looking at the stats cards
**Then** I see:
  - Total spent (all time)
  - Transaction count
  - Average transaction amount
  - Monthly average
  - First seen date
  - Last seen date (e.g., "3 days ago")

**Given** I view the month-over-month stat
**When** there's enough data
**Then** I see: "vs last month: +12%" or "-8%"
**And** positive change is warning color, negative is success color

**Given** I view the Rules section
**When** the merchant has rules
**Then** I see all rules for this merchant in a list
**And** each rule shows: pattern (monospace), match count, category (default or override)
**And** each rule has an Edit button

**Given** I click Edit on a rule
**When** the edit modal opens
**Then** I can modify the pattern and category override
**And** changes are saved with Undo toast

**Given** I want to add a new rule to this merchant
**When** I click "+ Add Rule"
**Then** a modal opens to add a new rule pattern
**And** the merchant is pre-selected

**Given** I view the Transactions section
**When** the merchant has transactions
**Then** I see all transactions for this merchant
**And** a time filter is available (default: This Year)
**And** each transaction shows date, raw string, amount, category

**Given** the merchant has mixed categories
**When** some rules have category overrides
**Then** I see a note: "Mixed categories: X Shopping, Y Subscriptions"
**And** explanation that override rules cause this (expected behavior)

**Given** I use keyboard on the merchant page
**When** I press various keys
**Then** `E` opens edit merchant modal (name, default category)
**And** `D` changes default category
**And** these shortcuts are shown in the page footer

---

### Story 7.3: First-Time Merchant Detection

As a **user**,
I want **to see which merchants are new to me**,
So that **I can pay attention to unfamiliar spending sources (FR35)**.

**Acceptance Criteria:**

**Given** I create a new merchant
**When** the merchant is saved
**Then** a "first seen" timestamp is recorded
**And** the merchant is flagged as "new" for 30 days

**Given** a merchant is less than 30 days old
**When** I view the merchant in any list or page
**Then** I see a 🆕 badge or "New" indicator
**And** on merchant detail page, the badge is prominent near the name

**Given** I view the Merchants list
**When** I have new merchants
**Then** new merchants are visually distinct with the badge
**And** I can filter to show only new merchants (optional)

**Given** I view the Transaction list
**When** a transaction belongs to a new merchant
**Then** the merchant name shows with the 🆕 indicator
**And** this helps me spot unfamiliar spending

**Given** a merchant is more than 30 days old
**When** I view the merchant
**Then** the 🆕 badge is no longer shown
**And** the "first seen" date is still visible on detail page

**Given** I import transactions
**When** transactions match a new merchant
**Then** the merchant retains its "new" status
**And** first seen date doesn't change

---

## Epic 8: Refund Handling

Users can link refunds to original purchases, ensuring accurate net spending calculations.

### Story 8.1: Mark Transaction as Refund (F Key)

As a **user**,
I want **to mark a transaction as a refund and start linking it to an original purchase**,
So that **I can accurately track my net spending (FR19)**.

**Acceptance Criteria:**

**Given** I have focused a transaction (positive amount, likely a refund)
**When** I press `F`
**Then** the Refund Link modal opens
**And** the transaction details are shown at the top
**And** the modal title is "Link Refund"

**Given** the Refund Link modal is open
**When** I view the interface
**Then** I see a search field to find the original purchase
**And** the search is pre-filtered by similar amount (±10%)
**And** suggestions show transactions from the same merchant if available

**Given** I'm searching for the original purchase
**When** I type in the search field
**Then** results filter by merchant name and amount
**And** results are sorted by date (most recent first)
**And** results show: date, merchant, amount, category

**Given** I find the original purchase
**When** I select it from the results
**Then** it's highlighted as the selected link target
**And** I see a preview: "Link €50 refund to €50 purchase from Jan 15"

**Given** no matching purchase is found
**When** the search returns no results
**Then** I see "No matching purchases found"
**And** I can broaden my search or cancel
**And** I can still mark as refund without linking (orphan refund)

**Given** I press `F` on a negative amount (expense)
**When** the modal opens
**Then** a note suggests this looks like an expense, not a refund
**And** I can proceed anyway if it's actually a refund

---

### Story 8.2: Link Refund to Original Purchase

As a **user**,
I want **to create a link between a refund and its original purchase**,
So that **the relationship is tracked and visible (FR20)**.

**Acceptance Criteria:**

**Given** I have selected an original purchase in the modal
**When** I click "Link Refund" or press Enter
**Then** the refund transaction is linked to the original purchase
**And** both transactions are updated in the database
**And** a toast confirms: "Refund linked to original purchase" with Undo

**Given** a refund is linked to a purchase
**When** I view either transaction in the list
**Then** I see a visual indicator (link icon or badge)
**And** hovering shows tooltip: "Linked to refund on [date]" or "Linked to purchase on [date]"

**Given** I click on a linked transaction
**When** viewing the transaction detail or row
**Then** I can see the linked transaction details
**And** I can navigate to the linked transaction

**Given** I view a linked refund
**When** looking at its category
**Then** it inherits the category from the original purchase (if not manually set)
**And** or shows "Refund" as a special category/indicator

**Given** I want to unlink a refund
**When** I press `F` on an already-linked refund
**Then** I see the current link and option to "Unlink"
**And** unlinking removes the relationship
**And** a toast confirms with Undo

**Given** a purchase already has a linked refund
**When** I try to link another refund to it
**Then** I see a warning: "This purchase already has a linked refund"
**And** I can choose to replace or cancel

---

### Story 8.3: Net Spending Calculation

As a **user**,
I want **linked refunds excluded from my spending totals**,
So that **my category spending reflects what I actually spent (FR21)**.

**Acceptance Criteria:**

**Given** I have a €100 purchase and a linked €100 refund
**When** I view the Dashboard category breakdown
**Then** the category shows net spend (€0 for this pair)
**And** the total spending excludes the refund amount

**Given** I have a partial refund (€100 purchase, €30 refund)
**When** I view the Dashboard
**Then** net spend for that category includes €70 (purchase minus refund)

**Given** I have an unlinked refund (marked as refund but not linked)
**When** I view the Dashboard
**Then** the refund is shown separately or as "Refunds" category
**And** it's not double-counted against spending

**Given** I view the Dashboard
**When** looking at spending totals
**Then** I can see both gross and net if desired
**And** default view shows net spending
**And** a toggle or note indicates "Net of refunds"

**Given** I drill down from Dashboard to a category
**When** viewing the transactions
**Then** linked refunds are visible but marked as refunds
**And** the category total shown matches the dashboard (net)

**Given** I view the month-over-month comparison
**When** refunds are involved
**Then** comparison uses net figures
**And** changes reflect actual spending changes

---

## Epic 9: Subscription & Anomaly Detection

Users can view detected subscriptions and get flagged about unusual transactions (high amounts, new merchants, duplicates).

### Story 9.1: Subscription Detection Algorithm

As a **user**,
I want **the system to automatically detect my recurring subscriptions**,
So that **I can see all my recurring charges in one place (FR36)**.

**Acceptance Criteria:**

**Given** I have transactions from the same merchant
**When** the subscription detection runs
**Then** transactions are analyzed for recurring patterns
**And** a subscription is detected if: same merchant, similar amount (±10%), appearing 2+ times at regular intervals

**Given** transactions match subscription criteria
**When** a subscription is detected
**Then** it's stored with: merchant, typical amount, frequency (monthly, yearly, weekly), last charge date

**Given** a Netflix charge of €15.99 appears monthly
**When** 2+ charges are detected with ~30 day intervals
**Then** a subscription is created: Netflix, €15.99/month

**Given** subscription detection runs
**When** new transactions are imported
**Then** detection re-runs to find new subscriptions
**And** existing subscriptions are updated (last charge date)

**Given** a subscription stops (no charge for 2+ cycles)
**When** detection runs
**Then** the subscription is marked as "possibly cancelled"
**And** it's still visible but flagged

**Given** amount varies slightly (€15.99, €16.49)
**When** within ±10% tolerance
**Then** still detected as same subscription
**And** "typical amount" shows the average or most recent

**Given** irregular intervals (not exactly 30 days)
**When** variance is within reasonable range (±5 days for monthly)
**Then** still detected as subscription
**And** frequency is approximated

---

### Story 9.2: Subscriptions View (S Key)

As a **user**,
I want **to see all my detected subscriptions in a dedicated view**,
So that **I can audit my recurring charges and cancel forgotten ones (FR37, FR38)**.

**Acceptance Criteria:**

**Given** I press `S` or click "Subscriptions" in sidebar
**When** the Subscriptions view loads
**Then** I see a list of all detected subscriptions
**And** the S key focus mode is now active (replaces placeholder from Epic 5)

**Given** I view the subscriptions list
**When** looking at each subscription
**Then** I see: merchant name, amount, frequency (monthly/yearly/weekly), last charge date
**And** subscriptions are sorted by amount (highest first) by default

**Given** I view the subscriptions summary
**When** at the top of the view
**Then** I see total monthly subscription cost
**And** I see total yearly subscription cost (monthly × 12 + yearly)
**And** I see count of active subscriptions

**Given** I click on a subscription
**When** viewing details
**Then** I see all transactions that are part of this subscription
**And** I see the charge history with dates and amounts
**And** I can navigate to the merchant page

**Given** a subscription is marked "possibly cancelled"
**When** viewing the list
**Then** it appears with a muted/inactive style
**And** a badge shows "Possibly cancelled" or "No recent charges"

**Given** I view the subscriptions list
**When** I want to sort or filter
**Then** I can sort by: amount, frequency, last charge, merchant name
**And** I can filter by frequency (monthly, yearly, all)

**Given** no subscriptions are detected
**When** I view the Subscriptions view
**Then** I see an empty state: "No subscriptions detected yet"
**And** guidance: "Import more statements to detect recurring charges"

---

### Story 9.3: Anomaly Detection - High Amounts

As a **user**,
I want **transactions with unusually high amounts to be flagged**,
So that **I can spot unexpected large charges (FR39)**.

**Acceptance Criteria:**

**Given** I have transactions in a category
**When** a new transaction exceeds 2x the category average
**Then** it's flagged as a high-amount anomaly
**And** a visual indicator appears on the transaction row (⚠️ or warning badge)

**Given** a transaction is flagged for high amount
**When** I view it in the transaction list
**Then** I see an anomaly badge: "Unusual amount"
**And** hovering shows: "€400 is 3x your average for Shopping (€130)"

**Given** I view a flagged transaction
**When** I want to dismiss the flag
**Then** I can mark it as "reviewed" or "expected"
**And** the flag is removed
**And** it won't be flagged again for the same reason

**Given** there aren't enough transactions in a category
**When** less than 5 transactions exist
**Then** no anomaly detection runs for that category
**And** we wait for more data

**Given** I want to customize the threshold
**When** I go to Settings
**Then** I can adjust the anomaly threshold (default: 2x average)
**And** I can set an absolute threshold (e.g., "flag anything over €500")

**Given** multiple anomalies exist
**When** I view the transaction list
**Then** I can filter to show only flagged transactions
**And** this helps me review anomalies quickly

---

### Story 9.4: Anomaly Detection - New Merchants

As a **user**,
I want **transactions from new/unknown merchants to be flagged**,
So that **I can verify unfamiliar charges (FR40)**.

**Acceptance Criteria:**

**Given** a transaction is assigned to a new merchant (< 30 days old)
**When** viewing the transaction
**Then** it shows a "New merchant" indicator
**And** this leverages the first-time merchant detection from Epic 7

**Given** I import new transactions
**When** they match a brand new merchant (just created)
**Then** those transactions are flagged as "New merchant"
**And** the flag appears alongside any other anomaly flags

**Given** a transaction doesn't match any merchant
**When** it remains unmatched
**Then** it shows as unmatched (not specifically "new merchant")
**And** the new merchant flag only applies after merchant assignment

**Given** I view flagged transactions
**When** filtering by anomaly type
**Then** I can filter to "New merchants" specifically
**And** this helps me review unfamiliar spending sources

**Given** a merchant ages past 30 days
**When** viewing its transactions
**Then** the "New merchant" flag is no longer shown on new transactions
**And** the merchant is considered established

---

### Story 9.5: Anomaly Detection - Potential Duplicates

As a **user**,
I want **potential duplicate transactions to be flagged**,
So that **I can catch accidental double charges (FR41)**.

**Acceptance Criteria:**

**Given** transactions exist with same amount, same merchant, within 3 days
**When** potential duplicates are detected
**Then** both transactions are flagged as "Potential duplicate"
**And** a visual indicator appears on both rows

**Given** transactions are flagged as potential duplicates
**When** I view one of them
**Then** I see: "Potential duplicate of transaction on [date]"
**And** I can click to view/compare the other transaction

**Given** I review potential duplicates
**When** they're actually legitimate (e.g., two coffees same day)
**Then** I can dismiss the flag: "Not a duplicate"
**And** the flag is removed from both transactions
**And** similar transactions won't be flagged again

**Given** I confirm a duplicate
**When** it's actually a double charge
**Then** I can mark one as "Duplicate - exclude"
**And** the excluded transaction doesn't count toward spending
**And** a note is added for reference

**Given** duplicate detection runs
**When** transactions are imported
**Then** detection runs automatically
**And** flags are applied without user action

**Given** I want to see all potential duplicates
**When** I filter the transaction list
**Then** I can filter to show only "Potential duplicates"
**And** I can review and resolve them efficiently

---

## Epic 10: Data Export & Settings

Users can export their data for backup and configure LLM settings for parsing.

### Story 10.1: Export All Data

As a **user**,
I want **to export all my data as a backup file**,
So that **I can safeguard my data and restore it if needed (FR44)**.

**Acceptance Criteria:**

**Given** I navigate to Settings > Data Management
**When** I click "Export All Data"
**Then** a JSON file is generated containing all my data
**And** the file downloads automatically
**And** filename includes date: "mamen-backup-2026-01-22.json"

**Given** the export runs
**When** the file is generated
**Then** it includes:
  - All accounts
  - All transactions
  - All merchants with their rules
  - All categories (including custom if any)
  - App settings
  - Subscription detection data
  - Linked refund relationships

**Given** I have a large dataset (10,000+ transactions)
**When** I export
**Then** export completes within reasonable time
**And** a progress indicator shows if it takes more than 1 second
**And** the file is well-structured and valid JSON

**Given** the export completes
**When** I view the downloaded file
**Then** the JSON is formatted (pretty-printed) for readability
**And** includes a metadata section: export date, app version, record counts

**Given** I want to export specific data
**When** I view export options
**Then** I can choose: "Export All" (default) or select specific data types
**And** I can export just transactions, just merchants, etc.

**Given** I export my data
**When** the export completes
**Then** a toast confirms: "Data exported successfully"
**And** the file is saved to my downloads folder

---

### Story 10.2: Settings Page Consolidation

As a **user**,
I want **a comprehensive settings page to configure all app options**,
So that **I can customize mamen to my preferences**.

**Acceptance Criteria:**

**Given** I navigate to Settings
**When** the page loads
**Then** I see organized settings sections:
  - LLM Configuration (from Epic 2)
  - Display Preferences
  - Data Management
  - About

**Given** I view LLM Configuration
**When** looking at the section
**Then** I see the settings from Story 2.4 (endpoint, API key, model)
**And** I can test connection
**And** settings persist across sessions

**Given** I view Display Preferences
**When** looking at the options
**Then** I can configure:
  - Currency symbol (€, $, £, etc.)
  - Date format (DD/MM/YYYY, MM/DD/YYYY, etc.)
  - Default time period for dashboard
  - Anomaly threshold (2x, 3x, or custom)

**Given** I change a display preference
**When** I save the setting
**Then** it applies immediately throughout the app
**And** persists across sessions

**Given** I view Data Management
**When** looking at the section
**Then** I see:
  - Export All Data button
  - Import Data button
  - Clear All Data button (with strong warning)
  - Storage usage indicator

**Given** I click "Clear All Data"
**When** the confirmation appears
**Then** I see a strong warning: "This will permanently delete all data"
**And** I must type "DELETE" to confirm
**And** upon confirmation, all data is cleared
**And** app returns to first-run state

**Given** I view the About section
**When** looking at the information
**Then** I see: app version, build date
**And** link to documentation/help
**And** link to report issues

---

### Story 10.3: Data Import from Backup

As a **user**,
I want **to import a previously exported backup file**,
So that **I can restore my data or move to a new device (FR43 complete)**.

**Acceptance Criteria:**

**Given** I have a mamen backup JSON file
**When** I go to Settings > Data Management > Import Data
**Then** I can select or drag-drop my backup file
**And** the file is validated before import

**Given** I select a valid backup file
**When** the file is parsed
**Then** I see a preview: "X accounts, Y transactions, Z merchants"
**And** I see the export date and app version from the backup

**Given** I have existing data
**When** I import a backup
**Then** I'm asked: "Replace all data" or "Merge with existing"
**And** Replace: clears current data first, then imports
**And** Merge: adds new records, skips duplicates

**Given** I choose "Replace all data"
**When** import runs
**Then** all current data is cleared
**And** backup data is imported
**And** a toast confirms: "Data restored from backup"

**Given** I choose "Merge with existing"
**When** import runs
**Then** new accounts/merchants are added
**And** duplicate transactions are skipped (same account + date + amount + merchant)
**And** a summary shows: "Added X, skipped Y duplicates"

**Given** the backup file is invalid or corrupted
**When** validation fails
**Then** I see an error: "Invalid backup file"
**And** specific issue is explained if possible
**And** import is aborted, no data is changed

**Given** the backup is from a newer app version
**When** I try to import
**Then** I see a warning: "Backup from newer version, some data may not import"
**And** I can proceed or cancel

**Given** import completes successfully
**When** I navigate the app
**Then** all imported data is available
**And** merchants, rules, and relationships are intact
**And** dashboard reflects imported transactions
