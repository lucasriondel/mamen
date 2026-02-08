import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type FocusMode = 'all' | 'unmatched' | 'month' | 'subscriptions'

type FocusModeContextValue = {
  focusMode: FocusMode
  setFocusMode: (mode: FocusMode) => void
  toggleFocusMode: (mode: FocusMode) => void
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null)

type FocusModeProviderProps = {
  children: ReactNode
}

export const FocusModeProvider = ({ children }: FocusModeProviderProps): React.ReactElement => {
  const [focusMode, setFocusMode] = useState<FocusMode>('all')

  const toggleFocusMode = useCallback((mode: FocusMode) => {
    setFocusMode((current) => (current === mode ? 'all' : mode))
  }, [])

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

      if (event.key === 'u' || event.key === 'U') {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        event.preventDefault()
        toggleFocusMode('unmatched')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleFocusMode])

  return (
    <FocusModeContext.Provider value={{ focusMode, setFocusMode, toggleFocusMode }}>
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

export type { FocusMode, FocusModeContextValue }
