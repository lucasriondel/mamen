# Story 2.1: Create and Manage Bank Accounts

Status: ready-for-dev

## Story

As a **user**,
I want **to create and manage my bank accounts in the app**,
So that **I can organize my statements by account and import from multiple banks (FR5)**.

## Acceptance Criteria

1. **Given** I am on the Accounts page
   **When** I click "Add Account"
   **Then** a modal appears to create a new account
   **And** I can enter an account name (required)
   **And** I can optionally select an account type (Checking, Savings, Credit Card, Other)
   **And** I can save the account

2. **Given** I have created an account
   **When** I view the Accounts page
   **Then** I see all my accounts listed
   **And** each account shows its name and type
   **And** each account shows transaction count (0 initially)

3. **Given** I want to edit an account
   **When** I click edit on an account
   **Then** I can modify the name and type
   **And** changes are saved to the database

4. **Given** I want to delete an account
   **When** I click delete on an account
   **Then** I see a confirmation warning (account has X transactions)
   **And** upon confirmation, the account and all its transactions are deleted
   **And** a toast appears with 10-second undo option

5. **Given** I have no accounts
   **When** I view the Accounts page
   **Then** I see an empty state prompting me to create my first account

## Tasks / Subtasks

- [ ] Task 1: Create Accounts page placeholder route content (AC: #5)
  - [ ] Update `src/routes/accounts.tsx` with AccountsPage component
  - [ ] Import and use EmptyState component from Story 1.3
  - [ ] Configure EmptyState with CreditCard icon, appropriate title/description
  - [ ] Add "Add Account" button as CTA (actionLabel prop)

- [ ] Task 2: Create AccountCard component (AC: #2)
  - [ ] Create `src/features/accounts/components/AccountCard/index.tsx`
  - [ ] Display account name, type badge, and transaction count
  - [ ] Add edit and delete action buttons (icon buttons)
  - [ ] Use shadcn Card component as base
  - [ ] Style with 48px row pattern matching transaction rows

- [ ] Task 3: Create CreateAccountModal component (AC: #1)
  - [ ] Create `src/features/accounts/components/CreateAccountModal/index.tsx`
  - [ ] Use shadcn Dialog component
  - [ ] Create form with: name input (required), type select dropdown
  - [ ] Use shadcn Form, Input, Select components
  - [ ] Add Zod validation using existing accountSchema
  - [ ] On submit: validate, save to Dexie db.accounts, close modal, show success toast

- [ ] Task 4: Create EditAccountModal component (AC: #3)
  - [ ] Create `src/features/accounts/components/EditAccountModal/index.tsx`
  - [ ] Similar structure to CreateAccountModal
  - [ ] Pre-populate form with existing account data
  - [ ] On submit: update account in Dexie, close modal, show toast

- [ ] Task 5: Implement delete with undo functionality (AC: #4)
  - [ ] Add delete handler in AccountCard
  - [ ] Show confirmation dialog with transaction count warning
  - [ ] On confirm: delete account and related transactions from Dexie
  - [ ] Show toast with "Undo" action (10-second window)
  - [ ] Implement undo: restore account and transactions from backup

- [ ] Task 6: Wire up AccountsPage with live data (AC: #2, #5)
  - [ ] Use `useLiveQuery` to fetch accounts from db.accounts
  - [ ] Use `useLiveQuery` to get transaction counts per account
  - [ ] Show EmptyState when no accounts exist
  - [ ] Show AccountCard grid when accounts exist
  - [ ] Add "Add Account" button in header area

- [ ] Task 7: Update sidebar stats to show account count (Enhancement)
  - [ ] Update Sidebar.tsx to show account count in stats section
  - [ ] Use `useLiveQuery` to count accounts

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- All CRUD operations go directly to Dexie - UI updates automatically via live queries
- Use Zod schemas for validation before saving to database

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming (`handleSave`, `handleDelete`)
- Props types: `{ComponentName}Props`

### Existing Types and Schemas (from Story 1.2)

**Types available in `src/types/account.types.ts`:**
```typescript
export type AccountType = 'checking' | 'savings' | 'credit_card' | 'other'

export type Account = {
  id?: number
  name: string
  type: AccountType
  createdAt: Date
  updatedAt: Date
}
```

**Zod schema available in `src/lib/schemas/account.schema.ts`:**
```typescript
export const accountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Account name is required'),
  type: accountTypeSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Account>

export const createAccountSchema = accountSchema.omit({ id: true, createdAt: true, updatedAt: true })
```

### Dexie Patterns

**Inserting new account:**
```typescript
import { db } from '@/lib/db'

const newAccount: Account = {
  name: formData.name,
  type: formData.type,
  createdAt: new Date(),
  updatedAt: new Date(),
}
const id = await db.accounts.add(newAccount)
```

**Updating account:**
```typescript
await db.accounts.update(accountId, {
  name: formData.name,
  type: formData.type,
  updatedAt: new Date(),
})
```

**Deleting account and transactions:**
```typescript
// Use transaction for atomic operation
await db.transaction('rw', [db.accounts, db.transactions], async () => {
  await db.transactions.where('accountId').equals(accountId).delete()
  await db.accounts.delete(accountId)
})
```

**Getting transaction count per account:**
```typescript
const transactionCount = useLiveQuery(
  () => db.transactions.where('accountId').equals(accountId).count(),
  [accountId]
) ?? 0
```

### Undo Pattern (Command Pattern)

**Source: [architecture.md#Error-Handling]**

For delete with undo:
1. Before delete, store the account and its transactions in memory
2. Delete from database
3. Show toast with "Undo" button
4. If undo clicked within 10 seconds: restore from memory
5. After 10 seconds: clear the backup from memory

```typescript
type UndoState = {
  account: Account
  transactions: Transaction[]
  timeoutId: number
}

// Store backup before delete
const backup: UndoState = {
  account: accountToDelete,
  transactions: await db.transactions.where('accountId').equals(accountId).toArray(),
  timeoutId: window.setTimeout(() => clearBackup(), 10000)
}

// On undo click
const handleUndo = async () => {
  clearTimeout(backup.timeoutId)
  await db.accounts.add(backup.account)
  await db.transactions.bulkAdd(backup.transactions)
  clearBackup()
}
```

### Component Structure

```
src/features/accounts/
├── components/
│   ├── AccountCard/
│   │   └── index.tsx
│   ├── CreateAccountModal/
│   │   └── index.tsx
│   └── EditAccountModal/
│   │   └── index.tsx
└── hooks/
    └── useAccountActions.ts  # Optional: shared CRUD logic
```

### shadcn Components to Use

**Already installed (Story 1.1):**
- `Dialog` - for modals
- `Form` - for form handling
- `Button` - for actions
- `Select` - for account type dropdown
- `Card` - for AccountCard container
- `Badge` - for account type indicator
- `Toast` - for success/undo notifications

**Form with shadcn:**
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createAccountSchema, type CreateAccountInput } from '@/lib/schemas'

const form = useForm<CreateAccountInput>({
  resolver: zodResolver(createAccountSchema),
  defaultValues: { name: '', type: 'checking' }
})
```

### Toast Usage with Undo

**shadcn toast with action:**
```typescript
import { toast } from 'sonner'  // shadcn uses sonner

toast('Account deleted', {
  description: `${account.name} and ${transactionCount} transactions removed`,
  action: {
    label: 'Undo',
    onClick: handleUndo,
  },
  duration: 10000,
})
```

### UX Requirements

**Source: [ux-design-specification.md#Component-Strategy]**

- Dark theme is default (already configured in index.html)
- Cards use `radius-md` (6px border radius)
- Buttons: Primary for main CTA, Ghost for cancel
- Modal width: max-width 600px
- Focus trap within modal
- Esc closes modal

### Empty State Pattern

**Reuse EmptyState from Story 1.3:**
```typescript
import { EmptyState } from '@/components/EmptyState'
import { CreditCard } from 'lucide-react'

<EmptyState
  icon={CreditCard}
  title="No accounts yet"
  description="Create your first bank account to start importing statements."
  actionLabel="Add Account"
  onAction={handleOpenCreateModal}
/>
```

### Previous Story Context (Story 1.3)

**Layout already provides:**
- Sidebar with navigation (Accounts link already exists)
- Main content area with `<Outlet />` for route content
- Dark theme applied
- Header with app name

**Route file exists:** `src/routes/accounts.tsx` (placeholder from 1.3)

### Project Structure Notes

**Files to create/modify:**

| Path | Action |
|------|--------|
| `src/routes/accounts.tsx` | MODIFY - Add full AccountsPage implementation |
| `src/features/accounts/` | CREATE - New feature module directory |
| `src/features/accounts/components/AccountCard/index.tsx` | CREATE |
| `src/features/accounts/components/CreateAccountModal/index.tsx` | CREATE |
| `src/features/accounts/components/EditAccountModal/index.tsx` | CREATE |
| `src/components/Layout/Sidebar.tsx` | MODIFY - Add account count to stats |

### Testing Strategy

**Co-located tests pattern:**
- `AccountCard.test.tsx` next to `AccountCard/index.tsx`
- Test: renders account info, edit/delete buttons work
- Test: delete shows confirmation
- Test: undo restores data

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store accounts in React state - use `useLiveQuery`
- DO NOT use `.where().equals(undefined)` in Dexie - use `.filter()` if needed
- DO NOT create `__tests__/` directories - co-locate tests

### Validation Checklist

Before marking complete:
- [ ] Accounts page shows empty state when no accounts
- [ ] "Add Account" opens create modal
- [ ] Create modal validates name is required
- [ ] Account type select works with all 4 options
- [ ] Saving account adds to database and shows in list
- [ ] Edit modal pre-populates with existing data
- [ ] Edit saves changes to database
- [ ] Delete shows confirmation with transaction count
- [ ] Delete removes account and transactions
- [ ] Undo button restores deleted data within 10 seconds
- [ ] Toast notifications appear for all actions
- [ ] All data persists after browser refresh
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`

### References

- [Source: epics.md#Story-2.1]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: ux-design-specification.md#Component-Strategy]
- [Source: project-context.md#Data-Access-MOST-IMPORTANT]
- [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/dialog)
- [shadcn/ui Form](https://ui.shadcn.com/docs/components/form)
- [Dexie.js Transactions](https://dexie.org/docs/Dexie/Dexie.transaction())
- [sonner Toast](https://sonner.emilkowal.ski/)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

