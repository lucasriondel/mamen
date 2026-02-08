import { useState, useEffect, useRef, useCallback } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const ANIMATION_DURATION_MS = 300

export type AnimatedCounterProps = {
  value: number
  label?: string
  className?: string
}

const getColorClass = (value: number): string => {
  if (value === 0) return 'text-green-500'
  if (value <= 10) return 'text-amber-500'
  return 'text-muted-foreground'
}

export function AnimatedCounter({
  value,
  label,
  className,
}: AnimatedCounterProps): React.ReactElement {
  const prefersReducedMotion = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(value)
  const [isAnimating, setIsAnimating] = useState(false)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevValueRef = useRef(value)

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (value === prevValueRef.current) return

    const from = prevValueRef.current
    prevValueRef.current = value

    if (prefersReducedMotion) {
      setDisplayValue(value)
      return
    }

    cleanup()
    setIsAnimating(true)

    const startTime = performance.now()
    const diff = value - from

    const animate = (now: number): void => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1)
      // ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(from + diff * eased)
      setDisplayValue(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
        timerRef.current = setTimeout(() => {
          setIsAnimating(false)
        }, 100)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return cleanup
  }, [value, prefersReducedMotion, cleanup])

  useEffect(() => cleanup, [cleanup])

  const colorClass = getColorClass(displayValue)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        colorClass,
        isAnimating && 'counter-updating',
        className,
      )}
    >
      {label && <span>{label}</span>}
      <span>{displayValue}</span>
      {displayValue === 0 && (
        <Check className="h-3 w-3" aria-label="All done" />
      )}
    </span>
  )
}
