# Story 3.4: Transaction Search via Command Palette

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to search transactions through the command palette**,
So that **I can quickly find specific transactions by merchant or amount (FR23, FR25)**.

## Acceptance Criteria

1. **Given** the command palette is open
   **When** I type a search query
   **Then** results appear instantly (<100ms) (NFR3)
   **And** transactions matching the query are shown
   **And** results are grouped by type (Transactions, Merchants, Categories)

2. **Given** I search for a merchant name
   **When** I type "amazon"
   **Then** transactions with "amazon" in the merchant string appear
   **And** the match is case-insensitive

3. **Given** I make a typo in my search
   **When** I type "amazn" (missing 'o')
   **Then** fuzzy search still finds "Amazon" transactions (FR25: up to 2 char tolerance)

4. **Given** I search and get results
   **When** I select a transaction result
   **Then** I navigate to the Transactions page
   **And** the selected transaction is focused/highlighted

5. **Given** I search for an amount
   **When** I type "29.99"
   **Then** transactions with that amount appear in results

6. **Given** I have 10,000+ transactions
   **When** I search
   **Then** results still appear in under 100ms (NFR3)
   **And** results are limited to top 10-20 matches for performance

7. **Given** my search has no results
   **When** nothing matches
   **Then** I see "No results for '[query]'"
   **And** the palette doesn't close automatically

## Tasks / Subtasks

