# UI Design Improvements Plan

## Context

The app's current sidebar is visually flat and generic (monochrome gray in dark mode, basic hover states). The content area has no visual separation from the sidebar. The transaction list appears instantly with no visual flourish. This plan addresses three areas: sidebar redesign, content panel elevation effect, and transaction list entrance animations.

## Files to Modify

| File | Scope |
|------|-------|
| `packages/web/src/index.css` | Theme colors, new keyframes, new CSS variables |
| `packages/web/src/components/Layout/Sidebar.tsx` | Sidebar redesign (typography, colors, icons, active indicator, hover effects, collapse animations, tooltips) |
| `packages/web/src/components/Layout/index.tsx` | Refine content panel shadow |
| `packages/web/src/components/Layout/Header.tsx` | Soften border |
| `packages/web/src/features/transactions/components/TransactionDataTable/index.tsx` | Staggered entrance animation for rows |

---

## 1. Theme & CSS Changes (`index.css`) ✅

### Dark theme sidebar variables — add subtle cool tint and a colored accent indicator

```css
/* .dark block — replace sidebar vars */
--sidebar: oklch(0.13 0.005 270);            /* very subtle cool-blue tint instead of pure gray */
--sidebar-foreground: oklch(0.55 0 0);        /* dimmer for inactive items */
--sidebar-accent: oklch(1 0 0 / 7%);         /* slightly softer hover bg */
--sidebar-border: oklch(1 0 0 / 6%);         /* more subtle separator */
--sidebar-indicator: oklch(0.65 0.15 250);   /* muted blue-purple active accent */
```

### Light theme — add indicator and tweak sidebar

```css
/* :root block */
--sidebar: oklch(0.975 0.003 270);           /* faint cool white */
--sidebar-indicator: oklch(0.5 0.18 250);    /* blue-purple accent */
```

### Register the new indicator variable

```css
/* @theme inline block */
--color-sidebar-indicator: var(--sidebar-indicator);
```

### Add reduced-motion entry for the icon glow class

```css
@media (prefers-reduced-motion: reduce) {
  /* ... existing entries + add: */
  .sidebar-nav-icon-active { filter: none; }
}
```

No new keyframes needed — the active indicator will use Tailwind's built-in `animate-in` or a simple `transition` rather than a custom keyframe.

---

## 2. Sidebar Redesign (`Sidebar.tsx`) ✅

### Active state indicator
Each nav `Link` and active button gets a `before:` pseudo-element — a 3px-wide, 16px-tall rounded pill on the left edge, colored with `bg-sidebar-indicator`:

```tsx
// activeProps example for Link:
activeProps={{
  className: cn(
    "is-active text-sidebar-primary-foreground bg-sidebar-accent",
    "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
    "before:h-4 before:w-[3px] before:rounded-full before:bg-sidebar-indicator",
  ),
}}
```

Same pattern for the `button` elements when `activeFilters.has("month")` etc.

### Icon glow on active
Icons inside nav items get a subtle drop-shadow when their parent link is active, using Tailwind's `group` variant:

```tsx
// Each Link gets `group relative` in its base className
// Each icon span gets:
<span className="shrink-0 transition-[filter] duration-200 group-[.is-active]:drop-shadow-[0_0_3px_oklch(0.65_0.15_250_/_40%)]">
  {item.icon}
</span>
```

### Hover effects
- Base: `hover:bg-sidebar-accent/60 hover:translate-x-0.5 transition-all duration-200`
- This gives a slight rightward nudge + semi-transparent bg on hover (lighter than active state)

### Collapse label transition
Replace `{!collapsed && <span>label</span>}` with an always-rendered span that transitions opacity and max-width:

```tsx
<span className={cn(
  "overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-300",
  collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"
)}>
  {item.label}
</span>
```

Same pattern for badge/count elements beside labels.

### Stats section collapse
Keep the `{!collapsed && ...}` conditional for the Stats block (it's complex enough that max-width animation doesn't work well), but wrap in a transition:

