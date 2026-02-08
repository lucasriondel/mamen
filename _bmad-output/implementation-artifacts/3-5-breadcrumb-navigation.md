# Story 3.5: Breadcrumb Navigation

Status: review

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

- [x] Task 1: Create Breadcrumb component structure (AC: #1)
  - [x] Create `src/components/Breadcrumb/index.tsx`
  - [x] Create `src/components/Breadcrumb/Breadcrumb.test.tsx`
  - [x] Define `BreadcrumbProps` type with segments array
  - [x] Each segment: `{ label: string, href?: string }`
  - [x] Use semantic `<nav aria-label="Breadcrumb">` wrapper
  - [x] Use `<ol>` for ordered breadcrumb list

- [x] Task 2: Implement breadcrumb segment rendering (AC: #1, #2, #3, #4)
  - [x] Render each segment as clickable link (except last)
  - [x] Last segment is current page (not clickable, `aria-current="page"`)
  - [x] Add ">" separator between segments using CSS or icon
  - [x] Style per UX spec: muted color for links, foreground for current
  - [x] Use Lucide `ChevronRight` icon for separator (12px)

- [x] Task 3: Integrate with TanStack Router (AC: #5)
  - [x] Create `src/hooks/useBreadcrumbs.ts` hook
  - [x] Use `useLocation()` from TanStack Router to derive route hierarchy
  - [x] Map pathname segments to breadcrumb segments via routeLabelMap
  - [x] Handle dynamic route params (e.g., `/merchants/123` -> nested segments)
  - [x] Return array of `{ label, href }` objects

- [x] Task 4: Configure route breadcrumb metadata (AC: #2, #3, #4)
  - [x] Add breadcrumb labels via routeLabelMap in useBreadcrumbs hook
  - [x] Dashboard route: `'Dashboard'`
  - [x] Transactions route: `'Transactions'`
  - [x] Merchants route: `'Merchants'`
  - [x] Accounts route: `'Accounts'`
  - [x] Settings route: `'Settings'`
  - [x] Dynamic segments: auto-derived from path with pathToLabel utility

- [x] Task 5: Handle dynamic breadcrumb labels (AC: #3, #4)
  - [x] Dynamic path segments converted to human-readable labels via pathToLabel
  - [x] Nested routes (e.g., /merchants/123) generate multi-segment breadcrumbs
  - [x] Future merchant detail pages will show "Merchants > [ID]" (name lookup deferred to Epic 7)

- [x] Task 6: Implement navigation on click (AC: #5)
  - [x] Wrap each segment (except last) in `<Link>` from TanStack Router
  - [x] Navigate to segment's `href` on click
  - [x] Ensure URL updates correctly

- [x] Task 7: Implement truncation for long paths (AC: #6)
  - [x] If > 3 segments, show: "First > ... > Last two"
  - [x] Add "..." button element in middle
  - [x] On click of "...", expand to show all segments
  - [x] Full path visible in tooltip on hover of truncated breadcrumb

- [x] Task 8: Add breadcrumb to app layout (AC: #1)
  - [x] Modify `src/components/Layout/index.tsx`
  - [x] Place Breadcrumb below header, above main content
  - [x] Position: top of main content area, left-aligned
  - [x] Spacing: mb-4 margin bottom
  - [x] Only show when segments > 1 (hide on root pages like Dashboard)

- [x] Task 9: Add keyboard navigation support (AC: #5)
  - [x] Breadcrumb links are tabbable (standard anchor behavior)
  - [x] `Backspace` key navigates up one level (when not in input)
  - [x] Created `useBreadcrumbNavigation` hook with global keydown handler
  - [x] Prevent Backspace when user is typing in input/textarea/contenteditable
  - [x] Test keyboard navigation through breadcrumbs (6 tests)

- [x] Task 10: Style breadcrumb per UX specification (AC: #1, #6)
  - [x] Container: `hidden md:flex items-center gap-1 text-sm`
  - [x] Links: `text-muted-foreground hover:text-foreground transition-colors`
  - [x] Current page: `text-foreground font-medium`
  - [x] Separator: `text-muted-foreground` (ChevronRight icon, h-3 w-3)
  - [x] Height: auto, fits content
  - [x] Truncation: use `truncate` class on individual segments
  - [x] Max-width for individual segments: 200px with ellipsis

- [x] Task 11: Handle responsive behavior (AC: #6)
  - [x] Desktop (768px+): Show full breadcrumb
  - [x] Mobile (<768px): Hide breadcrumb trail entirely
  - [x] Use Tailwind responsive classes: `hidden md:flex`

- [x] Task 12: Write unit and integration tests (AC: all)
  - [x] Create `src/components/Breadcrumb/Breadcrumb.test.tsx` (11 tests)
    - Test: renders single segment correctly (returns null)
    - Test: renders multiple segments with separators
    - Test: last segment is not clickable
    - Test: clicking segment renders link correctly
    - Test: truncation works for long paths (>3 segments)
    - Test: expanding truncated segments on click
    - Test: `aria-current="page"` on last segment
    - Test: semantic nav > ol > li structure
    - Test: chevron separators
    - Test: responsive classes
    - Test: custom className
  - [x] Create `src/hooks/useBreadcrumbs.test.ts` (8 tests)
    - Test: returns correct segments for each route
    - Test: handles dynamic/nested route params
    - Test: returns fallback label for unknown routes
    - Test: exports routeLabelMap
  - [x] Create `src/hooks/useBreadcrumbNavigation.test.ts` (6 tests)
    - Test: navigates up on Backspace
    - Test: ignores on root/single-segment routes
    - Test: ignores when input/textarea focused
    - Test: ignores non-Backspace keys

- [x] Task 13: Accessibility compliance (AC: all)
  - [x] Use `<nav aria-label="Breadcrumb">` wrapper
  - [x] Use `<ol>` with `<li>` elements for semantic structure
  - [x] Add `aria-current="page"` to last segment
  - [x] Links have visible focus state (standard browser focus)
  - [x] Screen reader announces "breadcrumb navigation" via aria-label
  - [x] Uses semantic color tokens for contrast
  - [x] Truncated segments accessible via keyboard (button element)

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

Claude Opus 4.6

### Debug Log References

- TanStack Router tests require `await router.load()` before render + `waitFor` to ensure component mounts
- `hidden` CSS class requires `{ hidden: true }` option in `getByRole` queries
- Used `useLocation()` instead of `useMatches()` with route context since all routes are flat and adding breadcrumb context to route definitions would require modifying the auto-generated route type system

### Completion Notes List

- Created Breadcrumb component with semantic HTML (`nav > ol > li`), accessibility attributes, truncation support, and responsive hiding
- Created `useBreadcrumbs` hook using `useLocation()` with a `routeLabelMap` for known routes and `pathToLabel` utility for dynamic segments
- Created `useBreadcrumbNavigation` hook for global Backspace key navigation with input field detection
- Integrated breadcrumb into Layout component below header, above main content
- 25 total tests across 3 test files (11 component + 8 hook + 6 keyboard navigation)
- All 372 tests pass with no regressions (pre-existing accounts.test.tsx DOMMatrix failure is unrelated)
- No TypeScript errors
- Follows all project conventions: `type` not `interface`, named exports, co-located tests

### Change Log

- 2026-02-08: Implemented breadcrumb navigation (Story 3.5) - all 13 tasks complete

### File List

- `src/components/Breadcrumb/index.tsx` (new) - Breadcrumb component
- `src/components/Breadcrumb/Breadcrumb.test.tsx` (new) - 11 component tests
- `src/hooks/useBreadcrumbs.ts` (new) - Hook to derive breadcrumb segments from current route
- `src/hooks/useBreadcrumbs.test.ts` (new) - 8 hook tests
- `src/hooks/useBreadcrumbNavigation.ts` (new) - Hook for Backspace keyboard navigation
- `src/hooks/useBreadcrumbNavigation.test.ts` (new) - 6 keyboard navigation tests
- `src/components/Layout/index.tsx` (modified) - Added breadcrumb + keyboard navigation to layout
