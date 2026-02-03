# Story 3.3: Command Palette Foundation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **to open a command palette with Cmd+K**,
So that **I can quickly access actions and search without navigating menus (FR22)**.

## Acceptance Criteria

1. **Given** I am anywhere in the app
   **When** I press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
   **Then** the command palette opens
   **And** it opens in under 50ms (NFR2)
   **And** focus is immediately in the search input

2. **Given** the command palette is open
   **When** I view its structure
   **Then** I see a search input at the top
   **And** I see grouped sections below: Recent, Actions, Navigation
   **And** the palette is styled per UX spec (dark popover, centered)

3. **Given** the command palette is open
   **When** I press `Esc`
   **Then** the palette closes
   **And** focus returns to where it was before

4. **Given** the command palette is open
   **When** I click outside the palette
   **Then** the palette closes

5. **Given** the command palette shows results
   **When** I press `↑` or `↓`
   **Then** I can navigate through results
   **And** the selected result is highlighted

6. **Given** I have a result selected
   **When** I press `Enter`
   **Then** the action is executed (navigation or action)
   **And** the palette closes

7. **Given** the command palette is open
   **When** I view the Actions section
   **Then** I see: "Import statement", "View unmatched", "View subscriptions"
   **And** each action shows its keyboard shortcut if applicable

## Tasks / Subtasks

