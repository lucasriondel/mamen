import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardNavigation } from './useKeyboardNavigation'

function createMockContainer(): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

function fireKey(container: HTMLElement, key: string): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  container.dispatchEvent(event)
}

describe('useKeyboardNavigation', () => {
  it('starts with no focused index', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    expect(result.current.focusedIndex).toBeNull()
    container.remove()
  })

  it('J key moves focus down', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(0)

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(1)

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(2)

    container.remove()
  })

  it('K key moves focus up', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    // Start at item 0
    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(2)

    act(() => fireKey(container, 'k'))
    expect(result.current.focusedIndex).toBe(1)

    act(() => fireKey(container, 'k'))
    expect(result.current.focusedIndex).toBe(0)

    container.remove()
  })

  it('ArrowDown works like J key', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'ArrowDown'))
    expect(result.current.focusedIndex).toBe(0)

    act(() => fireKey(container, 'ArrowDown'))
    expect(result.current.focusedIndex).toBe(1)

    container.remove()
  })

  it('ArrowUp works like K key', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(1)

    act(() => fireKey(container, 'ArrowUp'))
    expect(result.current.focusedIndex).toBe(0)

    container.remove()
  })

  it('does not go below 0 (boundary at first item)', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(0)

    act(() => fireKey(container, 'k'))
    expect(result.current.focusedIndex).toBe(0)

    act(() => fireKey(container, 'k'))
    expect(result.current.focusedIndex).toBe(0)

    container.remove()
  })

  it('does not go above itemCount - 1 (boundary at last item)', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 3,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(2)

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(2)

    container.remove()
  })

  it('Enter selects focused item', () => {
    const container = createMockContainer()
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        onSelect,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(1)

    act(() => fireKey(container, 'Enter'))
    expect(onSelect).toHaveBeenCalledWith(1)

    container.remove()
  })

  it('Enter does nothing when no item is focused', () => {
    const container = createMockContainer()
    const onSelect = vi.fn()
    renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        onSelect,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'Enter'))
    expect(onSelect).not.toHaveBeenCalled()

    container.remove()
  })

  it('Esc clears focus and calls onEscape', () => {
    const container = createMockContainer()
    const onEscape = vi.fn()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        onEscape,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(1)

    act(() => fireKey(container, 'Escape'))
    expect(result.current.focusedIndex).toBeNull()
    expect(onEscape).toHaveBeenCalledTimes(1)

    container.remove()
  })

  it('ignores keys when target is an input field', () => {
    const container = createMockContainer()
    const input = document.createElement('input')
    container.appendChild(input)

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    const event = new KeyboardEvent('keydown', {
      key: 'j',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)

    expect(result.current.focusedIndex).toBeNull()

    container.remove()
  })

  it('ignores keys when target is a textarea', () => {
    const container = createMockContainer()
    const textarea = document.createElement('textarea')
    container.appendChild(textarea)

    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    const event = new KeyboardEvent('keydown', {
      key: 'j',
      bubbles: true,
      cancelable: true,
    })
    textarea.dispatchEvent(event)

    expect(result.current.focusedIndex).toBeNull()

    container.remove()
  })

  it('ignores keys when disabled', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
        enabled: false,
      })
    )

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBeNull()

    container.remove()
  })

  it('clearFocus resets focusedIndex to null', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'j'))
    expect(result.current.focusedIndex).toBe(0)

    act(() => result.current.clearFocus())
    expect(result.current.focusedIndex).toBeNull()

    container.remove()
  })

  it('setFocusedIndex allows manual focus control', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => result.current.setFocusedIndex(3))
    expect(result.current.focusedIndex).toBe(3)

    container.remove()
  })

  it('K from null starts at index 0', () => {
    const container = createMockContainer()
    const { result } = renderHook(() =>
      useKeyboardNavigation({
        itemCount: 5,
        containerRef: { current: container },
      })
    )

    act(() => fireKey(container, 'k'))
    expect(result.current.focusedIndex).toBe(0)

    container.remove()
  })
})
