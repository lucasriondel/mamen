# Story 1.2: Establish Dexie Database Schema

Status: ready-for-dev

## Story

As a **user**,
I want **my financial data stored locally in a persistent database**,
So that **my data survives browser sessions and is never sent to external servers (FR42, FR43)**.

## Acceptance Criteria

1. **Given** the project is initialized (Story 1.1 completed)
   **When** I create the Dexie database schema
   **Then** the following tables are created: accounts, transactions, merchants, rules, settings

2. **Given** tables are defined
   **When** I inspect the TypeScript types
   **Then** TypeScript types are defined in `src/types/` for each entity matching the Dexie schema

3. **Given** types are defined
   **When** I inspect the validation schemas
   **Then** Zod schemas are defined in `src/lib/schemas/` for runtime validation of each entity

4. **Given** schemas are defined
   **When** I check the database setup
   **Then** the Dexie instance is exported from `src/lib/db/index.ts`

5. **Given** Dexie instance is configured
   **When** I import `useLiveQuery` hook
   **Then** `useLiveQuery` hook is available for reactive data access from `dexie-react-hooks`

6. **Given** database is set up
   **When** I add data, refresh the browser, and query again
   **Then** data persists after browser refresh

7. **Given** database is set up
   **When** I close the browser completely, reopen it, and query
   **Then** data persists after browser close and reopen

8. **Given** I want to verify data integrity
   **When** I add a test account and transaction
   **Then** the data is stored in IndexedDB
   **And** I can query it using `useLiveQuery`
   **And** the data matches the TypeScript types

## Tasks / Subtasks