- [ ] Task 1: Add cmdk shadcn component (AC: #2)
  - [ ] Run `npx shadcn@latest add command` if not already added
  - [ ] Verify cmdk is installed in package.json
  - [ ] Review generated `src/components/ui/command.tsx` structure
  - [ ] Understand Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator exports

- [ ] Task 2: Create CommandPalette component structure (AC: #1, #2, #7)
  - [ ] Create `src/components/CommandPalette/index.tsx`
  - [ ] Import Command components from `@/components/ui/command`
  - [ ] Use CommandDialog for the modal wrapper
  - [ ] Structure with CommandInput at top
  - [ ] Add CommandGroup for "Actions" section
  - [ ] Add CommandGroup for "Navigation" section
  - [ ] Style with dark popover background per UX spec

- [ ] Task 3: Implement global keyboard trigger (AC: #1)
  - [ ] Create `src/hooks/useCommandPalette.ts`
  - [ ] Listen for `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) globally
  - [ ] Use `useEffect` with document keydown listener
  - [ ] Detect platform for correct modifier key (`metaKey` vs `ctrlKey`)
  - [ ] Prevent default browser behavior (Cmd+K often opens search/bookmarks)
  - [ ] Store `isOpen` state and `setIsOpen` setter
  - [ ] Export hook for use by components

- [ ] Task 4: Create command palette state management (AC: #1, #3, #4)
  - [ ] Create `src/context/CommandPaletteContext.tsx`
  - [ ] Provide `isOpen`, `open`, `close`, `toggle` functions
  - [ ] Track `previousFocusRef` to restore focus on close (AC #3)
  - [ ] Store previous activeElement before opening
  - [ ] Restore focus to stored element when closing

- [ ] Task 5: Integrate palette into App root (AC: #1)
  - [ ] Wrap App with CommandPaletteProvider
  - [ ] Render CommandPalette component at root level (inside providers)
  - [ ] Verify palette is accessible from any route/page

- [ ] Task 6: Define initial Actions section items (AC: #7)
  - [ ] "Import statement" - navigates to import page (future: opens import modal)
  - [ ] "View unmatched" action - sets filter and navigates to transactions (U key shortcut)
  - [ ] "View subscriptions" action - navigates to subscriptions view (S key shortcut)
  - [ ] Each item displays keyboard shortcut badge on right side
  - [ ] Use CommandShortcut component from shadcn for shortcut display

- [ ] Task 7: Define Navigation section items (AC: #2, #6)
  - [ ] "Dashboard" - navigates to / route
  - [ ] "Transactions" - navigates to /transactions route
  - [ ] "Merchants" - navigates to /merchants route
  - [ ] "Accounts" - navigates to /accounts route
  - [ ] "Settings" - navigates to /settings route
  - [ ] Use TanStack Router's useNavigate for navigation

- [ ] Task 8: Implement navigation with palette close (AC: #6)
  - [ ] Create `handleSelect` function that:
    - Executes the action (navigate or callback)
    - Closes the palette
    - Focus is automatically restored via context
  - [ ] Pass `onSelect` prop to CommandItem components
  - [ ] Ensure navigation happens BEFORE palette closes (avoid flash)

- [ ] Task 9: Implement keyboard navigation within results (AC: #5)
  - [ ] cmdk handles ↑/↓ navigation automatically
  - [ ] Verify `aria-selected` updates on highlighted item
  - [ ] Verify visual highlight follows selection
  - [ ] Test that Enter triggers selected item

- [ ] Task 10: Implement Esc to close and restore focus (AC: #3)
  - [ ] CommandDialog handles Esc automatically via Radix Dialog
  - [ ] Verify focus restoration uses stored `previousFocusRef`
  - [ ] If previous element no longer exists, focus document body
  - [ ] Test focus returns to TransactionList when opened from there

- [ ] Task 11: Implement click-outside to close (AC: #4)
  - [ ] CommandDialog handles click-outside via Radix Dialog overlay
  - [ ] Verify clicking backdrop closes palette
  - [ ] Verify clicking inside palette does NOT close it

- [ ] Task 12: Performance optimization for <50ms open (AC: #1)
  - [ ] CommandPalette should be pre-rendered (not lazy loaded)
  - [ ] Use CSS visibility/display for show/hide instead of mounting/unmounting
  - [ ] Memoize action/navigation lists to prevent recalculation
  - [ ] Measure open time in DevTools Performance tab
  - [ ] Target: palette visible within 50ms of keypress

- [ ] Task 13: Style command palette per UX specification (AC: #2)
  - [ ] Background: `popover` color (dark)
  - [ ] Border: subtle `border` color
  - [ ] Input placeholder: "Search actions, pages..."
  - [ ] Centered horizontally, positioned in upper third vertically
  - [ ] Max-width: 600px
  - [ ] Border radius: `radius-md` (6px)
  - [ ] Subtle shadow for elevation

- [ ] Task 14: Add keyboard shortcut badges to action items (AC: #7)
  - [ ] Use `<CommandShortcut>` component from shadcn
  - [ ] Style badges with muted background, small text
  - [ ] Show: `⌘I` for Import, `U` for Unmatched, `S` for Subscriptions
  - [ ] Platform-aware: show `⌘` on Mac, `Ctrl` on Windows/Linux

- [ ] Task 15: Write unit and integration tests (AC: all)
  - [ ] Create `src/components/CommandPalette/CommandPalette.test.tsx`
    - Test: Cmd+K opens palette
    - Test: Ctrl+K opens palette on non-Mac
    - Test: Esc closes palette
    - Test: Click outside closes palette
    - Test: ↓/↑ navigates items
    - Test: Enter executes selected action
    - Test: Focus returns to previous element on close
    - Test: Actions section shows expected items
    - Test: Navigation section shows expected items
  - [ ] Create `src/hooks/useCommandPalette.test.ts`
    - Test: Hook responds to keyboard shortcut
    - Test: isOpen state toggles correctly
  - [ ] Create `src/context/CommandPaletteContext.test.tsx`
    - Test: Context provides open/close/toggle functions
    - Test: Focus restoration works

- [ ] Task 16: Accessibility compliance (AC: #2, #5)
  - [ ] cmdk/Radix provides most ARIA automatically
  - [ ] Verify `role="combobox"` on input
  - [ ] Verify `role="listbox"` on results list
  - [ ] Verify `role="option"` on each item
  - [ ] Verify `aria-selected` on highlighted item
  - [ ] Verify `aria-expanded` on dialog
  - [ ] Test with VoiceOver (macOS) for screen reader support

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Design-System-Choice]**

- Command palette uses **cmdk** library (shadcn/ui wraps it)
- cmdk is the same library used by Linear, Raycast, Vercel
- Available via `npx shadcn@latest add command`

**Source: [architecture.md#Additional-Core-Dependencies]**

```bash
# cmdk comes with shadcn command component
npx shadcn@latest add command
```

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming
- Component in `src/components/CommandPalette/index.tsx`

### UX Design Requirements

**Source: [ux-design-specification.md#Command-Palette]**

| Aspect | Requirement |
|--------|-------------|
| Trigger | `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) |
| Open time | < 50ms (NFR2) |
| Search | Fuzzy search with typo tolerance (Story 3.4) |
| Sections | Recent, Actions, Navigation |
| Close | `Esc`, click outside |

**Source: [ux-design-specification.md#Command-Palette-Anatomy]**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 Search transactions, merchants, actions...                   │
├─────────────────────────────────────────────────────────────────┤
│ Recent                                                          │
│   Amazon                                              Merchant  │
│   Uber                                                Merchant  │
│ ─────────────────────────────────────────────────────────────── │
│ Actions                                                         │
│   Import statement                                    ⌘I        │
│   View unmatched                                      U         │
│   View subscriptions                                  S         │
└─────────────────────────────────────────────────────────────────┘
```

**Source: [ux-design-specification.md#Global-Shortcuts]**

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd+K` | Open command palette | Global, always available |
| `Esc` | Close modal/palette | Global |

### cmdk Component Structure

```typescript
// src/components/CommandPalette/index.tsx

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useNavigate } from '@tanstack/react-router'
import { useCommandPalette } from '@/context/CommandPaletteContext'

type CommandPaletteProps = Record<string, never>

export const CommandPalette = (_props: CommandPaletteProps): JSX.Element => {
  const { isOpen, close } = useCommandPalette()
  const navigate = useNavigate()

  const handleSelect = (action: () => void) => {
    action()
    close()
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Search actions, pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/import' }))}>
            Import statement
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/transactions', search: { filter: 'unmatched' } }))}>
            View unmatched
            <CommandShortcut>U</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/subscriptions' }))}>
            View subscriptions
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/' }))}>
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/transactions' }))}>
            Transactions
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/merchants' }))}>
            Merchants
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/accounts' }))}>
            Accounts
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate({ to: '/settings' }))}>
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

### Command Palette Context

```typescript
// src/context/CommandPaletteContext.tsx

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

type CommandPaletteContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

type CommandPaletteProviderProps = {
  children: ReactNode
}

export const CommandPaletteProvider = ({ children }: CommandPaletteProviderProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const open = useCallback(() => {
    // Store current focus before opening
    previousFocusRef.current = document.activeElement as HTMLElement
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Restore focus after close
    requestAnimationFrame(() => {
      previousFocusRef.current?.focus()
    })
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  // Global keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K on Mac, Ctrl+K on Windows/Linux
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? event.metaKey : event.ctrlKey

      if (modifier && event.key === 'k') {
        event.preventDefault()
        toggle()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggle])

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export const useCommandPalette = (): CommandPaletteContextValue => {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  }
  return context
}
```

### Styling per UX Spec

```typescript
// In CommandPalette or via globals.css

// CommandDialog already provides:
// - Centered overlay
// - Dark popover background (from theme)
// - Radix Dialog accessibility

// Custom styles if needed:
// .command-palette {
//   @apply max-w-[600px] border border-border rounded-md;
// }
```

### Platform Detection for Shortcuts

```typescript
// src/lib/utils/platform.ts

export const isMac = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

export const getModifierSymbol = (): string => {
  return isMac() ? '⌘' : 'Ctrl+'
}
```

### Integration with App.tsx

```typescript
// src/App.tsx

import { CommandPaletteProvider } from '@/context/CommandPaletteContext'
import { CommandPalette } from '@/components/CommandPalette'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '@/routes'

export const App = (): JSX.Element => {
  return (
    <CommandPaletteProvider>
      <RouterProvider router={router} />
      <CommandPalette />
    </CommandPaletteProvider>
  )
}
```

### Performance Considerations

**Source: [project-context.md#Performance-Requirements]**

| Metric | Target | Implementation |
|--------|--------|----------------|
| Open time | <50ms | Pre-render palette, CSS show/hide |
| Navigation response | Instant | cmdk handles via keyboard |
| Focus management | Instant | Radix Dialog built-in |

**Key optimizations:**
- CommandPalette is always mounted (controlled by `open` prop)
- Action items are memoized to prevent re-render
- cmdk handles filtering internally (no React state for search)
- CSS transitions for open/close (no mount/unmount)

### Project Structure for This Story

```
src/
├── components/
│   ├── ui/
│   │   └── command.tsx (shadcn generated)
│   └── CommandPalette/
│       ├── index.tsx
│       └── CommandPalette.test.tsx
├── context/
│   ├── CommandPaletteContext.tsx
│   └── CommandPaletteContext.test.tsx
├── hooks/
│   └── useCommandPalette.ts (optional, logic in context)
└── lib/
    └── utils/
        └── platform.ts (isMac helper)
```

### Dependencies on Previous Stories

This story **requires** Stories 3.1 and 3.2 to be implemented:
- App shell with routing (TanStack Router)
- Basic page structure for navigation targets
- Keyboard patterns established (for consistency)

### Preparation for Future Stories

This story prepares for:
- **Story 3.4 (Transaction Search):** Add search functionality to palette
- **Story 4.3 (R Key):** Quick actions can be registered in palette
- **Story 5.4/5.5 (Focus Modes):** M/S/U actions in palette

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT mount/unmount palette on open/close (hurts performance)
- DO NOT lazy-load CommandPalette (must be instant)
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT add features beyond scope (search comes in Story 3.4)

### Validation Checklist

Before marking complete:
- [ ] Cmd+K opens command palette (Mac)
- [ ] Ctrl+K opens command palette (Windows/Linux)
- [ ] Palette opens in under 50ms
- [ ] Focus is immediately in search input
- [ ] Esc closes palette
- [ ] Click outside closes palette
- [ ] ↑/↓ navigates through items
- [ ] Enter executes selected action
- [ ] Focus returns to previous element on close
- [ ] Actions section shows: Import, Unmatched, Subscriptions
- [ ] Navigation section shows: Dashboard, Transactions, Merchants, Accounts, Settings
- [ ] Keyboard shortcuts displayed on action items
- [ ] Platform-aware modifier symbol (⌘ vs Ctrl)
- [ ] Dark popover styling per UX spec
- [ ] Centered, max-width 600px
- [ ] ARIA attributes for accessibility
- [ ] Works with dark theme
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files

### References

- [Source: epics.md#Story-3.3-Command-Palette-Foundation]
- [Source: prd.md#FR22 - Command palette (Cmd+K)]
- [Source: architecture.md#Design-System-Choice (cmdk)]
- [Source: architecture.md#Implementation-Patterns]
- [Source: ux-design-specification.md#Command-Palette]
- [Source: ux-design-specification.md#Navigation-Patterns]
- [Source: ux-design-specification.md#Keyboard-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Previous Story: 3-2-keyboard-navigation-with-jk.md (keyboard patterns)]
- [cmdk documentation](https://cmdk.paco.me/)
- [shadcn/ui command component](https://ui.shadcn.com/docs/components/command)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
