---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'mamen - privacy-first personal finance visualization app with LLM-powered statement parsing'
session_goals: 'Stress-test existing vision, discover new angles, explore what else can be done with financial data'
selected_approach: 'AI-Recommended Techniques'
techniques_used: ['Assumption Reversal', 'What If Scenarios', 'Cross-Pollination']
ideas_generated: 38
session_active: false
workflow_completed: true
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Lucas
**Date:** 2026-01-16

## Session Overview

**Topic:** mamen - a privacy-first personal finance visualization app that uses LLM-powered statement parsing instead of bank API connections

**Goals:** Validate and challenge existing concept, discover new possibilities for the financial data

### Core Concept Summary

- Dashboard for spending visualization across multiple accounts
- LLM-powered bank statement parsing (privacy + universal compatibility)
- Import via UI upload or MCP server integration
- Automatic transaction categorization
- Multi-account aggregation

### Areas Open for Exploration

- What else can be done with the financial data beyond visualization
- MCP server workflow possibilities
- Features beyond basic spending overview

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Privacy-first finance app with focus on challenging existing vision and discovering new data possibilities

**Recommended Techniques:**

1. **Assumption Reversal (deep):** Challenge core assumptions about LLM parsing, no-bank-connection approach, and auto-categorization to surface blind spots and validate differentiators
2. **What If Scenarios (creative):** Explore radical possibilities for what mamen could become - predictive features, integrations, new use cases beyond visualization
3. **Cross-Pollination (creative):** Borrow successful patterns from fitness apps, investment platforms, and privacy tools to generate concrete feature ideas

**AI Rationale:** User has clear core concept but wants stress-testing and expansion. Sequence moves from foundation challenge → possibility explosion → pattern stealing from other domains.

---

## Technique Execution Results

### Technique 1: Assumption Reversal

**Focus:** Challenge core assumptions to surface blind spots and validate differentiators

**Insights Generated:**

1. **Privacy vs Convenience Trade-off** - Validated as conscious MVP decision. Imports are pragmatic, bank connections can come later if demanded.

2. **Progressive Rule Building** - Users build their own matcher rules over time, transforming messy raw data into a personalized, perfectly-categorized system. "Unmatched" transactions become a prompt to teach the app.

3. **Community Rule Sharing** - When a transaction is unmatched, suggest rules from other users that matched similar patterns. Turns cold-start problem into network effect.

4. **LLM as Dumb Extractor Only** - LLM handles only parsing (varied document formats → structured data). All categorization logic is explicit, user-defined rules. Predictable, debuggable, trustworthy.

5. **Clarity Over Aggregation** - The killer feature isn't "see all accounts" - it's "finally understand your spending" through trusted, user-defined categorization in a clean UI.

6. **MCP Server is V2** - Deferred to v2. V1 focuses purely on UI-based import, LLM parsing, rule engine, and dashboard visualization.

---

### Technique 2: What If Scenarios

**Focus:** Explore radical possibilities for what mamen could do with categorized financial data

**Ideas Generated:**

1. **Spending Predictions** - Analyze historical patterns to forecast next month's spending by category. Surface trends like "coffee up 40% over 3 months."

2. **Subscription Detector** - Auto-detect recurring transactions and surface them as a dedicated "Subscriptions" view. Show renewal dates, monthly/annual cost.

3. **Financial Health Score** - A single dashboard metric synthesizing income/expense ratio, savings trend, category balance. Glanceable "am I okay?" indicator.

4. **Self-Comparison & Personal Bests** - Compare spending against your own history - YoY, MoM, personal bests. Gamifies progress without social comparison.

5. **Natural Language Queries** - Ask questions in plain language - "How much did I spend on travel in 2025?" LLM translates to queries against categorized data.

6. **Retrospective Budget Goals** - Set category budgets, then review against actuals after importing the month. Budgeting becomes reflection, not anxiety.

7. **Refund Linking** - User can mark a transaction as a refund and link it to the original purchase. Excluded from category totals. Clear UI badge.

