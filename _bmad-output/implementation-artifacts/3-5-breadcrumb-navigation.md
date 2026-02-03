# Story 3.5: Breadcrumb Navigation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to see my current location in the app via breadcrumbs**,
So that **I always know where I am and can navigate back easily (FR28)**.

## Acceptance Criteria

1. **Given** I am on any page
   **When** I view the header/content area
   **Then** I see breadcrumb navigation showing my current location
   **And** the format is: "Section > Subsection > Detail"

2. **Given** I am on the Dashboard
   **When** I view breadcrumbs
   **Then** I see: "Dashboard"

3. **Given** I am viewing transactions for a specific account
   **When** I view breadcrumbs
   **Then** I see: "Transactions > [Account Name]"

4. **Given** I am on a merchant detail page (future epic)
   **When** I view breadcrumbs
   **Then** I see: "Merchants > [Merchant Name]"

5. **Given** I see multiple breadcrumb segments
   **When** I click on an earlier segment
   **Then** I navigate to that location
   **And** the URL updates accordingly

6. **Given** the breadcrumb path is long
   **When** space is limited
   **Then** middle segments are truncated: "Dashboard > ... > Detail"
   **And** full path is visible on hover/tooltip

## Tasks / Subtasks

- [ ] Task 1: Create Breadcrumb component structure (AC: #1)
  - [ ] Create `src/components/Breadcrumb/index.tsx`
  - [ ] Create `src/components/Breadcrumb/Breadcrumb.test.tsx`
  - [ ] Define `BreadcrumbProps` type with segments array
  - [ ] Each segment: `{ label: string, href?: string }`
  - [ ] Use semantic `<nav aria-label="Breadcrumb">` wrapper
  - [ ] Use `<ol>` for ordered breadcrumb list

- [ ] Task 2: Implement breadcrumb segment rendering (AC: #1, #2, #3, #4)
  - [ ] Render each segment as clickable link (except last)
  - [ ] Last segment is current page (not clickable, `aria-current="page"`)
  - [ ] Add ">" separator between segments using CSS or icon
  - [ ] Style per UX spec: muted color for links, foreground for current
  - [ ] Use Lucide `ChevronRight` icon for separator (12px)

- [ ] Task 3: Integrate with TanStack Router (AC: #5)
  - [ ] Create `src/hooks/useBreadcrumbs.ts` hook
  - [ ] Use `useMatches()` from TanStack Router to get route hierarchy
  - [ ] Map route matches to breadcrumb segments
  - [ ] Handle dynamic route params (e.g., `$merchantId` -> merchant name)
  - [ ] Return array of `{ label, href }` objects

- [ ] Task 4: Configure route breadcrumb metadata (AC: #2, #3, #4)
  - [ ] Add breadcrumb labels to route definitions
  - [ ] Dashboard route: `{ breadcrumb: 'Dashboard' }`
  - [ ] Transactions route: `{ breadcrumb: 'Transactions' }`
  - [ ] Transactions with account filter: derive from account name
  - [ ] Merchants route: `{ breadcrumb: 'Merchants' }`
  - [ ] Merchant detail: derive from merchant name via loader/context
  - [ ] Accounts route: `{ breadcrumb: 'Accounts' }`
  - [ ] Settings route: `{ breadcrumb: 'Settings' }`

- [ ] Task 5: Handle dynamic breadcrumb labels (AC: #3, #4)
  - [ ] For filtered views (e.g., transactions by account):
    - Fetch account name from Dexie via `useLiveQuery`
    - Display: "Transactions > [Account Name]"
  - [ ] For merchant detail pages:
    - Fetch merchant name from route loader or context
    - Display: "Merchants > [Merchant Name]"
  - [ ] Handle loading state: show skeleton or fallback text
  - [ ] Handle missing entity: show "Not Found" or redirect

- [ ] Task 6: Implement navigation on click (AC: #5)
  - [ ] Wrap each segment (except last) in `<Link>` from TanStack Router
  - [ ] Navigate to segment's `href` on click
  - [ ] Ensure URL updates correctly
  - [ ] Preserve any relevant search params where appropriate

- [ ] Task 7: Implement truncation for long paths (AC: #6)
  - [ ] If > 3 segments, show: "First > ... > Last two"
  - [ ] Add "..." button/element in middle
  - [ ] On hover/click of "...", show dropdown with hidden segments
  - [ ] Use shadcn Popover or Tooltip for overflow menu
  - [ ] Full path visible in tooltip on hover of truncated breadcrumb

- [ ] Task 8: Add breadcrumb to app layout (AC: #1)
  - [ ] Modify `src/components/Layout/index.tsx`
  - [ ] Place Breadcrumb below header, above main content
  - [ ] Position: top of main content area, left-aligned
  - [ ] Spacing: 16px padding horizontal, 8px margin bottom
  - [ ] Only show when segments > 1 (hide on root pages like Dashboard)

- [ ] Task 9: Add keyboard navigation support (AC: #5)
  - [ ] Breadcrumb links should be tabbable
  - [ ] `Backspace` key navigates up one level (when not in input)
  - [ ] Add to keyboard context: handle Backspace globally
  - [ ] Prevent Backspace when user is typing in input field
  - [ ] Test keyboard navigation through breadcrumbs

- [ ] Task 10: Style breadcrumb per UX specification (AC: #1, #6)
  - [ ] Container: `flex items-center gap-2 text-sm`
  - [ ] Links: `text-muted-foreground hover:text-foreground`
  - [ ] Current page: `text-foreground font-medium`
  - [ ] Separator: `text-muted-foreground` (ChevronRight icon)
  - [ ] Height: auto, fits content
  - [ ] Truncation: use `truncate` class on individual segments if needed
  - [ ] Max-width for individual segments: 200px with ellipsis

- [ ] Task 11: Handle responsive behavior (AC: #6)
  - [ ] Desktop (1024px+): Show full breadcrumb
  - [ ] Tablet (768-1023px): Truncate middle if > 3 segments
  - [ ] Mobile (<768px): Show only current page name (no breadcrumb trail)
  - [ ] Use Tailwind responsive classes: `hidden md:flex`

- [ ] Task 12: Write unit and integration tests (AC: all)
  - [ ] Create `src/components/Breadcrumb/Breadcrumb.test.tsx`
    - Test: renders single segment correctly
    - Test: renders multiple segments with separators
    - Test: last segment is not clickable
    - Test: clicking segment navigates correctly
    - Test: truncation works for long paths
    - Test: `aria-current="page"` on last segment
  - [ ] Create `src/hooks/useBreadcrumbs.test.ts`
    - Test: returns correct segments for each route
    - Test: handles dynamic route params
    - Test: returns empty array for unknown routes
  - [ ] Update layout tests to verify breadcrumb presence

- [ ] Task 13: Accessibility compliance (AC: all)
  - [ ] Use `<nav aria-label="Breadcrumb">` wrapper
  - [ ] Use `<ol>` with `<li>` elements for semantic structure
  - [ ] Add `aria-current="page"` to last segment
  - [ ] Ensure links have visible focus state
  - [ ] Test with VoiceOver: should announce "breadcrumb navigation"
  - [ ] Ensure color contrast meets AA (4.5:1 for text)
  - [ ] Truncated segments accessible via keyboard

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Frontend-Architecture]**

- Use TanStack Router for type-safe routing
- Routes defined in `src/routes/` directory
- Use `useMatches()` hook for route hierarchy access

**Source: [architecture.md#Additional-Core-Dependencies]**

| Library | Version | Purpose |
|---------|---------|---------|
| TanStack Router | ^1.153 | Type-safe SPA routing |
| Lucide React | latest | Icons (ChevronRight separator) |

### UX Design Requirements

**Source: [ux-design-specification.md#Navigation-Patterns]**

| Pattern | Source | Application in mamen |
|---------|--------|---------------------|
| Breadcrumbs | IDE/Dev tools | Always show current location |

**Source: [ux-design-specification.md#Breadcrumbs]**

```
Dashboard > Shopping > Amazon
```

**Behavior:**
- Click any segment to navigate
- `Backspace` navigates up one level
- Truncate middle segments on small screens: `Dashboard > ... > Amazon`

**Source: [ux-design-specification.md#Micro-Emotions]**

| Avoid State | Design Response |
|-------------|-----------------|
| Confusion | Always show context (breadcrumbs, focus state) |

**Source: [ux-design-specification.md#Design-Direction-Linear-Layout]**

```
Main Content Area
─────────────────
[Breadcrumb: Dashboard > Shopping]

┌─────────────────────────────────────┐
│ Transaction List / Dashboard /      │
│ Rule Editor / etc.                  │
└─────────────────────────────────────┘
```

### Implementation Approach

#### Breadcrumb Component

```typescript
// src/components/Breadcrumb/index.tsx

import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type BreadcrumbSegment = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  segments: BreadcrumbSegment[]
  className?: string
}

export const Breadcrumb = ({ segments, className }: BreadcrumbProps): JSX.Element | null => {
  if (segments.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      <ol className="flex items-center gap-1">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1

          return (
            <li key={segment.href ?? segment.label} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-medium text-foreground"
                >
                  {segment.label}
                </span>
              ) : (
                <Link
                  to={segment.href ?? '/'}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {segment.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
```

#### useBreadcrumbs Hook

```typescript
// src/hooks/useBreadcrumbs.ts

import { useMatches, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

type BreadcrumbSegment = {
  label: string
  href?: string
}

export const useBreadcrumbs = (): BreadcrumbSegment[] => {
  const matches = useMatches()
  const params = useParams({ strict: false })

  // Fetch dynamic data for route params
  const account = useLiveQuery(
    () => params.accountId ? db.accounts.get(params.accountId) : undefined,
    [params.accountId]
  )

  const merchant = useLiveQuery(
    () => params.merchantId ? db.merchants.get(params.merchantId) : undefined,
    [params.merchantId]
  )

  // Build breadcrumb segments from route matches
  const segments: BreadcrumbSegment[] = matches
    .filter((match) => match.routeContext?.breadcrumb)
    .map((match) => {
      let label = match.routeContext.breadcrumb

      // Handle dynamic labels
      if (match.pathname.includes('/accounts/') && account) {
        label = account.name
      }
      if (match.pathname.includes('/merchants/') && merchant) {
        label = merchant.name
      }

      return {
        label,
        href: match.pathname,
      }
    })

  return segments
}
```

#### Route Configuration

```typescript
// src/routes/__root.tsx

import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  // Root has no breadcrumb
})

// src/routes/index.tsx (Dashboard)
export const Route = createFileRoute('/')({
  context: () => ({ breadcrumb: 'Dashboard' }),
})

// src/routes/transactions.tsx
export const Route = createFileRoute('/transactions')({
  context: () => ({ breadcrumb: 'Transactions' }),
})

// src/routes/merchants/index.tsx
export const Route = createFileRoute('/merchants/')({
  context: () => ({ breadcrumb: 'Merchants' }),
})

// src/routes/merchants/$merchantId.tsx
export const Route = createFileRoute('/merchants/$merchantId')({
  context: () => ({ breadcrumb: 'Loading...' }), // Dynamic, overridden by hook
})
```

#### Layout Integration

```typescript
// src/components/Layout/index.tsx (additions)

import { Breadcrumb } from '@/components/Breadcrumb'
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs'

export const Layout = ({ children }: LayoutProps): JSX.Element => {
  const breadcrumbs = useBreadcrumbs()

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-4">
          <Breadcrumb segments={breadcrumbs} className="mb-4" />
          {children}
        </main>
      </div>
    </div>
  )
}
```

#### Keyboard Navigation

```typescript
// src/hooks/useKeyboardNavigation.ts (additions)

// Add to existing keyboard handler:
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  // Backspace navigates up (when not in input)
  if (e.key === 'Backspace' && !isInputFocused()) {
    e.preventDefault()
    navigateUp()
  }
}

const navigateUp = () => {
  const segments = breadcrumbs
  if (segments.length > 1) {
    const parentSegment = segments[segments.length - 2]
    if (parentSegment.href) {
      navigate({ to: parentSegment.href })
    }
  }
}

const isInputFocused = (): boolean => {
  const activeElement = document.activeElement
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement?.getAttribute('contenteditable') === 'true'
  )
}
```

### Project Structure for This Story

```
src/
├── components/
│   ├── Breadcrumb/
│   │   ├── index.tsx (new)
│   │   └── Breadcrumb.test.tsx (new)
│   └── Layout/
│       └── index.tsx (modify - add breadcrumb)
├── hooks/
│   ├── useBreadcrumbs.ts (new)
│   ├── useBreadcrumbs.test.ts (new)
│   └── useKeyboardNavigation.ts (modify - add Backspace)
└── routes/
    ├── __root.tsx (modify - add context type)
    ├── index.tsx (modify - add breadcrumb context)
    ├── transactions.tsx (modify - add breadcrumb context)
    ├── merchants/
    │   ├── index.tsx (modify)
    │   └── $merchantId.tsx (modify)
    └── settings.tsx (modify - add breadcrumb context)
```

### Dependencies on Previous Stories

This story **requires** Epic 3 Stories 3.1-3.4:
- App shell and layout established (Story 1.3)
- TanStack Router configured (Story 1.1)
- Basic page structure in place

### Preparation for Future Stories

This story prepares for:
- **Story 4.2 (Unmatched View):** Breadcrumb shows "Transactions > Unmatched"
- **Story 6.4 (Drill-down):** Breadcrumb shows "Dashboard > [Category]"
- **Story 7.2 (Merchant Detail):** Breadcrumb shows "Merchants > [Merchant Name]"

### Breadcrumb Examples by Route

| Route | Breadcrumb Display |
|-------|-------------------|
| `/` | (hidden - single segment) |
| `/transactions` | (hidden - single segment) |
| `/transactions?account=123` | "Transactions > Main Bank" |
| `/transactions?month=2026-01` | "Transactions > January 2026" |
| `/merchants` | (hidden - single segment) |
| `/merchants/abc123` | "Merchants > Amazon" |
| `/settings` | (hidden - single segment) |
| `/settings/llm` | "Settings > LLM Configuration" |

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT hardcode breadcrumb labels in component (use route metadata)
- DO NOT duplicate route hierarchy logic (derive from TanStack Router)

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Breadcrumb render | <16ms | Simple component, minimal props |
| Dynamic label fetch | Non-blocking | useLiveQuery handles async |

- Breadcrumb is a lightweight component
- Dynamic labels use `useLiveQuery` which is already optimized
- No additional database queries if data already in cache

### TanStack Router Context Pattern

```typescript
// Declare route context type
declare module '@tanstack/react-router' {
  interface RouteContext {
    breadcrumb?: string
  }
}

// Use in route definition
export const Route = createFileRoute('/transactions')({
  context: () => ({
    breadcrumb: 'Transactions',
  }),
})

// Access in hook
const matches = useMatches()
matches.forEach((match) => {
  const breadcrumb = match.routeContext?.breadcrumb
})
```

### Validation Checklist

Before marking complete:
- [ ] Breadcrumb appears below header in main content area
- [ ] Dashboard shows no breadcrumb (single segment)
- [ ] Transactions with account filter shows "Transactions > [Account Name]"
- [ ] Future merchant detail will show "Merchants > [Merchant Name]"
- [ ] Clicking earlier segment navigates to that route
- [ ] URL updates correctly on navigation
- [ ] Long paths truncate with "..." in middle
- [ ] Truncated breadcrumb shows full path on hover
- [ ] Backspace key navigates up one level (when not in input)
- [ ] Breadcrumb hidden on mobile
- [ ] Screen reader announces "breadcrumb navigation"
- [ ] `aria-current="page"` on last segment
- [ ] Focus visible on breadcrumb links
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### References

- [Source: epics.md#Story-3.5-Breadcrumb-Navigation]
- [Source: prd.md#FR28 - System displays breadcrumb navigation showing current location]
- [Source: architecture.md#Frontend-Architecture (TanStack Router)]
- [Source: architecture.md#Additional-Core-Dependencies]
- [Source: ux-design-specification.md#Navigation-Patterns]
- [Source: ux-design-specification.md#Breadcrumbs]
- [Source: ux-design-specification.md#Design-Direction-Linear-Layout]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Previous Stories: 3-1 through 3-4 (Epic 3 foundation)]
- [TanStack Router documentation - useMatches](https://tanstack.com/router/latest/docs/framework/react/api/router/useMatchesHook)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
