import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  dismissDuplicateAnomaly,
  undoDismissDuplicateAnomaly,
  confirmDuplicate,
  undoConfirmDuplicate,
} from '../services/anomalyDetector'
import { db } from '@/lib/db'

export const useDuplicateActions = () => {
  const handleDismissDuplicate = useCallback(
    (transactionId: number) => {
      db.transactions.get(transactionId).then(tx => {
        const dupFlag = tx?.anomalyFlags?.find(
          f => f.type === 'potential-duplicate' && !f.dismissed,
        )
        const linkedId = dupFlag?.linkedTransactionId

        dismissDuplicateAnomaly(transactionId).then(() => {
          toast.info('Duplicate flag dismissed for both transactions', {
            action: {
              label: 'Undo',
              onClick: () => {
                if (linkedId) {
                  undoDismissDuplicateAnomaly(transactionId, linkedId)
                }
              },
            },
            duration: 5000,
          })
        })
      })
    },
    [],
  )

  const handleExcludeDuplicate = useCallback(
    (transactionId: number) => {
      db.transactions.get(transactionId).then(tx => {
        const dupFlag = tx?.anomalyFlags?.find(
          f => f.type === 'potential-duplicate' && !f.dismissed,
        )
        const linkedId = dupFlag?.linkedTransactionId

        confirmDuplicate(transactionId, 'exclude').then(() => {
          toast.info('Transaction excluded as duplicate', {
            action: {
              label: 'Undo',
              onClick: () => {
                undoConfirmDuplicate(transactionId, linkedId)
              },
            },
            duration: 5000,
          })
        })
      })
    },
    [],
  )

  return { handleDismissDuplicate, handleExcludeDuplicate }
}
