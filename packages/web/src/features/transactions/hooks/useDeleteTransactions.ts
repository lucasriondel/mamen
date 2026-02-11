import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { invalidateEntity, queryClient, queryKeys } from '@/lib/api'
import {
  deleteTransactions,
  undoDeleteTransactions,
} from '../services/deleteTransactions'
import type { Transaction } from '@/types'

type UseDeleteTransactionsReturn = {
  requestDelete: (ids: number[]) => void
  confirmDelete: () => Promise<void>
  cancelDelete: () => void
  isDeleteDialogOpen: boolean
  pendingDeleteIds: number[]
  isDeleting: boolean
}

export const useDeleteTransactions = (): UseDeleteTransactionsReturn => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])

  const requestDelete = useCallback((ids: number[]) => {
    if (ids.length === 0) return
    setPendingDeleteIds(ids)
    setIsDeleteDialogOpen(true)
  }, [])

  const cancelDelete = useCallback(() => {
    setIsDeleteDialogOpen(false)
    setPendingDeleteIds([])
  }, [])

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (pendingDeleteIds.length === 0) return

    setIsDeleting(true)

    const idsToDelete = new Set(pendingDeleteIds)

    // Snapshot all transaction caches for rollback
    const previousCaches: [readonly unknown[], Transaction[] | undefined][] = []
    queryClient.getQueriesData<Transaction[]>({ queryKey: queryKeys.transactions.all }).forEach(
      ([key, data]) => {
        previousCaches.push([key, data])
      },
    )

    // Optimistically remove transactions from all caches
    queryClient.setQueriesData<Transaction[]>(
      { queryKey: queryKeys.transactions.all },
      (old) => old?.filter((tx) => !idsToDelete.has(tx.id!)),
    )

    try {
      const result = await deleteTransactions(pendingDeleteIds)
      invalidateEntity('transactions', 'accounts')

      setIsDeleteDialogOpen(false)
      setPendingDeleteIds([])

      toast(
        `${result.deletedCount} transaction${result.deletedCount === 1 ? '' : 's'} deleted`,
        {
          action: {
            label: 'Undo',
            onClick: () => {
              undoDeleteTransactions(result.previousStates).then(() => {
                invalidateEntity('transactions', 'accounts')
              })
              toast('Delete undone')
            },
          },
          duration: 10000,
        },
      )
    } catch (err) {
      // Roll back optimistic update
      for (const [key, data] of previousCaches) {
        queryClient.setQueryData(key, data)
      }
      const message =
        err instanceof Error ? err.message : 'Failed to delete transactions'
      toast.error('Failed to delete transactions', { description: message })
    } finally {
      setIsDeleting(false)
    }
  }, [pendingDeleteIds])

  return {
    requestDelete,
    confirmDelete,
    cancelDelete,
    isDeleteDialogOpen,
    pendingDeleteIds,
    isDeleting,
  }
}
