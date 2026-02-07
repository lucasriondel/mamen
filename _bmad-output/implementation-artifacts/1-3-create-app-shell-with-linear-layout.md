# Story 1.3: Create App Shell with Linear Layout

Status: review

## Story

As a **user**,
I want **the application to have a clean, Linear-inspired layout with sidebar navigation**,
So that **I can navigate between different sections of the app efficiently**.

## Acceptance Criteria

1. **Given** I open the mamen application
   **When** the app loads
   **Then** I see a sidebar on the left (220px width on desktop)
   **And** the sidebar contains navigation items: Dashboard, Transactions, Merchants, Accounts
   **And** the sidebar shows stats section with live counts (Unmatched: 0, Merchants: 0)
   **And** the main content area fills the remaining width
   **And** a header bar shows the app name and search trigger button displaying "Search... ⌘K"
   **And** the dark theme is applied (dark background, light text)

2. **Given** I am on desktop (1024px+)
   **When** I view the layout
   **Then** the sidebar is fully visible at 220px
   **And** the main content area is responsive

3. **Given** I click a navigation item
   **When** I select "Dashboard" or "Transactions"
   **Then** the route changes via TanStack Router
   **And** the corresponding placeholder page is displayed
   **And** the active nav item is highlighted with accent background

4. **Given** the app loads for the first time
   **When** there is no data
   **Then** the Dashboard shows an appropriate empty state
   **And** a clear call-to-action button guides users to import statements

## Tasks / Subtasks

**Implementation Order:** Complete tasks in this sequence to avoid circular dependencies.

