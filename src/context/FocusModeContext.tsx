import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'

type FocusMode = 'all' | 'unmatched' | 'month' | 'subscriptions'

type MonthRange = { start: Date; end: Date }

const getMonthRange = (): MonthRange => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

type FocusModeContextValue = {
  focusMode: FocusMode
  setFocusMode: (mode: FocusMode) => void
  toggleFocusMode: (mode: FocusMode) => void
  activeFilters: Set<FocusMode>
  currentMonthRange: MonthRange
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null)

type FocusModeProviderProps = {
  children: ReactNode
}

export const FocusModeProvider = ({ children }: FocusModeProviderProps): React.ReactElement => {
  const [activeFilters, setActiveFilters] = useState<Set<FocusMode>>(() => new Set())
  const [monthRange, setMonthRange] = useState<MonthRange>(getMonthRange)

  // Recompute month range on visibility change (handles month boundary crossings)
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        setMonthRange(getMonthRange())
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const toggleFocusMode = useCallback((mode: FocusMode) => {
    setActiveFilters((current) => {
      if (mode === 'all') {
        return new Set()
      }
      const next = new Set(current)
      if (next.has(mode)) {
        next.delete(mode)
      } else {
        next.add(mode)
      }
      return next
    })
  }, [])

  const setFocusMode = useCallback((mode: FocusMode) => {
    if (mode === 'all') {
      setActiveFilters(new Set())
    } else {
      setActiveFilters(new Set([mode]))
    }
  }, [])

  // Backward compatible: primary active filter or 'all' if empty
  const focusMode: FocusMode = useMemo(() => {
    if (activeFilters.size === 0) return 'all'
    // Return first filter as primary (unmatched takes priority for breadcrumb compatibility)
    if (activeFilters.has('unmatched')) return 'unmatched'
    if (activeFilters.has('month')) return 'month'
    if (activeFilters.has('subscriptions')) return 'subscriptions'
    return 'all'
  }, [activeFilters])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'u') {
        event.preventDefault()
        toggleFocusMode('unmatched')
      } else if (key === 'm') {
        event.preventDefault()
        toggleFocusMode('month')
      } else if (key === 'a') {
        event.preventDefault()
        toggleFocusMode('all')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleFocusMode])

  const contextValue = useMemo(
    () => ({ focusMode, setFocusMode, toggleFocusMode, activeFilters, currentMonthRange: monthRange }),
    [focusMode, setFocusMode, toggleFocusMode, activeFilters, monthRange],
  )

  return (
    <FocusModeContext.Provider value={contextValue}>
      {children}
    </FocusModeContext.Provider>
  )
}

export const useFocusMode = (): FocusModeContextValue => {
  const context = useContext(FocusModeContext)
  if (!context) {
    throw new Error('useFocusMode must be used within FocusModeProvider')
  }
  return context
}

export type { FocusMode, FocusModeContextValue, MonthRange }
