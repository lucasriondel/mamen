import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type SelectionStatusBarProps = {
  count: number
  onClear: () => void
}

export function SelectionStatusBar({ count, onClear }: SelectionStatusBarProps): React.ReactElement | null {
  const prefersReducedMotion = useReducedMotion()

  if (count === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${count} transactions selected. Press Escape to clear selection.`}
      className={cn(
        'flex items-center gap-4 px-4 py-2 border-t bg-card text-sm',
        !prefersReducedMotion && 'animate-in slide-in-from-bottom-2 duration-200',
      )}
    >
      <span className="font-medium">
        <span className="text-ring">✓</span> {count} selected
      </span>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-xs">R</kbd>
        <span>Assign merchant</span>
        <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-xs">C</kbd>
        <span>Category</span>
        <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-xs">D</kbd>
        <span>Delete</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onClear}
          aria-label="Clear selection"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-xs">Esc</kbd>
          <span>Clear</span>
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