- [ ] Task 1: Add fuzzy search library (AC: #3, #6)
  - [ ] Install MiniSearch or Fuse.js for fuzzy matching
  - [ ] MiniSearch recommended for better performance with large datasets
  - [ ] Add to package.json: `npm install minisearch`
  - [ ] Create utility wrapper in `src/lib/search/fuzzySearch.ts`

- [ ] Task 2: Create search indexing infrastructure (AC: #1, #6)
  - [ ] Create `src/features/search/services/searchIndex.ts`
  - [ ] Define searchable fields: merchant string, amount, date, category
  - [ ] Create index builder that runs on initial load
  - [ ] Implement incremental index updates on transaction changes
  - [ ] Use Dexie `useLiveQuery` to keep index in sync with database

- [ ] Task 3: Implement transaction search function (AC: #1, #2, #5)
  - [ ] Create `src/features/search/hooks/useTransactionSearch.ts`
  - [ ] Accept search query string as parameter
  - [ ] Return matching transactions with relevance score
  - [ ] Support searching by:
    - Merchant string (partial, case-insensitive)
    - Amount (exact or formatted string match)
    - Date (formatted string match)
  - [ ] Debounce search to 50ms for performance

- [ ] Task 4: Implement fuzzy matching with typo tolerance (AC: #3)
  - [ ] Configure MiniSearch with fuzzy matching enabled
  - [ ] Set typo tolerance to 2 characters (Levenshtein distance)
  - [ ] Boost exact matches over fuzzy matches in relevance
  - [ ] Test with common typos: "amazn", "netflx", "spotfy"

- [ ] Task 5: Add transaction results section to CommandPalette (AC: #1)
  - [ ] Modify `src/components/CommandPalette/index.tsx`
  - [ ] Add new CommandGroup for "Transactions" results
  - [ ] Display transaction results when query is non-empty
  - [ ] Show: date, merchant string (truncated), amount
  - [ ] Use monospace for amounts
  - [ ] Limit to 10 results for performance

- [ ] Task 6: Add merchant results section to CommandPalette (AC: #1)
  - [ ] Create search hook for merchants: `useSearch.ts`
  - [ ] Add CommandGroup for "Merchants" results
  - [ ] Show: merchant name, transaction count, default category
  - [ ] Limit to 5 results
  - [ ] Clicking navigates to merchant page (future, placeholder for now)

- [ ] Task 7: Add category results section to CommandPalette (AC: #1)
  - [ ] Create search hook for categories
  - [ ] Add CommandGroup for "Categories" results
  - [ ] Show: category name with subcategory if applicable
  - [ ] Limit to 5 results
  - [ ] Clicking filters transactions by category

- [ ] Task 8: Implement result selection and navigation (AC: #4)
  - [ ] On transaction result select:
    - Navigate to `/transactions` route
    - Pass transaction ID as search param: `/transactions?highlight={id}`
    - Close palette after navigation
  - [ ] Create URL param handler in TransactionList to highlight transaction
  - [ ] Scroll to highlighted transaction and apply focus ring
  - [ ] Clear highlight after 3 seconds or on user interaction

- [ ] Task 9: Implement amount search (AC: #5)
  - [ ] Detect numeric input in search query
  - [ ] Search by exact amount match (e.g., 29.99)
  - [ ] Support partial amount match (e.g., "29" matches 29.99, 129.00)
  - [ ] Format amounts consistently for comparison

- [ ] Task 10: Implement empty state for no results (AC: #7)
  - [ ] Show CommandEmpty component when no results match
  - [ ] Display message: "No results for '[query]'"
  - [ ] Ensure palette remains open
  - [ ] Suggest actions: "Try a different search term" or show recent searches

- [ ] Task 11: Performance optimization for 10k+ transactions (AC: #6)
  - [ ] Pre-build search index on app initialization
  - [ ] Use Web Worker for index building if > 5000 transactions
  - [ ] Implement result limiting (max 20 total results)
  - [ ] Measure and verify <100ms search response time
  - [ ] Add performance test with 10k mock transactions

- [ ] Task 12: Integrate search with existing command palette (AC: #1)
  - [ ] Maintain existing Actions and Navigation sections
  - [ ] Show search results ABOVE static sections when query exists
  - [ ] Order: Transactions > Merchants > Categories > Actions > Navigation
  - [ ] When query is empty, show only Actions and Navigation (current behavior)
  - [ ] Preserve keyboard navigation through all sections

- [ ] Task 13: Style search results per UX specification (AC: #1)
  - [ ] Transaction result row:
    ```
    │ [date] [merchant string truncated]        [amount] │
    ```
  - [ ] Merchant result row:
    ```
    │ [name]                         [count] transactions │
    ```
  - [ ] Category result row:
    ```
    │ [category > subcategory]                            │
    ```
  - [ ] Use muted text for secondary info
  - [ ] Monospace for amounts (JetBrains Mono)
  - [ ] Highlight matching text in results (optional enhancement)

- [ ] Task 14: Write unit and integration tests (AC: all)
  - [ ] Create `src/features/search/hooks/useTransactionSearch.test.ts`
    - Test: search finds transactions by merchant string
    - Test: search is case-insensitive
    - Test: fuzzy search finds "amazn" when "amazon" exists
    - Test: search finds by amount
    - Test: results limited to max count
    - Test: empty query returns no results
  - [ ] Create `src/features/search/services/searchIndex.test.ts`
    - Test: index builds from transactions
    - Test: index updates on transaction add/remove
    - Test: search performance with 10k items
  - [ ] Update `src/components/CommandPalette/CommandPalette.test.tsx`
    - Test: typing query shows transaction results
    - Test: selecting transaction navigates and closes palette
    - Test: no results shows empty state message
    - Test: results grouped by type
    - Test: keyboard navigation works through all result types

- [ ] Task 15: Accessibility compliance (AC: all)
  - [ ] Verify search results have `role="option"`
  - [ ] Verify `aria-selected` updates on navigation
  - [ ] Announce result count to screen readers via live region
  - [ ] Test with VoiceOver: "12 results for amazon"
  - [ ] Ensure focus management works when navigating to transaction

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Frontend-Architecture]**

- Search: Dexie queries first, add in-memory fuzzy (MiniSearch) only if <100ms not met
- Use `useLiveQuery` for reactive data access
- Keep search index in sync with Dexie database

**Source: [architecture.md#Performance]**

| Metric | Target |
|--------|--------|
| Search results | <100ms for 10k+ transactions (NFR3) |
| Command palette open | <50ms (NFR2) |

**Source: [architecture.md#Additional-Core-Dependencies]**

Consider adding MiniSearch for fuzzy search:
```bash
npm install minisearch
```

### UX Design Requirements

**Source: [ux-design-specification.md#Command-Palette]**

| Aspect | Requirement |
|--------|-------------|
| Search | Fuzzy search with typo tolerance (up to 2 characters) |
| Results | Instant as-you-type filtering (<100ms) |
| Grouping | Results grouped by type: Transactions, Merchants, Categories |

**Source: [ux-design-specification.md#Command-Palette-Anatomy]**

```
+-----------------------------------------------------------------+
| Search transactions, merchants, actions...                       |
+-----------------------------------------------------------------+
| Transactions                                                     |
|   Jan 18  AMZN*1234XYZ                              EUR 29.99    |
|   Jan 15  AMAZON PRIME                              EUR 14.99    |
| ---------------------------------------------------------------- |
| Merchants                                                        |
|   Amazon                                       34 transactions   |
| ---------------------------------------------------------------- |
| Actions                                                          |
|   Import statement                                    Cmd+I      |
|   View unmatched                                      U          |
+-----------------------------------------------------------------+
```

**Source: [ux-design-specification.md#Interaction-Patterns]**

| Pattern | Source | Application |
|---------|--------|-------------|
| Fuzzy Search | Raycast | Typo-tolerant search everywhere |
| Instant results | Raycast | <100ms search results |

### Implementation Approach

#### Search Index Strategy

```typescript
// src/features/search/services/searchIndex.ts

import MiniSearch from 'minisearch'
import { db } from '@/lib/db'
import { useLiveQuery } from 'dexie-react-hooks'

type SearchableTransaction = {
  id: string
  merchantString: string
  amount: number
  amountFormatted: string
  date: string
  dateFormatted: string
  categoryName: string | null
}

const searchIndex = new MiniSearch<SearchableTransaction>({
  fields: ['merchantString', 'amountFormatted', 'dateFormatted', 'categoryName'],
  storeFields: ['id', 'merchantString', 'amount', 'date', 'categoryName'],
  searchOptions: {
    boost: { merchantString: 2 },
    fuzzy: 0.2, // ~2 character tolerance
    prefix: true,
  },
})

export const buildSearchIndex = async (): Promise<void> => {
  const transactions = await db.transactions.toArray()
  const searchable = transactions.map(mapToSearchable)
  searchIndex.addAll(searchable)
}

export const searchTransactions = (query: string, limit = 10): SearchableTransaction[] => {
  if (!query.trim()) return []
  return searchIndex.search(query, { limit })
}
```

#### Hook Implementation

```typescript
// src/features/search/hooks/useTransactionSearch.ts

import { useState, useEffect, useMemo } from 'react'
import { searchTransactions, buildSearchIndex } from '../services/searchIndex'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

type UseTransactionSearchResult = {
  results: SearchResult[]
  isLoading: boolean
}

export const useTransactionSearch = (query: string): UseTransactionSearchResult => {
  const [isIndexReady, setIsIndexReady] = useState(false)

  // Rebuild index when transactions change
  const transactions = useLiveQuery(() => db.transactions.toArray())

  useEffect(() => {
    if (transactions) {
      buildSearchIndex().then(() => setIsIndexReady(true))
    }
  }, [transactions])

  const results = useMemo(() => {
    if (!isIndexReady || !query.trim()) return []
    return searchTransactions(query, 10)
  }, [query, isIndexReady])

  return { results, isLoading: !isIndexReady }
}
```

#### Command Palette Integration

```typescript
// src/components/CommandPalette/index.tsx - additions

import { useTransactionSearch } from '@/features/search/hooks/useTransactionSearch'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'

export const CommandPalette = (): JSX.Element => {
  const { isOpen, close } = useCommandPalette()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { results: transactionResults } = useTransactionSearch(query)

  const handleTransactionSelect = (transactionId: string) => {
    navigate({ to: '/transactions', search: { highlight: transactionId } })
    close()
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="Search transactions, merchants, actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results for "{query}"</CommandEmpty>

        {/* Transaction Results - shown when query exists */}
        {query && transactionResults.length > 0 && (
          <CommandGroup heading="Transactions">
            {transactionResults.map((tx) => (
              <CommandItem
                key={tx.id}
                onSelect={() => handleTransactionSelect(tx.id)}
              >
                <span className="text-muted-foreground text-sm w-16">
                  {formatDate(tx.date)}
                </span>
                <span className="flex-1 truncate">{tx.merchantString}</span>
                <span className="font-mono text-sm">
                  {formatCurrency(tx.amount)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Existing Actions and Navigation sections */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {/* ... existing actions ... */}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Search results | <100ms | Pre-built MiniSearch index |
| 10k+ transactions | <100ms | Limit results to 20, prefix search |
| Index rebuild | Background | useLiveQuery triggers async rebuild |

**Optimization Strategies:**

1. **Pre-build index on app load** - Don't wait for first search
2. **Incremental updates** - Only re-index changed transactions
3. **Result limiting** - Return max 20 results regardless of matches
4. **Debounce input** - 50ms debounce on search query changes
5. **Web Worker (if needed)** - Move indexing to worker for >5k transactions

### Project Structure for This Story

```
src/
├── components/
│   └── CommandPalette/
│       ├── index.tsx (modify)
│       └── CommandPalette.test.tsx (modify)
├── features/
│   └── search/
│       ├── hooks/
│       │   ├── useTransactionSearch.ts (new)
│       │   ├── useTransactionSearch.test.ts (new)
│       │   ├── useMerchantSearch.ts (new)
│       │   └── useCategorySearch.ts (new)
│       ├── services/
│       │   ├── searchIndex.ts (new)
│       │   └── searchIndex.test.ts (new)
│       └── index.ts (new - feature exports)
└── lib/
    └── search/
        └── fuzzySearch.ts (new - utility wrapper)
```

### Dependencies on Previous Stories

This story **requires** Story 3.3 (Command Palette Foundation):
- CommandPalette component exists and opens with Cmd+K
- CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem available
- Keyboard navigation (arrow keys) works
- Focus management and close behavior implemented

### Preparation for Future Stories

This story prepares for:
- **Story 4.3 (R Key):** Search can find transactions for rule creation
- **Story 4.4 (Existing Merchant):** Search merchants in assignment modal
- **Story 5.4 (Focus Mode M):** Filter integration with search
- **Story 6.4 (Drill-down):** Category search leads to filtered view

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT duplicate Dexie data in React state (use useLiveQuery)
- DO NOT block UI during index building
- DO NOT search on every keystroke without debounce
- DO NOT return unlimited results (cap at 20)
- DO NOT create `__tests__/` directories - co-locate tests

### MiniSearch Configuration

```typescript
// Recommended MiniSearch configuration for mamen

const searchIndex = new MiniSearch({
  fields: ['merchantString', 'amountFormatted', 'categoryName'],
  storeFields: ['id', 'merchantString', 'amount', 'date', 'categoryName'],
  searchOptions: {
    boost: { merchantString: 2 }, // Prioritize merchant matches
    fuzzy: 0.2, // ~2 char Levenshtein distance
    prefix: true, // Enable prefix matching
  },
  tokenize: (text) => text.toLowerCase().split(/[\s\-_*]+/), // Handle bank strings
})
```

### Validation Checklist

Before marking complete:
- [ ] Typing in palette shows transaction results
- [ ] Search is case-insensitive
- [ ] Fuzzy search finds "amazn" when "amazon" exists
- [ ] Search by amount works (29.99)
- [ ] Results appear in <100ms
- [ ] Results limited to max 20
- [ ] Selecting transaction navigates to /transactions?highlight={id}
- [ ] Transaction is scrolled into view and highlighted
- [ ] No results shows "No results for '[query]'" message
- [ ] Results grouped: Transactions, Merchants, Categories, Actions, Navigation
- [ ] Keyboard navigation works through all result groups
- [ ] Empty query shows only Actions and Navigation (no search results)
- [ ] Performance verified with 10k mock transactions
- [ ] Screen reader announces result count
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### References

- [Source: epics.md#Story-3.4-Transaction-Search-via-Command-Palette]
- [Source: prd.md#FR23 - Search via command palette]
- [Source: prd.md#FR25 - Fuzzy search with typo tolerance]
- [Source: prd.md#NFR3 - Search results <100ms for 10k+ transactions]
- [Source: architecture.md#Frontend-Architecture (search strategy)]
- [Source: architecture.md#Performance]
- [Source: ux-design-specification.md#Command-Palette]
- [Source: ux-design-specification.md#Navigation-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Performance-Requirements]
- [Previous Story: 3-3-command-palette-foundation.md (CommandPalette component)]
- [MiniSearch documentation](https://lucaong.github.io/minisearch/)
- [cmdk documentation](https://cmdk.paco.me/)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
