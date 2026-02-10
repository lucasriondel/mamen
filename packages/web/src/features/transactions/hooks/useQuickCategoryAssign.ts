import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useCategories } from '@/hooks/useCategories'
import {
  assignManualCategory,
  undoManualCategoryAssignment,
} from '../services/assignManualCategory'

type UseQuickCategoryAssignReturn = {
  assignCategory: (
    transactionId: number,
    categoryId: number,
    subcategoryId?: number,
  ) => Promise<void>
  isAssigning: boolean
  error: Error | null
}

export const useQuickCategoryAssign = (): UseQuickCategoryAssignReturn => {
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { getCategoryById } = useCategories()

  const assignCategory = useCallback(
    async (
      transactionId: number,
      categoryId: number,
      subcategoryId?: number,
    ): Promise<void> => {
      setIsAssigning(true)
      setError(null)

      try {
        const previousState = await assignManualCategory(
          transactionId,
          categoryId,
          subcategoryId,
        )

        const category = getCategoryById(categoryId)
        const subcategory = subcategoryId
          ? getCategoryById(subcategoryId)
          : undefined

        const displayName = subcategory
          ? `${category?.name} > ${subcategory.name}`
          : category?.name ?? 'Unknown'

        toast(`Categorized as ${displayName}`, {
          action: {
            label: 'Undo',
            onClick: () => {
              undoManualCategoryAssignment(transactionId, previousState)
              toast('Category assignment undone')
            },
          },
          duration: 10000,
        })
      } catch (err) {
        const assignError =
          err instanceof Error ? err : new Error('Failed to assign category')
        setError(assignError)
        toast.error('Failed to assign category', {
          description: assignError.message,
        })
      } finally {
        setIsAssigning(false)
      }
    },
    [getCategoryById],
  )

  return {
    assignCategory,
    isAssigning,
    error,
  }
}
