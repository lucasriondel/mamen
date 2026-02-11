import { transactionsApi } from '@/lib/api'

type LinkRefundResult = {
  refundPrevious: { isRefund?: boolean; linkedRefundId?: number }
  purchasePrevious: { linkedRefundId?: number }
}

export const linkRefund = async (
  refundTransactionId: number,
  purchaseTransactionId: number,
): Promise<LinkRefundResult> => {
  if (refundTransactionId === purchaseTransactionId) {
    throw new Error('Cannot link a transaction to itself')
  }

  const [refundTx, purchaseTx] = await Promise.all([
    transactionsApi.get(refundTransactionId),
    transactionsApi.get(purchaseTransactionId),
  ])

  if (!refundTx) throw new Error(`Transaction not found: ${refundTransactionId}`)
  if (!purchaseTx) throw new Error(`Transaction not found: ${purchaseTransactionId}`)

  if (purchaseTx.linkedRefundId) {
    throw new Error('This purchase already has a linked refund')
  }

  const result: LinkRefundResult = {
    refundPrevious: {
      isRefund: refundTx.isRefund,
      linkedRefundId: refundTx.linkedRefundId,
    },
    purchasePrevious: {
      linkedRefundId: purchaseTx.linkedRefundId,
    },
  }

  await transactionsApi.update(refundTransactionId, {
    isRefund: true,
    linkedRefundId: purchaseTransactionId,
    ...(purchaseTx.categoryId && !refundTx.categoryId
      ? { categoryId: purchaseTx.categoryId }
      : {}),
  })
  await transactionsApi.update(purchaseTransactionId, {
    linkedRefundId: refundTransactionId,
  })

  return result
}

export const undoLinkRefund = async (
  refundTransactionId: number,
  purchaseTransactionId: number,
): Promise<void> => {
  await transactionsApi.update(refundTransactionId, {
    isRefund: false,
    linkedRefundId: undefined,
  })
  await transactionsApi.update(purchaseTransactionId, {
    linkedRefundId: undefined,
  })
}

export const markAsOrphanRefund = async (
  transactionId: number,
): Promise<{ previousIsRefund?: boolean }> => {
  const tx = await transactionsApi.get(transactionId)
  if (!tx) throw new Error(`Transaction not found: ${transactionId}`)

  const previous = { previousIsRefund: tx.isRefund }

  await transactionsApi.update(transactionId, {
    isRefund: true,
  })

  return previous
}

export const undoOrphanRefund = async (
  transactionId: number,
): Promise<void> => {
  await transactionsApi.update(transactionId, {
    isRefund: false,
  })
}

export const unlinkRefund = async (
  refundTransactionId: number,
  purchaseTransactionId: number,
): Promise<void> => {
  await transactionsApi.update(refundTransactionId, {
    isRefund: false,
    linkedRefundId: undefined,
  })
  await transactionsApi.update(purchaseTransactionId, {
    linkedRefundId: undefined,
  })
}

export const undoUnlinkRefund = async (
  refundTransactionId: number,
  purchaseTransactionId: number,
): Promise<void> => {
  await transactionsApi.update(refundTransactionId, {
    isRefund: true,
    linkedRefundId: purchaseTransactionId,
  })
  await transactionsApi.update(purchaseTransactionId, {
    linkedRefundId: refundTransactionId,
  })
}

export const replaceLinkRefund = async (
  refundTransactionId: number,
  oldPurchaseTransactionId: number,
  newPurchaseTransactionId: number,
): Promise<void> => {
  const [refundTx, newPurchaseTx] = await Promise.all([
    transactionsApi.get(refundTransactionId),
    transactionsApi.get(newPurchaseTransactionId),
  ])

  await transactionsApi.update(oldPurchaseTransactionId, {
    linkedRefundId: undefined,
  })
  await transactionsApi.update(refundTransactionId, {
    isRefund: true,
    linkedRefundId: newPurchaseTransactionId,
    ...(newPurchaseTx?.categoryId && !refundTx?.categoryId
      ? { categoryId: newPurchaseTx.categoryId }
      : {}),
  })
  await transactionsApi.update(newPurchaseTransactionId, {
    linkedRefundId: refundTransactionId,
  })
}

export const undoReplaceLinkRefund = async (
  refundTransactionId: number,
  oldPurchaseTransactionId: number,
  newPurchaseTransactionId: number,
): Promise<void> => {
  await transactionsApi.update(newPurchaseTransactionId, {
    linkedRefundId: undefined,
  })
  await transactionsApi.update(refundTransactionId, {
    linkedRefundId: oldPurchaseTransactionId,
  })
  await transactionsApi.update(oldPurchaseTransactionId, {
    linkedRefundId: refundTransactionId,
  })
}
