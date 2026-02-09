import { useCallback } from 'react'
import { toast } from 'sonner'
import { dismissAnomaly, undoDismissAnomaly } from '../services/anomalyDetector'
import type { AnomalyType } from '@/types'

export const useAnomalyDismiss = () => {
  const handleDismiss = useCallback(
    (transactionId: number, anomalyType: AnomalyType) => {
      dismissAnomaly(transactionId, anomalyType).then(() => {
        toast.info('Anomaly dismissed', {
          action: {
            label: 'Undo',
            onClick: () => {
              undoDismissAnomaly(transactionId, anomalyType)
            },
          },
          duration: 5000,
        })
      })
    },
    [],
  )

  return { handleDismiss }
}
