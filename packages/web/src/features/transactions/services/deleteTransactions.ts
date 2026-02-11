import { transactionsApi } from '@/lib/api'
import type { Transaction } from '@/types'

export type DeleteTransactionsResult = {
  deletedCount: number
  previousStates: Transaction[]
}

export const deleteTransactions = async (
  ids: number[],
): Promise<DeleteTransactionsResult> => {
  if (ids.length === 0) {
    return { deletedCount: 0, previousStates: [] }
  }

  const transactions = await transactionsApi.bulkGet(ids)

  const previousStates: Transaction[] = []
  for (const tx of transactions) {
    if (tx && tx.id !== undefined) {
      previousStates.push({ ...tx })
    }
  }

  await transactionsApi.bulkDelete(ids)

  return {
    deletedCount: previousStates.length,
    previousStates,
  }
}

export const undoDeleteTransactions = async (
  previousStates: Transaction[],
): Promise<void> => {
  await transactionsApi.bulkPut(previousStates)
}
