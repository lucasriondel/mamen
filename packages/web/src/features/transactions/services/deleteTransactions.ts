import { db } from '@/lib/db'
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

  return db.transaction('rw', db.transactions, async () => {
    const transactions = await db.transactions.bulkGet(ids)

    const previousStates: Transaction[] = []
    for (const tx of transactions) {
      if (tx && tx.id !== undefined) {
        previousStates.push({ ...tx })
      }
    }

    await db.transactions.bulkDelete(ids)

    return {
      deletedCount: previousStates.length,
      previousStates,
    }
  })
}

export const undoDeleteTransactions = async (
  previousStates: Transaction[],
): Promise<void> => {
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.bulkPut(previousStates)
  })
}
