import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { invalidateEntity } from '@/lib/api'
import {
  deleteTransactions,
  undoDeleteTransactions,
} from '../services/deleteTransactions'

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
