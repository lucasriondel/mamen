import { db } from '@/lib/db'

export type BatchCategoryAssignParams = {
  transactionIds: number[]
  categoryId: number
  subcategoryId?: number
}

export type PreviousTransactionState = {
  id: number
  categoryId: number | undefined
  subcategoryId: number | undefined
  merchantId: number | undefined
  manualCategory: boolean | undefined
}

export type BatchCategoryAssignResult = {
  affectedCount: number
  changedCount: number
  previousStates: PreviousTransactionState[]
}

export const batchCategoryAssign = async (
  params: BatchCategoryAssignParams,
): Promise<BatchCategoryAssignResult> => {
  const { transactionIds, categoryId, subcategoryId } = params

  if (transactionIds.length === 0) {
    return { affectedCount: 0, changedCount: 0, previousStates: [] }
  }

  return db.transaction('rw', db.transactions, async () => {
    const transactions = await db.transactions.bulkGet(transactionIds)

    const previousStates: PreviousTransactionState[] = []
    let changedCount = 0

    for (const tx of transactions) {
      if (!tx || tx.id === undefined) continue

      previousStates.push({
        id: tx.id,
        categoryId: tx.categoryId,
        subcategoryId: tx.subcategoryId,
        merchantId: tx.merchantId,
        manualCategory: tx.manualCategory,
      })

      const categoryChanged =
        tx.categoryId !== categoryId ||
        tx.subcategoryId !== (subcategoryId ?? undefined)

      if (categoryChanged || tx.merchantId !== undefined || !tx.manualCategory) {
        changedCount++
      }

      await db.transactions.update(tx.id, {
        categoryId,
        subcategoryId: subcategoryId ?? undefined,
        manualCategory: true,
        merchantId: undefined,
      })
    }

    return {
      affectedCount: previousStates.length,
      changedCount,
      previousStates,
    }
  })
}

export const undoBatchCategoryAssign = async (
  previousStates: PreviousTransactionState[],
): Promise<void> => {
  await db.transaction('rw', db.transactions, async () => {
    for (const prev of previousStates) {
      await db.transactions.update(prev.id, {
        categoryId: prev.categoryId,
        subcategoryId: prev.subcategoryId,
        merchantId: prev.merchantId,
        manualCategory: prev.manualCategory,
      })
    }
  })
}