```tsx
<div className={cn(
  "mt-auto pt-4 border-t border-sidebar-border transition-opacity duration-200",
  collapsed && "opacity-0 pointer-events-none h-0 overflow-hidden"
)}>
```

### Collapsed tooltips
When `collapsed`, wrap each nav item with the existing `Tooltip` component (from `@/components/ui/tooltip`) to show the label on hover:

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Wrap the nav in <TooltipProvider delayDuration={200}>
// Each nav item when collapsed:
<Tooltip>
  <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
  <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
</Tooltip>
```

### Inset separator
```tsx
<div className={cn("my-3 border-t border-sidebar-border", collapsed ? "mx-2" : "mx-3")} />
```

---

## 3. Layout Content Panel (`Layout/index.tsx`)

### Layered shadow
Replace the single shadow with a two-layer shadow for a more realistic elevation:

```
shadow-[-2px_0_16px_rgba(0,0,0,0.2),-8px_0_40px_rgba(0,0,0,0.15)]
```

No other structural changes needed — `rounded-l-2xl` is already correct, and the `bg-sidebar` on the outer container already matches the sidebar background.

---

## 4. Header (`Header.tsx`)

Soften the bottom border:
```
border-b border-border/30
```

---

## 5. Transaction List Entrance Animation (`TransactionDataTable/index.tsx`)

### Problem
Rows are absolutely positioned with inline `transform: translateY(...)` for virtualization. The existing `.tx-row-enter` CSS animation also uses `transform`, which would **override** the positioning transform.

### Solution — nested div approach
Split each virtual row into:
- **Outer div**: positioning only (`position: absolute`, `transform: translateY(...)`, `width`, `height`)
- **Inner div**: visual content + animation (`role`, `aria-*`, click handlers, `className`, `.tx-row-enter`)

This cleanly separates virtual positioning from animation transforms.

### State management

```tsx
const prefersReducedMotion = useReducedMotion();
const hasAnimatedRef = useRef(false);
const [isEntering, setIsEntering] = useState(!prefersReducedMotion);

useEffect(() => {
  if (hasAnimatedRef.current || prefersReducedMotion) return;
  hasAnimatedRef.current = true;
  const timer = setTimeout(() => setIsEntering(false), 1200);
  return () => clearTimeout(timer);
}, [prefersReducedMotion]);
```

### Row rendering

```tsx
{virtualizer.getVirtualItems().map((virtualRow) => {
  const shouldAnimate = isEntering && virtualRow.index < 25; // cap stagger to ~25 rows

  return (
    <div
      key={rowId}
      style={{ position: "absolute", top: 0, left: 0, width: "100%",
               height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
    >
      <div
        id={`tx-${rowId}`}
        role="option"
        className={cn(
          "flex items-center h-full px-4 gap-4 border-b cursor-pointer transition-colors",
          /* ... existing state classes ... */
          shouldAnimate && "tx-row-enter",
        )}
        style={shouldAnimate ? { "--row-delay": `${virtualRow.index * 30}ms` } as React.CSSProperties : undefined}
        /* ... existing handlers ... */
      >
        {/* cells unchanged */}
      </div>
    </div>
  );
})}
```

### Timing
- 30ms stagger per row × 25 rows = 750ms total stagger
- Each row animation: 350ms
- Total visual duration: ~1.1s
- `isEntering` flips to `false` after 1.2s, removing all animation classes

---

## Verification

1. **Visual check**: Run `pnpm dev` and verify:
   - Sidebar has subtle cool tint, colored active indicator pill, hover effects with nudge
   - Collapsed sidebar shows tooltips, labels fade smoothly
   - Content panel appears elevated with layered shadow and rounded left edge
   - Transaction list rows stagger in on first load
2. **Reduced motion**: In browser DevTools, enable "prefers-reduced-motion: reduce" → verify all animations are disabled, rows appear instantly
3. **Light mode**: Toggle to light mode → verify sidebar indicator and colors work
4. **Keyboard nav**: Verify J/K navigation still works in transaction list (inner div now has role="option")
5. **Run tests**: `pnpm --filter web test` to catch any regressions
