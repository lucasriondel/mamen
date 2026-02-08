import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  linkRefund,
  undoLinkRefund,
  markAsOrphanRefund,
  undoOrphanRefund,
} from '../services/refundService'
import type { Transaction } from '@/types'

type UseRefundLinkReturn = {
  isOpen: boolean
  sourceTransaction: Transaction | null
  openRefundLink: (transaction: Transaction) => void
  closeRefundLink: () => void
  handleConfirmLink: (targetTransactionId: number) => Promise<void>
  handleConfirmOrphan: () => Promise<void>
  isLinking: boolean
}

export const useRefundLink = (): UseRefundLinkReturn => {
  const [isOpen, setIsOpen] = useState(false)
  const [sourceTransaction, setSourceTransaction] = useState<Transaction | null>(null)
  const [isLinking, setIsLinking] = useState(false)

  const openRefundLink = useCallback((transaction: Transaction) => {
    setSourceTransaction(transaction)
    setIsOpen(true)
  }, [])

  const closeRefundLink = useCallback(() => {
    setIsOpen(false)
    setSourceTransaction(null)
  }, [])

  const handleConfirmLink = useCallback(
    async (targetTransactionId: number) => {
      if (!sourceTransaction?.id) return

      setIsLinking(true)
      try {
        const refundId = sourceTransaction.id
        await linkRefund(refundId, targetTransactionId)

        closeRefundLink()

        toast('Refund linked to original purchase', {
          action: {
            label: 'Undo',
            onClick: () => {
              undoLinkRefund(refundId, targetTransactionId)
              toast('Refund link undone')
            },
          },
          duration: 10000,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to link refund'
        toast.error(message)
      } finally {
        setIsLinking(false)
      }
    },
    [sourceTransaction, closeRefundLink],
  )

  const handleConfirmOrphan = useCallback(async () => {
    if (!sourceTransaction?.id) return

    setIsLinking(true)
    try {
      const txId = sourceTransaction.id
      await markAsOrphanRefund(txId)

      closeRefundLink()

      toast('Marked as refund', {
        action: {
          label: 'Undo',
          onClick: () => {
            undoOrphanRefund(txId)
            toast('Refund marking undone')
          },
        },
        duration: 10000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark as refund'
      toast.error(message)
    } finally {
      setIsLinking(false)
    }
  }, [sourceTransaction, closeRefundLink])

  return {
    isOpen,
    sourceTransaction,
    openRefundLink,
    closeRefundLink,
    handleConfirmLink,
    handleConfirmOrphan,
    isLinking,
  }
}
