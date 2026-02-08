import { useState, useCallback, useMemo } from 'react'

type UseMultiSelectReturn = {
  selectedIds: Set<string>
  selectionAnchorId: string | null
  isSelecting: boolean
  selectionCount: number
  toggleSelection: (id: string) => void
  extendSelection: (id: string) => void
  clearSelection: () => void
  isSelected: (id: string) => boolean
  selectRange: (fromId: string, toId: string, orderedIds: string[]) => void
}

export const useMultiSelect = (): UseMultiSelectReturn => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)

  const isSelecting = selectedIds.size > 0
  const selectionCount = selectedIds.size

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      if (next.size === 0) {
        setSelectionAnchorId(null)
      }
      return next
    })
  }, [])

  const extendSelection = useCallback((id: string) => {
    setSelectionAnchorId((prev) => {
      if (prev === null) return id
      return prev
    })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionAnchorId(null)
  }, [])

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  )

  const selectRange = useCallback(
    (fromId: string, toId: string, orderedIds: string[]) => {
      const fromIndex = orderedIds.indexOf(fromId)
      const toIndex = orderedIds.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return

      const start = Math.min(fromIndex, toIndex)
      const end = Math.max(fromIndex, toIndex)

      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(orderedIds[i])
        }
        return next
      })
    },
    [],
  )

  const stableSelectedIds = useMemo(() => selectedIds, [selectedIds])

  return {
    selectedIds: stableSelectedIds,
    selectionAnchorId,
    isSelecting,
    selectionCount,
    toggleSelection,
    extendSelection,
    clearSelection,
    isSelected,
    selectRange,
  }
}
