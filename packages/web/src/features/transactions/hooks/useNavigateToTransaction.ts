import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { transactionsApi } from '@/lib/api'

export const useNavigateToTransaction = () => {
  const navigate = useNavigate()

  const navigateToTransaction = async (transactionId: number): Promise<void> => {
    try {
      await transactionsApi.get(transactionId)
      navigate({
        to: '/transactions',
        search: { highlight: transactionId },
      })
    } catch {
      toast.error('Linked transaction not found')
    }
  }

  return { navigateToTransaction }
}
