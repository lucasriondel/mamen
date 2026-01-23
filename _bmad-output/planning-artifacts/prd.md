---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments:
  - '_bmad-output/analysis/brainstorming-session-2026-01-16.md'
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: 'web_app'
  domain: 'fintech'
  complexity: 'high'
  projectContext: 'greenfield'
lastEdited: '2026-01-20'
editHistory:
  - date: '2026-01-20'
    changes: 'Added Regulatory Considerations section; refined FR5, FR25, FR36, FR39 for measurability'
---

# Product Requirements Document - mamen

**Author:** Lucas
**Date:** 2026-01-20

## Executive Summary

**mamen** is a privacy-first personal finance visualization app that answers "where does my money go?" through user-controlled categorization rather than AI magic.

**Core Differentiator:** "Linear for money" - a keyboard-first, power-user tool that feels fast and intentional, not another hand-holding finance dashboard.

**Key Innovation:**
- LLM parses bank statements (PDF/CSV) into structured data - extraction only, no AI categorization
- User builds their own rules over time - ugly first, perfect later
- All data stays local - no bank connections, no server, no credentials

**Target:** Solo developer building for personal use first, with potential to share later.

## Success Criteria

### User Success

- **Primary outcome:** Clear, trusted understanding of where money goes - not through AI magic, but through a system you built and control
- **"Aha!" moment:** Importing a month's statements and having a categorized breakdown within minutes using keyboard-driven workflows
- **Satisfaction threshold:** The tool feels like Linear - fast, keyboard-first, no friction. You *want* to open it
- **Trust metric:** Every categorization decision is explainable because you defined the rules

### Business Success

- **3-month goal:** Using mamen daily for personal finances and finding it genuinely useful
- **Success indicator:** Replaces whatever manual process or other tool you currently use
- **Stretch goal:** Shareable with others, but not the primary driver

### Technical Success

- **Performance:** Instant keyboard response (<100ms for all UI interactions)
- **Reliability:** Financial data never corrupts or disappears; robust local storage
- **Privacy:** All data stays local; LLM parsing doesn't leak transaction data to external services
- **UX quality:** Matches the polish of Linear/Raycast - not a "side project feel"

### Measurable Outcomes

| Metric | Target |
|--------|--------|
| Time to categorize 100 transactions | < 5 minutes (with rules + batch ops) |
| Unmatched transactions after 3 months of use | < 5% of new imports |
| Keyboard-only workflow coverage | 100% of core actions |
| App response time | < 100ms for all interactions |

## User Journeys

### Journey 1: First Import (Onboarding)

**Lucas, 6pm on a Sunday.** He's finally going to get his finances sorted. He's exported bank statements from 3 accounts - a PDF from his main bank, CSVs from two others. He's tried Mint, YNAB, even spreadsheets. They all feel like chores.

He opens mamen. Drags in the first PDF. The LLM parses it - 47 transactions appear, raw merchant strings and all. Most are "unmatched" - no categories yet. He switches to Unmatched view (U key).

He sees "AMZN*1234XYZ" - presses R, types a regex `AMZN.*`, assigns it to "Shopping > Online". Instantly, 12 Amazon transactions categorize themselves. He grins. This is different.

Twenty minutes later, he's built 15 rules. His unmatched count is down to 8 edge cases. He switches to the dashboard - for the first time, he sees where his money actually went last month. Not a guess. Not an AI's opinion. *His* system, *his* categories.

**Capabilities revealed:** Import flow, LLM parsing pipeline, Unmatched view, Rule creation (R key), Batch rule application, Dashboard visualization

---

### Journey 2: Monthly Maintenance (Core Loop)

**Lucas, first Saturday of the month.** New statements to import. He's been using mamen for 3 months now. He has 50+ rules built up.

He imports the new statements - 120 transactions across 3 accounts. The rules engine runs. 108 auto-categorize instantly. He presses U to see the 12 unmatched.

Most are one-offs or new merchants. He batch-selects 4 restaurant transactions (Shift+J/K), assigns them all to "Dining > Restaurants" in one action. For the new recurring charge, he creates a rule so it won't be unmatched next month.

Five minutes total. Inbox zero. He checks the dashboard - spending is down from last month. He drills into "Subscriptions" view (S key) and sees all his recurring charges in one place. One subscription he forgot about. He makes a note to cancel it.

