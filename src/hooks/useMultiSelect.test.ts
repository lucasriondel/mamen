import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiSelect } from './useMultiSelect'

describe('useMultiSelect', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useMultiSelect())

    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectionAnchorId).toBeNull()
    expect(result.current.isSelecting).toBe(false)
    expect(result.current.selectionCount).toBe(0)
  })

  it('toggleSelection adds an item', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))

    expect(result.current.selectedIds.has('a')).toBe(true)
    expect(result.current.selectionCount).toBe(1)
    expect(result.current.isSelecting).toBe(true)
  })

  it('toggleSelection removes an already-selected item', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))
    act(() => result.current.toggleSelection('a'))

    expect(result.current.selectedIds.has('a')).toBe(false)
    expect(result.current.selectionCount).toBe(0)
    expect(result.current.isSelecting).toBe(false)
  })

  it('toggleSelection supports non-contiguous selection', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))
    act(() => result.current.toggleSelection('c'))

    expect(result.current.selectedIds.has('a')).toBe(true)
    expect(result.current.selectedIds.has('c')).toBe(true)
    expect(result.current.selectionCount).toBe(2)
  })

  it('isSelected returns correct boolean', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))

    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.isSelected('b')).toBe(false)
  })

  it('clearSelection removes all selected items', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))
    act(() => result.current.toggleSelection('b'))
    act(() => result.current.clearSelection())

    expect(result.current.selectionCount).toBe(0)
    expect(result.current.isSelecting).toBe(false)
    expect(result.current.selectionAnchorId).toBeNull()
  })

  it('extendSelection sets anchor and adds item', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.extendSelection('b'))

    expect(result.current.selectedIds.has('b')).toBe(true)
    expect(result.current.selectionAnchorId).toBe('b')
    expect(result.current.selectionCount).toBe(1)
  })

  it('extendSelection keeps anchor and adds new item', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.extendSelection('a'))
    act(() => result.current.extendSelection('b'))

    expect(result.current.selectionAnchorId).toBe('a')
    expect(result.current.selectedIds.has('a')).toBe(true)
    expect(result.current.selectedIds.has('b')).toBe(true)
    expect(result.current.selectionCount).toBe(2)
  })

  it('selectRange selects all items between fromId and toId', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e']
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.selectRange('b', 'd', ordered))

    expect(result.current.selectedIds.has('b')).toBe(true)
    expect(result.current.selectedIds.has('c')).toBe(true)
    expect(result.current.selectedIds.has('d')).toBe(true)
    expect(result.current.selectedIds.has('a')).toBe(false)
    expect(result.current.selectedIds.has('e')).toBe(false)
    expect(result.current.selectionCount).toBe(3)
  })

  it('selectRange works in reverse order', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e']
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.selectRange('d', 'b', ordered))

    expect(result.current.selectedIds.has('b')).toBe(true)
    expect(result.current.selectedIds.has('c')).toBe(true)
    expect(result.current.selectedIds.has('d')).toBe(true)
    expect(result.current.selectionCount).toBe(3)
  })

  it('selectRange with same fromId and toId selects one item', () => {
    const ordered = ['a', 'b', 'c']
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.selectRange('b', 'b', ordered))

    expect(result.current.selectedIds.has('b')).toBe(true)
    expect(result.current.selectionCount).toBe(1)
  })

  it('selectRange does nothing when ids are not found', () => {
    const ordered = ['a', 'b', 'c']
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.selectRange('x', 'y', ordered))

    expect(result.current.selectionCount).toBe(0)
  })

  it('toggling off the last selected item clears selection mode', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggleSelection('a'))
    expect(result.current.isSelecting).toBe(true)

    act(() => result.current.toggleSelection('a'))
    expect(result.current.isSelecting).toBe(false)
    expect(result.current.selectionAnchorId).toBeNull()
  })

  it('handles 1000+ items efficiently', () => {
    const { result } = renderHook(() => useMultiSelect())
    const ids = Array.from({ length: 1000 }, (_, i) => `item-${i}`)

    const start = performance.now()
    act(() => {
      result.current.selectRange(ids[0], ids[999], ids)
    })
    const elapsed = performance.now() - start

    expect(result.current.selectionCount).toBe(1000)
    expect(elapsed).toBeLessThan(50)

    // isSelected check should be O(1)
    const checkStart = performance.now()
    for (let i = 0; i < 1000; i++) {
      result.current.isSelected(`item-${i}`)
    }
    const checkElapsed = performance.now() - checkStart
    expect(checkElapsed).toBeLessThan(10)
  })

  it('extend selection multiple times keeps adding items', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.extendSelection('a'))
    act(() => result.current.extendSelection('b'))
    act(() => result.current.extendSelection('c'))
    act(() => result.current.extendSelection('d'))

    expect(result.current.selectionCount).toBe(4)
    expect(result.current.selectionAnchorId).toBe('a')
  })
})
