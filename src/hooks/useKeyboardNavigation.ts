import { useState, useCallback, useEffect, useRef, type RefObject } from 'react'

type KeyAction = {
  key: string
  shiftKey: boolean
  index: number
}

type UseKeyboardNavigationOptions = {
  itemCount: number
  onSelect?: (index: number) => void
  onEscape?: () => void
  onAction?: (action: KeyAction) => void
  onShiftNavigate?: (index: number) => void
  onNavigate?: (index: number) => void
  onToggleSelect?: (index: number) => void
  containerRef: RefObject<HTMLElement | null>
  enabled?: boolean
}

type UseKeyboardNavigationReturn = {
  focusedIndex: number | null
  setFocusedIndex: (index: number | null) => void
  clearFocus: () => void
}

export const useKeyboardNavigation = ({
  itemCount,
  onSelect,
  onEscape,
  onAction,
  onShiftNavigate,
  onNavigate,
  onToggleSelect,
  containerRef,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const focusedIndexRef = useRef(focusedIndex)
  focusedIndexRef.current = focusedIndex

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const prev = focusedIndexRef.current

      switch (key) {
        case 'j':
        case 'arrowdown': {
          event.preventDefault()
          const newIndex = prev === null ? 0 : Math.min(prev + 1, itemCount - 1)
          setFocusedIndex(newIndex)
          if (event.shiftKey) {
            onShiftNavigate?.(newIndex)
          } else {
            onNavigate?.(newIndex)
          }
          break
        }

        case 'k':
        case 'arrowup': {
          event.preventDefault()
          const newIndex = prev === null ? 0 : Math.max(prev - 1, 0)
          setFocusedIndex(newIndex)
          if (event.shiftKey) {
            onShiftNavigate?.(newIndex)
          } else {
            onNavigate?.(newIndex)
          }
          break
        }

        case 'enter':
          if (prev !== null && onSelect) {
            event.preventDefault()
            onSelect(prev)
          }
          break

        case ' ':
        case 'x':
          if (prev !== null) {
            event.preventDefault()
            onToggleSelect?.(prev)
          }
          break

        case 'escape':
          event.preventDefault()
          setFocusedIndex(null)
          onEscape?.()
          containerRef.current?.focus()
          break

        default:
          if (prev !== null && onAction) {
            onAction({ key: event.key, shiftKey: event.shiftKey, index: prev })
          }
          break
      }
    },
    [enabled, itemCount, onSelect, onEscape, onAction, onShiftNavigate, onNavigate, onToggleSelect, containerRef]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, containerRef])

  const clearFocus = useCallback(() => {
    setFocusedIndex(null)
  }, [])

  return {
    focusedIndex,
    setFocusedIndex,
    clearFocus,
  }
}