**Capabilities revealed:** Multi-file import, Rules engine auto-matching, Batch operations, Subscription detection view, Month-over-month comparison, Keyboard workflow efficiency

---

### Journey 3: Investigation (Edge Case)

**Lucas, mid-month.** He's looking at his dashboard and something feels off. "Shopping" is way higher than usual. He needs to investigate.

Cmd+K, types "shopping", hits Enter. Instant filtered view of all Shopping transactions. He scans - there's a €400 charge from a merchant he doesn't recognize. He clicks it to see the merchant detail page - first time seeing this merchant. Only one transaction.

He checks his email - it was a legitimate purchase he forgot about. He realizes it should be categorized as "Home > Furniture" not "Shopping". He edits the rule (or creates a specific one for this merchant). The transaction recategorizes. Dashboard updates.

**Capabilities revealed:** Command palette / fuzzy search, Anomaly detection, Merchant detail pages, Re-categorization workflow, Rule editing

---

### Journey 4: Refund Handling (Edge Case)

**Lucas spots a refund** in his transactions - €150 from an online store. Without context, it just looks like income. He knows it was a return for a purchase last month.

He focuses on the refund transaction, presses F (refund quick action). A modal appears to link it to the original purchase. He searches, finds the original €150 charge, links them. The refund is now excluded from his spending totals - his "Shopping" category correctly shows net spend, not gross.

**Capabilities revealed:** Refund linking flow, Transaction relationship model, Net vs gross spending calculation, Quick action (F key)

---

### Journey Requirements Summary

| Journey | Key Capabilities |
|---------|------------------|
| First Import | File upload, LLM parsing, Unmatched view, Rule creation, Dashboard |
| Monthly Maintenance | Multi-import, Auto-matching, Batch ops, Subscriptions view, Comparison |
| Investigation | Command palette, Search, Merchant pages, Rule editing, Anomaly flags |
| Refund Handling | Refund linking, Transaction relationships, Net spend calculation |

**Core workflow:** Import → Triage (Unmatched) → Build Rules → Dashboard clarity

## Innovation & Novel Patterns

### Detected Innovation Areas

| Innovation | What's Different | Why It Matters |
|------------|------------------|----------------|
| LLM as parser, not decision-maker | AI extracts data; humans define rules | Trust, debuggability, no AI black-box |
| Power-user UX for finance | Command palette, keyboard-first | Speed, efficiency, "want to use it" |
| Progressive personalization | User builds rules over time | Perfect categorization through ownership |
| Privacy via simplicity | No bank APIs, local-first | Universal compatibility, no credentials |

### Validation Approach

- **LLM parsing:** Test with diverse bank statement formats (PDF, CSV) across different banks/countries
- **Power-user UX:** Dogfooding - if you don't reach for the mouse, it's working
- **Rule system:** Measure unmatched % over time - should decrease as rules mature

### Risk Mitigation

| Risk | Fallback |
|------|----------|
| LLM parsing fails on weird formats | Manual CSV import always works; iteratively improve prompts |
| Power-user UX too steep | Progressive disclosure - basics visible, power features discoverable |
| Rule-building feels like work | Pre-built rule suggestions (future: community sharing) |

## Web App Specific Requirements

### Project-Type Overview

mamen is a **Single Page Application (SPA)** designed for modern browsers. As a local-first personal finance tool, it prioritizes performance and keyboard-driven UX over SEO or real-time sync capabilities.

### Technical Architecture Considerations

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Architecture | SPA | Rich interactivity, command palette, no page reloads |
| Rendering | Client-side | No SEO needs, faster interactions |
| Data persistence | Local storage / IndexedDB | Privacy-first, no server dependency |
| Real-time | None | No sync needed, fully client-driven |

### Browser Support

**Target browsers (modern only):**
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

**Not supported:**
- Internet Explorer
- Legacy mobile browsers

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Initial load | < 2s | First meaningful paint |
| Interaction response | < 100ms | Command palette, keyboard actions |
| Large dataset handling | 10,000+ transactions | Smooth scrolling, instant search |
| Offline capability | Full functionality | Local-first by design |

### Responsive Design

| Breakpoint | Priority | Notes |
|------------|----------|-------|
| Desktop (1024px+) | Primary | Full keyboard UX, command palette |
| Tablet (768-1023px) | Secondary | Touch-friendly, reduced shortcuts |
| Mobile (<768px) | Tertiary | Basic viewing, limited editing |

