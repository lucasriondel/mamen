import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { invalidateEntity, queryClient, queryKeys } from '@/lib/api'
import { useCategories } from '@/hooks/useCategories'
import {
  assignManualCategory,
  undoManualCategoryAssignment,
} from '../services/assignManualCategory'
import type { Transaction } from '@/types'

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

      // Snapshot all transaction caches for rollback
      const previousCaches: [readonly unknown[], Transaction[] | undefined][] = []
      queryClient.getQueriesData<Transaction[]>({ queryKey: queryKeys.transactions.all }).forEach(
        ([key, data]) => {
          previousCaches.push([key, data])
        },
      )

      // Optimistically update all transaction caches
      queryClient.setQueriesData<Transaction[]>(
        { queryKey: queryKeys.transactions.all },
        (old) =>
          old?.map((tx) =>
            tx.id === transactionId
              ? { ...tx, categoryId, subcategoryId, manualCategory: true, merchantId: undefined }
              : tx,
          ),
      )

      try {
        const previousState = await assignManualCategory(
          transactionId,
          categoryId,
          subcategoryId,
        )
        invalidateEntity('transactions')

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
              undoManualCategoryAssignment(transactionId, previousState).then(() => {
                invalidateEntity('transactions')
              })
              toast('Category assignment undone')
            },
          },
          duration: 10000,
        })
      } catch (err) {
        // Roll back optimistic update
        for (const [key, data] of previousCaches) {
          queryClient.setQueryData(key, data)
        }
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
