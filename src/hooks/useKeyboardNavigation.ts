import { useState, useCallback, useEffect, type RefObject } from 'react'

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
  containerRef,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

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

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => {
            if (prev === null) return 0
            return Math.min(prev + 1, itemCount - 1)
          })
          break

        case 'k':
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => {
            if (prev === null) return 0
            return Math.max(prev - 1, 0)
          })
          break

        case 'Enter':
          if (focusedIndex !== null && onSelect) {
            event.preventDefault()
            onSelect(focusedIndex)
          }
          break

        case 'Escape':
          event.preventDefault()
          setFocusedIndex(null)
          onEscape?.()
          containerRef.current?.focus()
          break

        default:
          if (focusedIndex !== null && onAction) {
            onAction({ key: event.key, shiftKey: event.shiftKey, index: focusedIndex })
          }
          break
      }
    },
    [enabled, itemCount, focusedIndex, onSelect, onEscape, onAction, containerRef]
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
