---
project_name: 'mamen'
user_name: 'Lucas'
date: '2026-01-21'
sections_completed: ['technology_stack', 'implementation_rules', 'anti_patterns', 'project_structure', 'performance']
status: 'complete'
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Technology | Version | Notes |
|------------|---------|-------|
| TypeScript | 5.x | Strict mode enabled |
| React | 19 | Function components only |
| Vite | 7.x | SWC compiler |
| Tailwind CSS | v4 | Via shadcn init |
| shadcn/ui | latest | Copy-paste components |
| Radix UI | latest | Accessible primitives |
| cmdk | latest | Command palette |
| Dexie.js | ^4.2 | IndexedDB with `useLiveQuery` |
| TanStack Router | ^1.153 | Type-safe file-based routing |
| TanStack Virtual | latest | Virtual scrolling |
| Zod | latest | Runtime validation |
| Vitest | latest | Testing framework |

## Critical Implementation Rules

### Data Access (MOST IMPORTANT)

- **NEVER duplicate Dexie data in React state** - use `useLiveQuery` directly
- Dexie is the single source of truth for all persistent data
- UI state only (selection, modals, focus) can use React context or minimal Zustand

### TypeScript Rules

- Use `type` not `interface` (consistency)
- Named exports only - no default exports
- Explicit return types on all exported functions
- Props types: `{ComponentName}Props`

### React Rules

- Function components only, no classes
- Minimal state in components - derive from Dexie where possible
- Event handlers: `handle{Event}` naming (`handleClick`, `handleKeyDown`)
- Refs: `{purpose}Ref` naming (`inputRef`, `listRef`)

### File & Component Naming

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase dir + index.tsx | `TransactionRow/index.tsx` |
| Hooks | camelCase + `use` prefix | `useKeyboardNavigation.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Types | PascalCase + `.types.ts` | `transaction.types.ts` |
| Schemas | camelCase + `.schema.ts` | `transaction.schema.ts` |

### Dexie Table Naming

| Element | Convention | Example |
|---------|------------|---------|
| Tables | camelCase plural | `transactions`, `merchants` |
| Fields | camelCase | `merchantId`, `createdAt` |
| Primary key | `id` | Auto-increment or uuid |
| Foreign keys | `{entity}Id` | `accountId`, `merchantId` |

### Testing Rules

- Co-locate tests with source: `Component.test.tsx` next to `index.tsx`
- NO `__tests__/` directories
- Use Vitest + React Testing Library
- Test behavior, not implementation

### Error Handling

| Scenario | Pattern |
|----------|---------|
| LLM failures | Toast with retry action |
| Validation errors | Inline field errors |
| Unexpected errors | Error boundary → generic toast |
| User messages | Plain English, no technical jargon |

### Loading States

| Scenario | Pattern |
|----------|---------|
| Data fetching | Skeleton matching final layout |
| LLM parsing | Spinner + "Parsing statement..." |
| Actions | Disabled button with spinner |

### LLM Integration

- Primary: Local LLM (Ollama) at `localhost:11434`
- Fallback: BYOK cloud (Claude, OpenAI)
- Interface: OpenAI-compatible API for both
- Pipeline: Embed file directly in prompt → LLM extracts JSON

## Anti-Patterns to Avoid

- Creating `__tests__/` directories (tests go next to source)
- Using `interface` (use `type`)
- Using default exports (use named exports)
- Duplicating Dexie data in React state
- Using class components
- Adding comments/docstrings to code you didn't change

## Project Structure

```
src/
├── components/        # Shared UI components
├── features/          # Feature modules (self-contained)
│   ├── import/
│   ├── transactions/
│   ├── merchants/
│   ├── rules/
│   ├── dashboard/
│   ├── search/
│   ├── subscriptions/
│   ├── anomalies/
│   └── settings/
├── hooks/             # Shared hooks
├── lib/               # Utilities, Dexie, LLM client
│   ├── db/
│   ├── schemas/
│   ├── llm/
│   └── utils/
├── types/             # Shared TypeScript types
├── context/           # React contexts
└── routes/            # TanStack Router routes
```

## Performance Requirements

- <100ms UI response (use Dexie direct, no state duplication)
- <50ms command palette (cmdk optimized)
- 60fps with 1000+ rows (TanStack Virtual)
- 10k+ transactions searchable (Dexie indexed queries)