- [ ] Task 1: Define TypeScript types for all entities (AC: #2)
  - [ ] Create `src/types/account.types.ts` with Account type
  - [ ] Create `src/types/transaction.types.ts` with Transaction type
  - [ ] Create `src/types/merchant.types.ts` with Merchant type
  - [ ] Create `src/types/rule.types.ts` with Rule type
  - [ ] Create `src/types/settings.types.ts` with Settings type
  - [ ] Create `src/types/index.ts` to re-export all types

- [ ] Task 2: Define Zod validation schemas (AC: #3)
  - [ ] Create `src/lib/schemas/account.schema.ts` with accountSchema
  - [ ] Create `src/lib/schemas/transaction.schema.ts` with transactionSchema
  - [ ] Create `src/lib/schemas/merchant.schema.ts` with merchantSchema
  - [ ] Create `src/lib/schemas/rule.schema.ts` with ruleSchema
  - [ ] Create `src/lib/schemas/settings.schema.ts` with settingsSchema
  - [ ] Create `src/lib/schemas/index.ts` to re-export all schemas
  - [ ] Ensure Zod schemas infer to matching TypeScript types

- [ ] Task 3: Create Dexie database instance (AC: #1, #4, #5)
  - [ ] Create `src/lib/db/schema.ts` with table definitions and indexes
  - [ ] Create `src/lib/db/index.ts` exporting db instance and useLiveQuery
  - [ ] Define indexes for common query patterns (accountId, merchantId, date)
  - [ ] Configure Dexie version for future migrations

- [ ] Task 4: Verify data persistence (AC: #6, #7, #8)
  - [ ] Create a test component demonstrating useLiveQuery
  - [ ] Add test account via Dexie
  - [ ] Add test transaction linked to account
  - [ ] Verify useLiveQuery returns reactive data
  - [ ] Verify data survives browser refresh
  - [ ] Verify data survives browser close/reopen

- [ ] Task 5: Write unit tests for schemas (Testing requirement)
  - [ ] Test Zod schemas validate correct data
  - [ ] Test Zod schemas reject invalid data
  - [ ] Co-locate tests with schema files (e.g., `account.schema.test.ts`)

## Dev Notes

### Data Model (from Architecture)

**Source: [architecture.md#Data-Architecture]**

The architecture defines these core entities:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `accounts` | Bank accounts with metadata | id, name, type, createdAt |
| `transactions` | Individual transactions linked to accounts | id, accountId, date, amount, rawMerchantString, merchantId?, categoryId? |
| `merchants` | User-defined merchant entities | id, name, defaultCategoryId, createdAt, firstSeen |
| `rules` | Regex patterns owned by merchants | id, merchantId, pattern, categoryOverride? |
| `settings` | App configuration including LLM settings | id, key, value |

### TypeScript Type Definitions

**CRITICAL:** Use `type` not `interface` per architecture rules.

**Source: [project-context.md#TypeScript-Rules]**

```typescript
// src/types/account.types.ts
export type AccountType = 'checking' | 'savings' | 'credit_card' | 'other'

export type Account = {
  id?: number
  name: string
  type: AccountType
  createdAt: Date
  updatedAt: Date
}

// src/types/transaction.types.ts
export type Transaction = {
  id?: number
  accountId: number
  date: Date
  amount: number
  rawMerchantString: string
  merchantId?: number
  categoryId?: number
  categoryOverride?: string  // Manual one-off category
  isRefund?: boolean
  linkedRefundId?: number
  importedAt: Date
  importMonth: string  // "2026-01" format for month-based organization
}

// src/types/merchant.types.ts
export type Merchant = {
  id?: number
  name: string
  defaultCategoryId?: number
  createdAt: Date
  firstSeen: Date
}

// src/types/rule.types.ts
export type Rule = {
  id?: number
  merchantId: number
  pattern: string  // Regex pattern
  categoryOverride?: number  // Override merchant's default category
  matchCount: number  // Tracks how many transactions matched
  createdAt: Date
}

// src/types/settings.types.ts
export type SettingKey = 'llm_endpoint' | 'llm_api_key' | 'llm_model' | 'currency_symbol' | 'date_format' | 'anomaly_threshold'

export type Setting = {
  id?: number
  key: SettingKey
  value: string
}
```

### Dexie Schema Definition

**Source: [architecture.md#Data-Access-Pattern]**

```typescript
// src/lib/db/schema.ts
import Dexie, { type EntityTable } from 'dexie'
import type { Account, Transaction, Merchant, Rule, Setting } from '@/types'

export const db = new Dexie('mamenDb') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  merchants: EntityTable<Merchant, 'id'>
  rules: EntityTable<Rule, 'id'>
  settings: EntityTable<Setting, 'id'>
}

// Define schema with indexes
// Syntax: ++id means auto-increment, & means unique, * means multi-entry
db.version(1).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, importMonth, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key'  // key is unique
})
```

### useLiveQuery Pattern

**Source: [Dexie.js Documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())**

**CRITICAL:** Do NOT duplicate Dexie data in React state. Use `useLiveQuery` directly.

```typescript
// src/lib/db/index.ts
export { db } from './schema'
export { useLiveQuery } from 'dexie-react-hooks'

// Usage example in components:
// import { db, useLiveQuery } from '@/lib/db'
//
// const accounts = useLiveQuery(() => db.accounts.toArray())
// const transactions = useLiveQuery(
//   () => db.transactions.where('accountId').equals(accountId).toArray(),
//   [accountId]  // deps array for reactive updates
// )
```

### Zod Schema Pattern

**Source: [Zod Documentation](https://zod.dev/)**

Ensure Zod schemas infer to matching TypeScript types:

```typescript
// src/lib/schemas/account.schema.ts
import { z } from 'zod'
import type { Account, AccountType } from '@/types'

export const accountTypeSchema = z.enum(['checking', 'savings', 'credit_card', 'other'])

export const accountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Account name is required'),
  type: accountTypeSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Account>

// For creating new accounts (without id)
export const createAccountSchema = accountSchema.omit({ id: true, createdAt: true, updatedAt: true })

export type CreateAccountInput = z.infer<typeof createAccountSchema>
```

### Index Strategy

**Why these indexes matter:**

| Index | Query Pattern | Use Case |
|-------|---------------|----------|
| `accountId` | Filter transactions by account | Account detail view |
| `date` | Sort/filter by date | Timeline views |
| `merchantId` | Filter by merchant | Merchant detail page |
| `importMonth` | Filter by import month | Month grid navigation |
| `[accountId+importMonth]` | Compound index | Account + month filtering (prevents duplicates) |
| `&key` on settings | Unique lookup | Fast settings retrieval |

### Project Structure Notes

**Files to create:**

```
src/
├── types/
│   ├── account.types.ts
│   ├── transaction.types.ts
│   ├── merchant.types.ts
│   ├── rule.types.ts
│   ├── settings.types.ts
│   └── index.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   └── index.ts
│   └── schemas/
│       ├── account.schema.ts
│       ├── account.schema.test.ts
│       ├── transaction.schema.ts
│       ├── transaction.schema.test.ts
│       ├── merchant.schema.ts
│       ├── merchant.schema.test.ts
│       ├── rule.schema.ts
│       ├── rule.schema.test.ts
│       ├── settings.schema.ts
│       ├── settings.schema.test.ts
│       └── index.ts
```

### Latest Library Versions

| Package | Version | Notes |
|---------|---------|-------|
| dexie | ^4.2.1 | Latest stable |
| dexie-react-hooks | ^1.1.7 | React hooks for Dexie |
| zod | ^3.x or ^4.x | Latest stable (4.3.5 available) |

### Dexie.js Specifics (Latest Research)

**Source: [Dexie.js Documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())**

Key features of `useLiveQuery`:
- Observes IndexedDB data and re-renders component on changes
- Fine-grained observation - only affected queries re-render
- Cross-tab observation works with Dexie.js 3.1+
- Result is `undefined` momentarily before initial data arrives (handle loading state)

**New in Dexie 4.2:**
- `useSuspendingLiveQuery` hook for React Suspense support (beta)
- Better TypeScript integration with `EntityTable` type

### Anti-Patterns to AVOID

**Source: [architecture.md#Anti-Patterns]**

- DO NOT duplicate Dexie data in React state (use `useLiveQuery` directly)
- DO NOT use `interface` (use `type` for all TypeScript definitions)
- DO NOT use default exports (use named exports only)
- DO NOT create `__tests__/` directories (tests go next to source files)
- DO NOT add unnecessary comments or docstrings

### Testing Strategy

**Co-located tests pattern:**

```typescript
// src/lib/schemas/account.schema.test.ts
import { describe, it, expect } from 'vitest'
import { accountSchema, createAccountSchema } from './account.schema'

describe('accountSchema', () => {
  it('validates a valid account', () => {
    const validAccount = {
      id: 1,
      name: 'Main Checking',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(accountSchema.parse(validAccount)).toEqual(validAccount)
  })

  it('rejects account with empty name', () => {
    const invalidAccount = {
      name: '',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(() => accountSchema.parse(invalidAccount)).toThrow()
  })

  it('rejects account with invalid type', () => {
    const invalidAccount = {
      name: 'Test',
      type: 'invalid_type',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(() => accountSchema.parse(invalidAccount)).toThrow()
  })
})
```

### Data Persistence Verification

To verify persistence works correctly:

1. **Browser refresh test:**
   - Add data via Dexie
   - Refresh page (F5)
   - Query data - should still exist

2. **Browser close test:**
   - Add data via Dexie
   - Close browser completely
   - Reopen browser and navigate to app
   - Query data - should still exist

3. **DevTools verification:**
   - Open Chrome DevTools > Application > IndexedDB
   - Find `mamenDb` database
   - Inspect tables and data

### Validation Checklist

Before marking this story complete, verify:
- [ ] All 5 entity types are defined in `src/types/`
- [ ] All 5 Zod schemas are defined in `src/lib/schemas/`
- [ ] Zod schemas infer to matching TypeScript types
- [ ] Dexie database exports from `src/lib/db/index.ts`
- [ ] `useLiveQuery` is re-exported from `src/lib/db/index.ts`
- [ ] Indexes are defined for common query patterns
- [ ] Data persists after browser refresh
- [ ] Data persists after browser close/reopen
- [ ] Unit tests pass for all Zod schemas
- [ ] No TypeScript errors in the codebase
- [ ] Named exports only (no default exports)
- [ ] `type` used instead of `interface` throughout

### References

- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Core-Architectural-Decisions]
- [Source: project-context.md#Data-Access-MOST-IMPORTANT]
- [Source: epics.md#Story-1.2]
- [Dexie.js Documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())
- [Dexie.js React Tutorial](https://dexie.org/docs/Tutorial/React)
- [Zod Documentation](https://zod.dev/)
- [Zod GitHub](https://github.com/colinhacks/zod)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