8. **Shared Expense Splitting** (Future) - Mark transactions as shared, track "you're owed" per person. Natural extension for household finance.

9. **Anomaly Detection** - Flag unusual transactions - abnormally high amounts, new merchants, potential duplicates. Light fraud/error detection.

---

### Technique 3: Cross-Pollination

**Focus:** Steal successful patterns from other domains

**Ideas Generated:**

**From Fitness/Music Apps:**
1. **Year in Review** - Spotify Wrapped for finances. Annual summary with personality.

**From Investment Platforms:**
2. **Merchant Watchlist** - Pin specific merchants to monitor spending trends.

**From Habit Tracking:**
3. **Budget Streaks** - Track consecutive months hitting budget goals.

**From Note-Taking Apps:**
4. **Smart Views / Saved Filters** - Save custom filtered views for quick access.

**From Banking Apps:**
5. **Instant Search** - Fast, responsive search across all transactions.
6. **Spending Insight Cards** - Auto-generated insight snippets on dashboard.
7. **Round-Up Detection** - Detect when banks have auto-rounded transactions.

**From Time-Tracking Apps:**
8. **Missing Month Detection** - Dashboard shows gaps in your data.

**From E-Commerce:**
9. **Merchant Detail Pages** - Click any merchant → full relationship history.
10. **Visual Spending Timeline** - Scrollable timeline view of financial history.

**From Linear/Raycast/Superhuman (THE CORE UX IDENTITY):**
11. **Power User UX** - Keyboard-first interface, Linear for money.
12. **Full Keyboard Navigation** - J/K, Enter, Esc, never touch mouse.
13. **Command Palette (Cmd+K)** - Universal search/action interface.
14. **Transaction Quick Actions** - R=rule, C=category, F=refund while focused.
15. **Focus Mode Toggles** - U=unmatched, M=month, S=subscriptions.
16. **Fuzzy Search Everywhere** - Typo-tolerant, intent-based search.
17. **Command Aliases** - User-defined shortcuts.
18. **Command History** - Recent commands, arrow up to repeat.
19. **Batch Operations** - Select multiple, apply action to all.

**From IDE/Dev Tools:**
20. **Breadcrumb Navigation** - Always visible path, never lost.
21. **Peek Preview** - Hover/press P for inline stats popup.

**From Notion/Airtable:**
22. **Dedicated Unmatched View** - First-class view for triage workflow.
23. **Customizable Table Columns** - Choose which fields display.

**From Personal Stats:**
24. **Personal Stats Dashboard** - Transactions tracked, rules created, months of data.

---

## Idea Organization and Prioritization

### Theme 1: Core Architecture Decisions

| Idea | Description | Priority |
|------|-------------|----------|
| LLM as Dumb Extractor | LLM only parses documents → JSON. No AI categorization. | V1 Core |
| Progressive Rule Building | Users create matchers over time. Ugly first, perfect later. | V1 Core |
| Community Rule Sharing | Suggest rules from other users for unmatched transactions. | V2 |
| MCP Server Integration | API access for power users and automation. | V2 |

### Theme 2: Power User UX (The Linear Identity)

| Idea | Description | Priority |
|------|-------------|----------|
| Command Palette (Cmd+K) | Universal search/action interface | V1 Core |
| Full Keyboard Navigation | J/K, Enter, Esc - never touch mouse | V1 Core |
| Transaction Quick Actions | R=rule, C=category, F=refund while focused | V1 Core |
| Focus Mode Toggles | U=unmatched, M=month, S=subscriptions | V1 Core |
| Fuzzy Search Everywhere | Typo-tolerant, intent-based search | V1 Core |
| Batch Operations | Select multiple, apply action to all | V1 Core |
| Command Aliases | "din" → "Dining > Restaurants" | V1 |
| Command History | Recent commands, arrow up to repeat | V1 |
| Breadcrumb Navigation | Always know where you are | V1 |
| Peek Preview | P to see inline stats without navigation | V1 |
| Dedicated Unmatched View | Inbox zero for transactions | V1 Core |
| Customizable Table Columns | Choose which fields display | V1 |

