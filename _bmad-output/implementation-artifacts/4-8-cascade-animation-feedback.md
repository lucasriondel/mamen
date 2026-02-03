# Story 4.8: Cascade Animation & Feedback

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want **satisfying visual feedback when a rule categorizes multiple transactions**,
So that **I feel the reward of my rule-building investment**.

## Acceptance Criteria

1. **Given** I create a rule that matches multiple transactions
   **When** the rule is applied
   **Then** matching transactions briefly highlight (glow animation)
   **And** category badges fade in on each row

2. **Given** the cascade animation plays
   **When** transactions are categorized
   **Then** animation is staggered (50ms per row, max 10 animated)
   **And** the animation completes in under 600ms

3. **Given** the cascade animation plays
   **When** transactions are categorized
   **Then** the Unmatched counter animates down
   **And** the counter shows the number decreasing with easing

4. **Given** the user has `prefers-reduced-motion` enabled
   **When** a rule is applied
   **Then** animations are disabled
   **And** state changes are instant
   **And** counter still updates (no animation)

5. **Given** the unmatched count reaches zero
   **When** in Unmatched view
   **Then** the counter shows "0" in success color
   **And** a subtle celebration state appears

6. **Given** a rule matches transactions
   **When** the toast appears
   **Then** it shows: "[X] transactions → [Merchant Name]"
   **And** an Undo button is available for 10 seconds

## Tasks / Subtasks