**Note:** Power-user UX is optimized for desktop. Mobile is a "check your spending" view, not the primary experience.

### Accessibility

**Target level:** Basic accessibility (not full WCAG AA)

**Included:**
- Full keyboard navigation (required for power-user UX anyway)
- Focus indicators on all interactive elements
- Semantic HTML structure
- Sufficient color contrast

**Deferred:**
- Screen reader optimization
- ARIA live regions
- Full WCAG AA compliance

### SEO Strategy

**Not applicable** - Private tool, no public pages, no indexing needed.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP - the power-user UX is the differentiator and cannot be stripped down

**Resource Requirements:** Solo developer (Lucas), local-first architecture minimizes infrastructure needs

### MVP Feature Set (Phase 1)

#### MVP-Alpha (Personal Dogfooding)

**Goal:** Usable for yourself - validates core workflow

**Core User Journeys Supported:**
- Journey 1: First Import (partial - basic dashboard)
- Journey 2: Monthly Maintenance (partial - no batch ops yet)

**Must-Have Capabilities:**
- Import & LLM parsing (PDF/CSV → structured JSON)
- Rules engine with regex support
- Category/subcategory assignment
- Unmatched view (inbox zero for transactions)
- Basic dashboard (spending by category)
- Keyboard navigation (J/K, Enter, Esc)
- Command palette (Cmd+K)
- Instant search
- Fuzzy search

#### MVP-Complete (Full V1 Core)

**Goal:** Full "Linear for money" experience

**Core User Journeys Supported:**
- All 4 journeys fully supported

**Additional Capabilities:**
- Batch operations (multi-select, bulk assign)
- Focus mode toggles (U=unmatched, M=month, S=subscriptions)
- Transaction quick actions (R=rule, C=category, F=refund)
- Merchant detail pages
- Refund linking (mark, link to original, exclude from totals)
- Subscription detection (auto-detect recurring)
- Anomaly detection (unusual amounts, new merchants, duplicates)
- Breadcrumb navigation

### Post-MVP Features

#### Phase 2: Growth

- Command aliases (user-defined shortcuts)
- Command history (arrow up to repeat)
- Peek preview (P for inline stats)
- Customizable table columns
- Financial health score
- Spending insight cards
- Personal stats dashboard
- Missing month detection
- Visual spending timeline
- Merchant watchlist
- Self-comparison & personal bests
- Retrospective budget goals
- Smart views / saved filters

#### Phase 3: Vision

- Community rule sharing
- MCP server integration
- Spending predictions
- Natural language queries
- Budget streaks & gamification
- Year in Review
- Shared expense splitting

### Risk Mitigation Strategy

| Risk Type | Risk | Mitigation |
|-----------|------|------------|
| Technical | LLM parsing fails on some bank formats | Start with your own banks; CSV always works as fallback |
| Technical | IndexedDB performance with large datasets | Test early with 10k+ transactions; optimize if needed |
| Scope | V1 Core too ambitious | MVP-Alpha is shippable alone; extend incrementally |
| Motivation | Losing steam mid-project | MVP-Alpha is usable quickly; provides early satisfaction |

## Functional Requirements

### Data Import & Parsing

- **FR1:** User can upload bank statement files (PDF, CSV) via drag-and-drop or file picker
- **FR2:** System can parse uploaded PDF bank statements using LLM to extract transaction data
- **FR3:** System can parse uploaded CSV bank statements to extract transaction data
- **FR4:** System can extract date, amount, and raw merchant string from each transaction
- **FR5:** User can import statements from 2 or more bank accounts
- **FR6:** System can detect and handle duplicate transactions across imports

### Rules Engine & Categorization

- **FR7:** User can create categorization rules with regex pattern matching
- **FR8:** User can assign categories and subcategories to rules
- **FR9:** System can automatically apply matching rules to transactions on import
- **FR10:** User can edit existing rules
- **FR11:** User can delete rules
- **FR12:** User can view all defined rules
- **FR13:** User can create a rule directly from a transaction (R key quick action)

### Transaction Management