### Theme 3: Dashboard & Visualization

| Idea | Description | Priority |
|------|-------------|----------|
| Clarity Over Aggregation | Core value = "where does money go?" | V1 Core |
| Financial Health Score | Single glanceable metric | V1 |
| Spending Insight Cards | Auto-generated "you spent X, Y more than usual" | V1 |
| Personal Stats Dashboard | Transactions tracked, rules created, months of data | V1 |
| Missing Month Detection | Show gaps in imported data | V1 |
| Visual Spending Timeline | Scrollable history, major purchases highlighted | V1 |
| Instant Search | Type, immediately see results | V1 Core |

### Theme 4: Merchant & Transaction Features

| Idea | Description | Priority |
|------|-------------|----------|
| Merchant Detail Pages | Full history with any merchant | V1 |
| Merchant Watchlist | Pin merchants to monitor | V1 |
| Refund Linking | Mark refund, link to original, exclude from totals | V1 |
| Subscription Detector | Auto-detect recurring transactions | V1 |
| Anomaly Detection | Flag unusual amounts, new merchants, duplicates | V1 |
| Round-Up Detection | Recognize bank auto-rounding | V1 |

### Theme 5: Analysis & Insights

| Idea | Description | Priority |
|------|-------------|----------|
| Spending Predictions | Forecast next month based on patterns | V2 |
| Self-Comparison & Personal Bests | YoY, MoM, "your best month was..." | V1 |
| Retrospective Budget Goals | Set targets, review against actuals | V1 |
| Budget Streaks | "4 months under dining budget" | V2 |
| Year in Review | Spotify Wrapped for finances | V2 |
| Natural Language Queries | "How much on travel in 2025?" | V2 |
| Cost Per Day Framing | Netflix = €0.43/day | V2+ |

### Theme 6: Future Expansion

| Idea | Description | Priority |
|------|-------------|----------|
| Shared Expense Splitting | Mark transactions as shared, track owed | V2+ |
| Subscription Killer Features | Usage tracking, price change alerts | V2+ |
| Smart Views / Saved Filters | Save custom filtered views | V2 |

---

## V1 Core MVP Definition

**Must-haves for shipping:**

1. **Import & Parse:** LLM extracts PDF/CSV → JSON (dates, amounts, raw merchant strings)
2. **Rules Engine:** User-defined matchers with regex, category/subcategory assignment
3. **Power User UX:** Command palette, full keyboard navigation, quick actions, fuzzy search, batch operations
4. **Unmatched View:** Dedicated triage workflow for new imports
5. **Dashboard:** Spending clarity, financial health score, insight cards, instant search
6. **Merchant Pages:** Full transaction history and stats per merchant
7. **Core Features:** Refund linking, subscription detection, anomaly detection

**The Identity:** Linear for personal finance. Keyboard-first, power-user focused, no hand-holding.

---

## Session Summary

**Session Stats:**
- **38 ideas** generated across 3 techniques
- **6 themes** identified
- **~15 V1 Core features** defined
- **Clear product identity** established: "Linear for money"

**Key Breakthroughs:**
1. LLM is extraction only - all categorization is user-controlled rules
2. Progressive personalization model - ugly first, perfect over time
3. Power user UX as core identity - command palette, keyboard-first, batch ops
4. Dedicated unmatched view as the triage workflow

**Creative Journey:**
Started with a solid concept, stress-tested the foundations, expanded into feature possibilities, then found the soul of the product by raiding Linear/Raycast patterns. The "Linear for money" insight transformed mamen from "another finance dashboard" into a power-user tool with clear differentiation.

---

## Next Steps

1. **Create PRD** - Formalize V1 scope with the PM agent (`/bmad:bmm:workflows:prd`)
2. **Architecture decisions** - Tech stack, data model, LLM integration approach
3. **UX Design** - Command palette patterns, keyboard navigation system
4. **Build** - Start with import → parse → rules → unmatched view flow
