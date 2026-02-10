import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { db } from '@/lib/db'

export const useNavigateToTransaction = () => {
  const navigate = useNavigate()

  const navigateToTransaction = async (transactionId: number): Promise<void> => {
    const transaction = await db.transactions.get(transactionId)
    if (!transaction) {
      toast.error('Linked transaction not found')
      return
    }

    navigate({
      to: '/transactions',
      search: { highlight: transactionId },
    })
  }

  return { navigateToTransaction }
}
