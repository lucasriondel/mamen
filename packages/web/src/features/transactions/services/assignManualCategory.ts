import { db } from '@/lib/db'

type AssignManualCategoryResult = {
  previousCategoryId: number | undefined
  previousSubcategoryId: number | undefined
  previousMerchantId: number | undefined
  previousManualCategory: boolean | undefined
}

export const assignManualCategory = async (
  transactionId: number,
  categoryId: number,
  subcategoryId?: number,
): Promise<AssignManualCategoryResult> => {
  const transaction = await db.transactions.get(transactionId)
  if (!transaction) {
    throw new Error(`Transaction not found: ${transactionId}`)
  }

  const previous: AssignManualCategoryResult = {
    previousCategoryId: transaction.categoryId,
    previousSubcategoryId: transaction.subcategoryId,
    previousMerchantId: transaction.merchantId,
    previousManualCategory: transaction.manualCategory,
  }

  await db.transactions.update(transactionId, {
    categoryId,
    subcategoryId: subcategoryId ?? undefined,
    manualCategory: true,
    merchantId: undefined,
  })

  return previous
}

export const undoManualCategoryAssignment = async (
  transactionId: number,
  previousState: AssignManualCategoryResult,
): Promise<void> => {
  await db.transactions.update(transactionId, {
    categoryId: previousState.previousCategoryId,
    subcategoryId: previousState.previousSubcategoryId,
    merchantId: previousState.previousMerchantId,
    manualCategory: previousState.previousManualCategory,
  })
}