- **FR14:** User can view all transactions in a list
- **FR15:** User can view only unmatched (uncategorized) transactions
- **FR16:** User can manually assign a category to a transaction
- **FR17:** User can select multiple transactions for batch operations
- **FR18:** User can apply a category to multiple selected transactions at once
- **FR19:** User can mark a transaction as a refund
- **FR20:** User can link a refund transaction to its original purchase
- **FR21:** System can exclude linked refunds from category spending totals

### Search & Navigation

- **FR22:** User can open command palette with Cmd+K
- **FR23:** User can search transactions, merchants, and categories via command palette
- **FR24:** User can navigate lists using keyboard (J/K for up/down, Enter to select, Esc to close)
- **FR25:** User can use fuzzy search with typo tolerance (up to 2 character differences)
- **FR26:** User can use quick actions while focused on a transaction (R=rule, C=category, F=refund)
- **FR27:** User can toggle focus modes (U=unmatched, M=current month, S=subscriptions)
- **FR28:** System displays breadcrumb navigation showing current location

### Dashboard & Visualization

- **FR29:** User can view spending breakdown by category
- **FR30:** User can view spending for a selected time period (month, custom range)
- **FR31:** User can compare spending between time periods (month-over-month)
- **FR32:** User can drill down from category totals to individual transactions

### Merchant Management

- **FR33:** User can view a merchant detail page showing all transactions with that merchant
- **FR34:** User can see total spent and transaction count per merchant
- **FR35:** System can identify first-time merchants (new to the user)

### Subscription Detection

- **FR36:** System can detect recurring transactions (same merchant, similar amount ±10%, appearing 2+ times at regular intervals)
- **FR37:** User can view all detected subscriptions in a dedicated view
- **FR38:** User can see subscription amounts and frequency

### Anomaly Detection

- **FR39:** System can flag transactions exceeding 2x the user's category average or a user-defined threshold
- **FR40:** System can flag transactions from new/unknown merchants
- **FR41:** System can flag potential duplicate transactions

### Data Persistence

- **FR42:** System stores all data locally (no server required)
- **FR43:** User's data persists across browser sessions
- **FR44:** User can export their data

## Non-Functional Requirements

### Performance

| Metric | Requirement | Rationale |
|--------|-------------|-----------|
| UI interaction response | < 100ms | Power-user UX requires instant feedback |
| Command palette open | < 50ms | Must feel instantaneous |
| Search results | < 100ms for 10k+ transactions | Large dataset support |
| Initial app load | < 2s | First meaningful paint |
| Rule application on import | < 5s for 500 transactions | Batch processing speed |
| Scroll performance | 60fps with 1000+ visible rows | Smooth list virtualization |

### Security & Privacy

| Requirement | Details |
|-------------|---------|
| Data storage | All user data stored locally (IndexedDB/localStorage) |
| No server transmission | Financial data never leaves user's device |
| LLM parsing privacy | Statement content sent to LLM for parsing only; no storage by LLM provider |
| No authentication | No accounts, no passwords - local-only app |
| Export security | User controls all data export |

### Regulatory Considerations

This application is classified as fintech but operates outside typical regulatory scope:

| Regulation | Applicability | Rationale |
|------------|---------------|-----------|
| PCI-DSS | Not Applicable | No cardholder data processing or payment transactions |
| SOC2 | Not Applicable | No cloud services, no customer data storage |
| KYC/AML | Not Applicable | Not a money transmitter, no financial transactions |
| GDPR | Limited | Local-only data storage; no server-side processing |

**Scope clarification:** mamen is a personal finance visualization tool, not a financial service. It cannot move money, access bank accounts directly, or store user credentials. All data remains on the user's device.

### Reliability & Data Integrity

| Requirement | Details |
|-------------|---------|
| Data persistence | User data survives browser restarts, updates, crashes |
| No data loss | Transactions, rules, and categories never silently lost |
| Import idempotency | Re-importing same statement doesn't create duplicates |
| Backup capability | User can export complete data for backup |
| Graceful degradation | If LLM parsing fails, user can still manually import CSV |

### Accessibility (Basic)

| Requirement | Details |
|-------------|---------|
| Keyboard navigation | 100% of core actions accessible via keyboard |
| Focus indicators | Clear visual focus state on all interactive elements |
| Color contrast | Sufficient contrast for readability |
| Semantic HTML | Proper heading structure and landmarks |

**Note:** Full WCAG AA compliance deferred to post-MVP.