- [x] Task 1: Install and configure TanStack Router Vite plugin (AC: #3)
  - [x] Run `npm install -D @tanstack/router-plugin`
  - [x] Update `vite.config.ts` to add TanStackRouterVite plugin
  - [x] Verify route generation works with `npm run dev`

- [x] Task 2: Create Layout components (AC: #1, #2)
  - [x] Create `src/components/Layout/index.tsx` - main layout wrapper
  - [x] Create `src/components/Layout/Sidebar.tsx` - 220px left sidebar
  - [x] Create `src/components/Layout/Header.tsx` - top header bar with search trigger
  - [x] Create `src/components/EmptyState/index.tsx` - reusable empty state component

- [x] Task 3: Create route files with TanStack Router (AC: #3)
  - [x] Create `src/routes/__root.tsx` with Layout wrapper
  - [x] Create `src/routes/index.tsx` for Dashboard (/)
  - [x] Create `src/routes/transactions.tsx` for /transactions
  - [x] Create `src/routes/merchants.tsx` for /merchants
  - [x] Create `src/routes/accounts.tsx` for /accounts

- [x] Task 4: Configure router in main.tsx (AC: #3)
  - [x] Import generated routeTree from `./routeTree.gen`
  - [x] Create router instance with createRouter
  - [x] Add type declaration for router
  - [x] Wrap app with RouterProvider

- [x] Task 5: Implement Sidebar navigation with active states (AC: #3)
  - [x] Add navigation items with lucide-react icons
  - [x] Use TanStack Router Link component with activeProps
  - [x] Style active nav item with accent background
  - [x] Add stats section with useLiveQuery counts

- [x] Task 6: Enable dark mode as default (AC: #1)
  - [x] Add `class="dark"` to `<html>` element in index.html
  - [x] Verify shadcn dark theme colors are applied
  - [x] Confirm dark background and light text render correctly

- [x] Task 7: Create Dashboard with empty state (AC: #4)
  - [x] Use EmptyState component when no transactions
  - [x] Display "No transactions yet" with import CTA
  - [x] CTA button is disabled (placeholder for Epic 2)

## Dev Notes

### File Creation Order

Create files in this order to avoid import errors:

1. **Layout components first** (no route dependencies)
2. **EmptyState component** (used by routes)
3. **Route files** (`__root.tsx` imports Layout)
4. **Update main.tsx** (imports generated routeTree)

### TanStack Router Vite Plugin Setup

**CRITICAL:** File-based routing requires the Vite plugin. Without it, `routeTree.gen` will not exist.

**Install the plugin:**
```bash
npm install -D @tanstack/router-plugin
```

**Update vite.config.ts:**
```typescript
import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

The plugin auto-generates `src/routeTree.gen.ts` when you run `npm run dev` or `npm run build`.

### Root Layout (`__root.tsx`)

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
```

### Route File Pattern

```typescript
// src/routes/index.tsx (Dashboard)
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  // Component implementation
}
```

### Router Configuration in main.tsx

```typescript
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

### Navigation with Active State Highlighting

```typescript
// In Sidebar.tsx
import { Link } from '@tanstack/react-router'
import { LayoutDashboard, Receipt, Store, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/transactions', label: 'Transactions', icon: <Receipt className="h-4 w-4" /> },
  { to: '/merchants', label: 'Merchants', icon: <Store className="h-4 w-4" /> },
  { to: '/accounts', label: 'Accounts', icon: <CreditCard className="h-4 w-4" /> },
]

// In render:
{navItems.map((item) => (
  <Link
    key={item.to}
    to={item.to}
    className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    activeProps={{
      className: 'bg-accent text-foreground',
    }}
  >
    {item.icon}
    {item.label}
  </Link>
))}
```

### Sidebar Stats with useLiveQuery

**CRITICAL:** Cannot use `.where().equals(undefined)` in Dexie. Use `.filter()` instead.

```typescript
// In Sidebar.tsx
import { db, useLiveQuery } from '@/lib/db'

// Count unmatched transactions (no merchantId)
const unmatched = useLiveQuery(
  () => db.transactions.filter(t => t.merchantId === undefined).count()
) ?? 0

// Count total merchants
const merchantCount = useLiveQuery(
  () => db.merchants.count()
) ?? 0
```

**DO NOT** store these in React state. useLiveQuery handles reactivity automatically.

### Dark Mode Configuration

**CRITICAL:** shadcn requires the `dark` class on `<html>` element.

**Update index.html:**
```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mamen</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Dark theme colors are already configured in `src/index.css` from shadcn init (Story 1.1).

### Header with Search Trigger

The header shows a search trigger button that will be functional in Story 3.3:

```typescript
// In Header.tsx
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Search trigger (non-functional placeholder)
<Button
  variant="outline"
  className="w-64 justify-start text-muted-foreground"
  disabled
>
  <Search className="mr-2 h-4 w-4" />
  Search...
  <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
    <span className="text-xs">⌘</span>K
  </kbd>
</Button>
```

### Reusable EmptyState Component

```typescript
// src/components/EmptyState/index.tsx
import { Button } from '@/components/ui/button'
import { type LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16">
      <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        {description}
      </p>
      {actionLabel && (
        <Button onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
```

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ mamen                         [Search... ⌘K]       [Settings]│
├────────────────┬─────────────────────────────────────────────┤
│                │                                             │
│  Navigation    │  Main Content Area                          │
│  ────────────  │                                             │
│  ■ Dashboard   │  <Outlet /> - Route content renders here    │
│  □ Transactions│                                             │
│  □ Merchants   │                                             │
│  □ Accounts    │                                             │
│                │                                             │
│  Stats         │                                             │
│  ────────────  │                                             │
│  Unmatched: 0  │                                             │
│  Merchants: 0  │                                             │
│                │                                             │
└────────────────┴─────────────────────────────────────────────┘
     220px                    flex: 1
```

### Project Structure

```
src/
├── components/
│   ├── EmptyState/
│   │   └── index.tsx
│   └── Layout/
│       ├── index.tsx      # Main layout wrapper
│       ├── Sidebar.tsx    # 220px sidebar with nav and stats
│       └── Header.tsx     # Top header with app name and search
├── routes/
│   ├── __root.tsx         # Root layout, wraps with Layout
│   ├── index.tsx          # Dashboard (/)
│   ├── transactions.tsx   # /transactions
│   ├── merchants.tsx      # /merchants
│   └── accounts.tsx       # /accounts
└── routeTree.gen.ts       # Auto-generated by TanStack Router plugin
```

### TypeScript Conventions

- Use `type` not `interface`
- Named exports only (no default exports)
- Props types: `{ComponentName}Props`
- Event handlers: `handle{Event}` naming

### Anti-Patterns to AVOID

- DO NOT use default exports
- DO NOT use `interface` (use `type`)
- DO NOT duplicate Dexie data in React state
- DO NOT use `.where().equals(undefined)` in Dexie queries
- DO NOT create separate test directories

### Previous Story Dependencies

**Story 1.1 provides:**
- Vite + React 19 + TypeScript 5 + SWC configured
- shadcn/ui with Tailwind v4 and dark mode colors
- Path aliases: @/components, @/lib, @/types, etc.
- Dependencies: @tanstack/react-router, lucide-react, dexie

**Story 1.2 provides:**
- Dexie database with tables: accounts, transactions, merchants, rules, settings
- `useLiveQuery` exported from `@/lib/db/index.ts`
- TypeScript types in `src/types/`

### Integration Points

**Will be extended by:**
- Story 3.3: Command Palette (⌘K trigger becomes functional)
- Story 4.2: Unmatched view (U key focus mode in sidebar)
- Epic 2: Import functionality (Import Statement CTA becomes functional)

### Validation Checklist

Before marking this story complete, verify:
- [ ] `npm run dev` starts without errors (route generation works)
- [ ] `npm run build` completes without errors
- [ ] All 4 routes work: /, /transactions, /merchants, /accounts
- [ ] Layout renders with 220px sidebar and flexible main content
- [ ] Navigation links work and highlight active route with accent bg
- [ ] Sidebar shows live stats using useLiveQuery
- [ ] Dark theme is applied (`class="dark"` on html element)
- [ ] Dashboard shows EmptyState with disabled CTA button
- [ ] No TypeScript errors
- [ ] Named exports only (no default exports)
- [ ] Uses `type` not `interface`

### References

- [TanStack Router File-Based Routing](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)
- [TanStack Router Vite Plugin](https://tanstack.com/router/latest/docs/framework/react/devtools#tanstackrouter-pluginvite)
- [Source: architecture.md#Project-Structure-Boundaries]
- [Source: ux-design-specification.md#Design-Direction-Decision]
- [Source: project-context.md#Data-Access-MOST-IMPORTANT]
- [Source: epics.md#Story-1.3]

## Change Log

- 2026-02-07: Implemented full app shell with Linear-inspired layout, TanStack Router file-based routing, sidebar navigation with live Dexie stats, dark mode, and dashboard empty state. All 7 tasks completed with 13 new tests passing.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Initial test run had 2 failures due to "Merchants" text appearing in both nav link and stats section. Fixed by using role-based queries (`getByRole('link')`) instead of text matching.

### Completion Notes List

- Installed `@tanstack/router-plugin` and configured TanStackRouterVite in vite.config.ts
- Created Layout components: Layout wrapper (flex h-screen), Sidebar (220px with nav + stats), Header (app name + disabled search trigger ⌘K)
- Created EmptyState reusable component with icon, title, description, and optional action button
- Created 5 route files: `__root.tsx` (root layout), `index.tsx` (dashboard), `transactions.tsx`, `merchants.tsx`, `accounts.tsx`
- Updated main.tsx to use RouterProvider with generated routeTree
- Enabled dark mode by adding `class="dark"` to html element and updating title to "mamen"
- Dashboard shows EmptyState with disabled "Import Statement" CTA when no transactions exist
- Sidebar shows live stats (Unmatched, Merchants) via useLiveQuery from Dexie
- Active nav item highlighted with `bg-accent text-foreground` via TanStack Router activeProps
- All conventions followed: `type` not `interface`, named exports only, co-located tests, no Dexie data in React state
- TypeScript: 0 errors, Build: success, Tests: 111 passed (13 new), ESLint: 3 pre-existing warnings in shadcn files only

### File List

- `vite.config.ts` (modified) - Added TanStackRouterVite plugin
- `index.html` (modified) - Added `class="dark"` to html, updated title to "mamen"
- `src/main.tsx` (modified) - Replaced App with RouterProvider + createRouter
- `src/components/Layout/index.tsx` (new) - Main layout wrapper with sidebar + header + content
- `src/components/Layout/Sidebar.tsx` (new) - 220px sidebar with navigation and live stats
- `src/components/Layout/Header.tsx` (new) - Header bar with app name and search trigger
- `src/components/Layout/Layout.test.tsx` (new) - 8 tests for layout, navigation, and stats
- `src/components/EmptyState/index.tsx` (new) - Reusable empty state component
- `src/components/EmptyState/EmptyState.test.tsx` (new) - 5 tests for empty state component
- `src/routes/__root.tsx` (new) - Root route with Layout wrapper
- `src/routes/index.tsx` (new) - Dashboard route with empty state
- `src/routes/transactions.tsx` (new) - Transactions placeholder route
- `src/routes/merchants.tsx` (new) - Merchants placeholder route
- `src/routes/accounts.tsx` (new) - Accounts placeholder route
- `src/routeTree.gen.ts` (new, auto-generated) - TanStack Router generated route tree
- `package-lock.json` (modified) - Updated with @tanstack/router-plugin
- `src/routes/.gitkeep` (deleted) - Removed placeholder file