- [ ] Task 1: Create CascadeAnimationContainer component (AC: #1, #2)
  - [ ] Create `src/components/CascadeAnimationContainer/index.tsx`
  - [ ] Create `src/components/CascadeAnimationContainer/CascadeAnimationContainer.test.tsx`
  - [ ] Props type:
    ```typescript
    type CascadeAnimationContainerProps = {
      transactionIds: string[]  // IDs of transactions to animate
      isAnimating: boolean
      onAnimationComplete?: () => void
      children: React.ReactNode
    }
    ```
  - [ ] Orchestrate animation sequence:
    1. Highlight phase (0-200ms): Matching transactions glow with ring color
    2. Badge appear phase (100-300ms): Category badge fades in on each row
    3. Settle phase (200-500ms): Highlight dims to normal state
  - [ ] Stagger animation: 50ms delay per row
  - [ ] Max 10 rows animated (performance constraint)
  - [ ] Use CSS transitions with dynamic staggered delays
  - [ ] Named exports only, use `type` not `interface`

- [ ] Task 2: Create useReducedMotion hook (AC: #4)
  - [ ] Create `src/hooks/useReducedMotion.ts`
  - [ ] Create `src/hooks/useReducedMotion.test.ts`
  - [ ] Hook implementation:
    ```typescript
    export const useReducedMotion = (): boolean => {
      // Returns true if user prefers reduced motion
      // Uses window.matchMedia('(prefers-reduced-motion: reduce)')
    }
    ```
  - [ ] React to media query changes (not just initial value)
  - [ ] SSR-safe: return false if window is undefined
  - [ ] Named exports only

- [ ] Task 3: Implement transaction row highlight animation (AC: #1, #2)
  - [ ] Modify `src/components/TransactionRow/index.tsx`
  - [ ] Add `isHighlighted` prop or use CSS class toggle
  - [ ] Highlight styles:
    ```css
    /* Glow effect using ring color */
    .cascade-highlight {
      box-shadow: 0 0 0 2px hsl(var(--ring)), 0 0 12px hsl(var(--ring) / 0.4);
      background-color: hsl(var(--ring) / 0.1);
      transition: box-shadow 200ms ease-out, background-color 200ms ease-out;
    }
    ```
  - [ ] Settle animation: Glow fades out over 300ms
  - [ ] Ensure 60fps performance (no layout thrashing)

- [ ] Task 4: Implement category badge fade-in animation (AC: #1)
  - [ ] Modify category badge appearance in TransactionRow
  - [ ] Animation when badge first appears:
    ```css
    @keyframes badge-appear {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    .badge-entering {
      animation: badge-appear 200ms ease-out forwards;
    }
    ```
  - [ ] Stagger timing: Each badge delays based on row index
  - [ ] Use data attribute or class for animation state

- [ ] Task 5: Create AnimatedCounter component (AC: #3, #5)
  - [ ] Create `src/components/AnimatedCounter/index.tsx`
  - [ ] Create `src/components/AnimatedCounter/AnimatedCounter.test.tsx`
  - [ ] Props type:
    ```typescript
    type AnimatedCounterProps = {
      value: number
      label?: string
      className?: string
    }
    ```
  - [ ] Animation behavior:
    - Number animates with ease-out easing (300ms duration)
    - Counts down (or up) digit by digit
    - Brief scale pulse (1.0 → 1.05 → 1.0) on value change
  - [ ] Color states:
    - Normal (>10): `muted-foreground`
    - Low (1-10): `warning` color
    - Zero (0): `success` color with checkmark icon
  - [ ] Respect `prefers-reduced-motion`: instant value change, no animation
  - [ ] Use requestAnimationFrame for smooth interpolation

- [ ] Task 6: Integrate AnimatedCounter in sidebar (AC: #3, #5)
  - [ ] Update sidebar component to use AnimatedCounter
  - [ ] Replace static unmatched count display
  - [ ] Wire value from `useLiveQuery` unmatched count
  - [ ] Counter format: "Unmatched: X" or just the number with label

- [ ] Task 7: Implement celebration state for zero unmatched (AC: #5)
  - [ ] Modify AnimatedCounter or create separate InboxZeroState
  - [ ] When count === 0:
    - Show "0" in success color
    - Display subtle checkmark icon (Lucide Check or CheckCircle)
    - Optional: brief pulse animation on the checkmark
  - [ ] In Unmatched view, show full InboxZeroEmptyState:
    ```tsx
    <div className="flex flex-col items-center justify-center h-full">
      <CheckCircle className="w-12 h-12 text-success animate-scale-in" />
      <h2>All caught up!</h2>
      <p>Every transaction has a merchant.</p>
      <Button variant="outline">View Dashboard</Button>
    </div>
    ```
  - [ ] Disable confetti/particles if `prefers-reduced-motion`

- [ ] Task 8: Create useCascadeAnimation hook (AC: #1, #2, #4)
  - [ ] Create `src/hooks/useCascadeAnimation.ts`
  - [ ] Create `src/hooks/useCascadeAnimation.test.ts`
  - [ ] Hook interface:
    ```typescript
    export const useCascadeAnimation = () => {
      return {
        triggerCascade: (transactionIds: string[]) => void,
        animatingIds: string[],
        isAnimating: boolean,
        animationPhase: 'idle' | 'highlight' | 'badge' | 'settle',
      }
    }
    ```
  - [ ] Manages animation state machine:
    1. `idle` → `highlight` (trigger)
    2. `highlight` → `badge` (after 100ms)
    3. `badge` → `settle` (after 200ms)
    4. `settle` → `idle` (after 300ms)
  - [ ] Respects reduced motion: skip to final state immediately
  - [ ] Cleans up timeouts on unmount
  - [ ] Named exports only

- [ ] Task 9: Integrate cascade animation with rule creation (AC: #1, #2, #6)
  - [ ] Modify merchant assignment modal completion flow
  - [ ] When rule is created/applied:
    1. Close modal
    2. Get list of affected transaction IDs
    3. Trigger cascade animation via `useCascadeAnimation`
    4. Show toast: "[X] transactions → [Merchant Name]" with Undo
  - [ ] Coordinate timing: animation starts as toast appears

- [ ] Task 10: Implement rule application toast (AC: #6)
  - [ ] Create standardized toast for rule application
  - [ ] Toast content:
    ```tsx
    <Toast>
      <ToastTitle>
        <CheckIcon /> {count} transactions → {merchantName}
      </ToastTitle>
      <ToastAction altText="Undo">Undo</ToastAction>
    </Toast>
    ```
  - [ ] Undo action: reverts all transactions to previous state
  - [ ] 10-second duration with undo available
  - [ ] Toast dismisses on click or after timeout
  - [ ] Use existing toast infrastructure (shadcn/sonner)

- [ ] Task 11: Wire undo functionality to cascade toast (AC: #6)
  - [ ] Store pre-rule state for affected transactions:
    ```typescript
    type CascadeUndoState = {
      transactionIds: string[]
      previousStates: Map<string, {
        merchantId: string | null
        categoryId: string | null
        subcategoryId: string | null
        manualCategory: boolean
      }>
    }
    ```
  - [ ] On undo: restore all transactions to previous state
  - [ ] Reverse animation: transactions briefly highlight, then badges fade out
  - [ ] Show confirmation toast: "Undone: {count} transactions restored"

- [ ] Task 12: Add CSS transitions for reduced motion (AC: #4)
  - [ ] Create animation utility styles:
    ```css
    /* Animation that respects reduced motion */
    .animate-cascade {
      transition: box-shadow 200ms ease-out, background-color 200ms ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .animate-cascade {
        transition: none;
      }
      .badge-entering {
        animation: none;
      }
      .counter-animate {
        transition: none;
      }
    }
    ```
  - [ ] Apply to all cascade-related animations
  - [ ] Test with system reduced motion setting

- [ ] Task 13: Optimize animation performance (AC: #2)
  - [ ] Use CSS transform and opacity only (GPU-accelerated)
  - [ ] Avoid animating layout properties (width, height, padding)
  - [ ] Use `will-change: transform, opacity` sparingly
  - [ ] Batch DOM reads/writes to prevent layout thrashing
  - [ ] Use `requestAnimationFrame` for JavaScript animations
  - [ ] Profile with Chrome DevTools Performance tab
  - [ ] Target: 60fps during cascade, <600ms total duration

- [ ] Task 14: Export new components and hooks (AC: all)
  - [ ] Update `src/components/index.ts`:
    ```typescript
    export { CascadeAnimationContainer } from './CascadeAnimationContainer'
    export { AnimatedCounter } from './AnimatedCounter'
    ```
  - [ ] Update `src/hooks/index.ts`:
    ```typescript
    export { useReducedMotion } from './useReducedMotion'
    export { useCascadeAnimation } from './useCascadeAnimation'
    ```
  - [ ] Named exports only

- [ ] Task 15: Write integration tests (AC: all)
  - [ ] Test: Creating a rule triggers cascade animation on matching transactions
  - [ ] Test: Animation completes within 600ms
  - [ ] Test: Staggered delay of 50ms per row applied
  - [ ] Test: Max 10 rows are animated (11th+ instant)
  - [ ] Test: AnimatedCounter decrements with animation
  - [ ] Test: Counter color changes at thresholds (>10, 1-10, 0)
  - [ ] Test: Zero state shows success color and checkmark
  - [ ] Test: With prefers-reduced-motion, animations are instant
  - [ ] Test: Toast appears with correct count and merchant name
  - [ ] Test: Undo button works within 10 seconds
  - [ ] Test: Undo restores transactions to previous state
  - [ ] Test: InboxZeroEmptyState appears when unmatched = 0

- [ ] Task 16: Create Storybook stories for animation components (optional)
  - [ ] AnimatedCounter.stories.tsx: Show different value states
  - [ ] CascadeAnimationContainer.stories.tsx: Demo cascade sequence
  - [ ] Document animation timings and behavior

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#Data-Architecture]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data Access | Dexie `useLiveQuery` directly | No state duplication, DB is source of truth |
| Undo/Redo | Command pattern | Fits 10-second toast undo UX |
| Animations | CSS transitions + requestAnimationFrame | GPU-accelerated, respects reduced motion |

**Source: [architecture.md#Implementation-Patterns]**

| Pattern | Rule |
|---------|------|
| TypeScript | Use `type` not `interface` |
| Exports | Named exports only, no default exports |
| Components | PascalCase directory + index.tsx |
| Tests | Co-located: `Component.test.tsx` next to `index.tsx` |
| Hooks | camelCase with `use` prefix |

### Previous Story Intelligence (Story 4.7)

**From Story 4.7 - Quick Category Assignment:**

Story 4.7 established:
- Category picker component patterns
- Toast notification with undo integration
- Transaction state update patterns
- Keyboard flow coordination with J/K navigation
- `manualCategory` flag for non-rule-based categorization

**Key patterns to reuse:**
- Toast with Undo action pattern
- Transaction update via Dexie
- State restoration for undo

**Key difference:** Story 4.8 focuses on visual feedback, not data operations

### UX Flow Specification

**Source: [ux-design-specification.md#Novel-UX-Patterns]**

**Rule Cascade Feedback** - The "aha moment":
1. User creates rule with pattern
2. System shows "12 transactions will match" in preview
3. User confirms
4. **Cascade animation:** Matched transactions highlight, then settle into categorized state
5. **Toast:** "12 transactions matched! [Undo]"
6. **Counter animation:** Unmatched count 47 → 35

**Source: [ux-design-specification.md#Cascade-Animation-Container]**

**Animation Sequence:**
1. **Highlight** (0-200ms): Matching transactions glow with ring color
2. **Badge appear** (100-300ms): Category badge fades in on each row
3. **Settle** (200-500ms): Highlight dims to normal state
4. **Counter update** (300-600ms): Unmatched count animates down

**Implementation:**
- CSS transitions with staggered delays (50ms per row, max 10 rows animated)
- Respects `prefers-reduced-motion`: instant state change, no animation
- Orchestrated via React state or CSS animation timeline

### Animation Timing Diagram

```
Time:     0ms   100ms  200ms  300ms  400ms  500ms  600ms
          |      |      |      |      |      |      |
Row 0:    [====HIGHLIGHT====][==SETTLE==]
Row 1:       [====HIGHLIGHT====][==SETTLE==]
Row 2:          [====HIGHLIGHT====][==SETTLE==]
...
Row 9:                [====HIGHLIGHT====][==SETTLE==]

Badges:      [APPEAR]         [VISIBLE]
Counter:                         [ANIMATE DOWN]

Toast:    [APPEAR WITH UNDO BUTTON]-------------------→
```

### Animated Counter Specification

**Source: [ux-design-specification.md#Animated-Counter]**

**Anatomy:**
```
┌─────────────────┐
│ Unmatched: 12   │
└─────────────────┘
```

**Behavior:**
- Number animates with ease-out easing (300ms duration)
- Brief scale pulse (1.0 → 1.1 → 1.0) on change
- Color transitions: muted → warning (1-10) → success (0)

**States:**

| State | Count | Appearance |
|-------|-------|------------|
| Normal | >10 | Default muted foreground |
| Low | 1-10 | Warning color, slight emphasis |
| Zero | 0 | Success color, checkmark icon, celebration |

### Inbox Zero Empty State

**Source: [ux-design-specification.md#Inbox-Zero-Empty-State]**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         ✓                                       │
│                                                                 │
│                   All caught up!                                │
│                                                                 │
│           Every transaction has a merchant.                     │
│                                                                 │
│                  [View Dashboard]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Animation:**
- Checkmark scales in (0 → 1) with spring easing
- Text fades in with slight delay
- Optional: subtle confetti particles (disabled if `prefers-reduced-motion`)

### Project Structure for This Story

```
src/
├── components/
│   ├── CascadeAnimationContainer/
│   │   ├── index.tsx (new)
│   │   └── CascadeAnimationContainer.test.tsx (new)
│   ├── AnimatedCounter/
│   │   ├── index.tsx (new)
│   │   └── AnimatedCounter.test.tsx (new)
│   ├── TransactionRow/
│   │   └── index.tsx (modify - add highlight state)
│   └── Layout/
│       └── Sidebar.tsx (modify - use AnimatedCounter)
├── hooks/
│   ├── useReducedMotion.ts (new)
│   ├── useReducedMotion.test.ts (new)
│   ├── useCascadeAnimation.ts (new)
│   └── useCascadeAnimation.test.ts (new)
├── features/
│   ├── transactions/
│   │   └── components/
│   │       └── TransactionList/
│   │           └── index.tsx (modify - wire cascade)
│   └── merchants/
│       └── components/
│           └── MerchantAssignmentModal/
│               └── index.tsx (modify - trigger cascade on complete)
└── styles/
    └── animations.css (new - cascade animation styles)
```

### CSS Animation Patterns

**Highlight animation:**
```css
/* Ring glow effect using CSS variables */
.cascade-highlight {
  box-shadow:
    0 0 0 2px hsl(var(--ring)),
    0 0 16px 2px hsl(var(--ring) / 0.3);
  background-color: hsl(var(--ring) / 0.08);
}

/* Staggered delay via CSS custom property */
.cascade-highlight[data-row-index="0"] { transition-delay: 0ms; }
.cascade-highlight[data-row-index="1"] { transition-delay: 50ms; }
.cascade-highlight[data-row-index="2"] { transition-delay: 100ms; }
/* ... up to 9 */
```

**Badge appearance:**
```css
@keyframes badge-appear {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(2px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.badge-cascade-enter {
  animation: badge-appear 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

**Counter animation:**
```css
@keyframes counter-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.counter-updating {
  animation: counter-pulse 300ms ease-out;
}
```

### Reduced Motion Handling

**Source: [ux-design-specification.md#Motion-Animation]**

```css
@media (prefers-reduced-motion: reduce) {
  .cascade-highlight,
  .badge-cascade-enter,
  .counter-updating {
    animation: none !important;
    transition: none !important;
  }

  /* Instant state changes still happen */
  .cascade-highlight {
    box-shadow: 0 0 0 2px hsl(var(--ring));
    background-color: hsl(var(--ring) / 0.08);
  }
}
```

### Dependencies on Previous Stories

This story depends on:

- **Story 3.2:** Keyboard Navigation with J/K (TransactionRow focus state)
- **Story 4.1:** Category System Setup (category badges)
- **Story 4.2:** Unmatched Transactions View (unmatched count in sidebar)
- **Story 4.3:** Create Merchant with Rule (R key modal, rule creation flow)
- **Story 4.7:** Quick Category Assignment (toast patterns, transaction updates)

### Preparation for Future Stories

This story provides foundation for:

- **Story 5.2:** Batch Merchant Assignment - cascade animation for batch operations
- **Story 5.3:** Batch Category Assignment - same animation patterns

### Integration Points

**From Story 4.3 (Merchant Assignment Modal):**

When merchant/rule is created:
```typescript
// In MerchantAssignmentModal onConfirm handler
const handleConfirm = async () => {
  const { merchantId, ruleId, matchedTransactionIds } = await createMerchantWithRule({
    merchantName,
    pattern,
    categoryId,
    subcategoryId,
  })

  onClose()

  // Trigger cascade animation
  triggerCascade(matchedTransactionIds)

  // Show toast
  toast({
    title: `${matchedTransactionIds.length} transactions → ${merchantName}`,
    action: <ToastAction onClick={handleUndo}>Undo</ToastAction>,
  })
}
```

**From Sidebar (Unmatched Count):**

Replace static count with AnimatedCounter:
```tsx
// In Sidebar component
const unmatchedCount = useLiveQuery(
  () => db.transactions
    .filter(tx => !tx.merchantId && !tx.manualCategory)
    .count()
)

return (
  <nav>
    {/* ... other nav items */}
    <NavItem>
      <span>Unmatched:</span>
      <AnimatedCounter value={unmatchedCount ?? 0} />
    </NavItem>
  </nav>
)
```

### Performance Considerations

**Animation Performance:**
- Use `transform` and `opacity` only (GPU composited)
- Avoid `box-shadow` animation on many elements simultaneously
- Pre-calculate stagger delays, don't compute in render
- Use `will-change: transform` on elements that will animate
- Remove `will-change` after animation completes

**Counter Animation:**
- Use `requestAnimationFrame` for smooth interpolation
- Don't animate every frame if value changes rapidly
- Debounce counter updates if multiple rule applications happen quickly

**Memory:**
- Store undo state for 10 seconds only
- Clear animation state after completion
- Don't hold references to DOM elements

### Testing Scenarios

**Unit Tests for CascadeAnimationContainer:**

```typescript
describe('CascadeAnimationContainer', () => {
  it('should apply highlight class to transaction rows', async () => {
    // Render with transactionIds
    // Assert highlight class applied
  })

  it('should stagger animation delay by 50ms per row', async () => {
    // Render with 5 transaction IDs
    // Assert data-row-index attributes
    // Assert computed transition-delay values
  })

  it('should limit animation to 10 rows', async () => {
    // Render with 15 transaction IDs
    // Assert only first 10 have staggered delay
    // Assert rows 10-14 have instant transition
  })

  it('should complete animation in under 600ms', async () => {
    // Trigger animation
    // Wait for onAnimationComplete
    // Assert timing is within bounds
  })
})
```

**Unit Tests for AnimatedCounter:**

```typescript
describe('AnimatedCounter', () => {
  it('should animate number change', async () => {
    // Render with value=10
    // Update value to 5
    // Assert intermediate values shown during animation
  })

  it('should show warning color for 1-10', async () => {
    // Render with value=5
    // Assert warning color class applied
  })

  it('should show success color and checkmark for 0', async () => {
    // Render with value=0
    // Assert success color class
    // Assert checkmark icon present
  })

  it('should skip animation with reduced motion', async () => {
    // Mock matchMedia to return reduced motion
    // Render with value=10
    // Update to 5
    // Assert instant change, no intermediate values
  })
})
```

**Integration Tests:**

```typescript
describe('Cascade Animation Integration', () => {
  it('should trigger cascade when rule is created', async () => {
    // Setup: Unmatched transactions in Dexie
    // Act: Create merchant with rule
    // Assert: Matching transactions show highlight
    // Assert: Animation completes
    // Assert: Toast appears
  })

  it('should decrement unmatched counter with animation', async () => {
    // Setup: 10 unmatched transactions
    // Act: Create rule matching 3
    // Assert: Counter animates from 10 to 7
  })

  it('should undo rule application via toast', async () => {
    // Setup: Create rule matching transactions
    // Act: Click undo in toast
    // Assert: Transactions restored to unmatched
    // Assert: Counter animates back up
  })
})
```

### Anti-Patterns to AVOID

**Source: [project-context.md#Anti-Patterns]**

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT duplicate Dexie data in React state (use `useLiveQuery`)
- DO NOT use class components
- DO NOT add comments/docstrings to code you didn't change
- DO NOT animate layout properties (width, height, margin, padding)
- DO NOT use setTimeout without cleanup on unmount
- DO NOT ignore prefers-reduced-motion media query
- DO NOT animate more than 10 rows simultaneously

### Validation Checklist

Before marking complete:
- [ ] Cascade animation triggers on rule creation
- [ ] Transactions highlight with ring glow
- [ ] Category badges fade in with stagger
- [ ] Animation stagger is 50ms per row
- [ ] Max 10 rows are animated (others instant)
- [ ] Total animation duration < 600ms
- [ ] AnimatedCounter shows value changes with easing
- [ ] Counter color: muted >10, warning 1-10, success 0
- [ ] Zero state shows checkmark icon
- [ ] InboxZeroEmptyState appears when unmatched = 0
- [ ] prefers-reduced-motion disables all animations
- [ ] State changes still happen with reduced motion
- [ ] Toast shows "[X] transactions → [Merchant]"
- [ ] Undo button works within 10 seconds
- [ ] Undo restores all transactions to previous state
- [ ] Animation performance is 60fps
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] All tests pass

### References

- [Source: epics.md#Epic-4-Story-4.8-Cascade-Animation-Feedback]
- [Source: architecture.md#Data-Architecture]
- [Source: architecture.md#Implementation-Patterns]
- [Source: project-context.md#Technology-Stack]
- [Source: project-context.md#Critical-Implementation-Rules]
- [Source: ux-design-specification.md#Novel-UX-Patterns]
- [Source: ux-design-specification.md#Cascade-Animation-Container]
- [Source: ux-design-specification.md#Animated-Counter]
- [Source: ux-design-specification.md#Inbox-Zero-Empty-State]
- [Source: ux-design-specification.md#Motion-Animation]
- [Story 3.2: Keyboard Navigation with J/K]
- [Story 4.1: Category System Setup]
- [Story 4.2: Unmatched Transactions View]
- [Story 4.3: Create Merchant with Rule (R key)]
- [Story 4.7: Quick Category Assignment (C key)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
