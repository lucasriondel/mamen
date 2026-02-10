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

export const CommandPaletteProvider = ({ children }: CommandPaletteProviderProps): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const open = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    requestAnimationFrame(() => {
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus()
      }
    })
  }, [])

  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey

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
