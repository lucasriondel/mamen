import { db } from '@/lib/db'

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
    db.transactions.get(refundTransactionId),
    db.transactions.get(purchaseTransactionId),
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

  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.update(refundTransactionId, {
      isRefund: true,
      linkedRefundId: purchaseTransactionId,
    })
    await db.transactions.update(purchaseTransactionId, {
      linkedRefundId: refundTransactionId,
    })
  })

  return result
}

export const undoLinkRefund = async (
  refundTransactionId: number,
  purchaseTransactionId: number,
): Promise<void> => {
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.update(refundTransactionId, {
      isRefund: false,
      linkedRefundId: undefined,
    })
    await db.transactions.update(purchaseTransactionId, {
      linkedRefundId: undefined,
    })
  })
}

export const markAsOrphanRefund = async (
  transactionId: number,
): Promise<{ previousIsRefund?: boolean }> => {
  const tx = await db.transactions.get(transactionId)
  if (!tx) throw new Error(`Transaction not found: ${transactionId}`)

  const previous = { previousIsRefund: tx.isRefund }

  await db.transactions.update(transactionId, {
    isRefund: true,
  })

  return previous
}

export const undoOrphanRefund = async (
  transactionId: number,
): Promise<void> => {
  await db.transactions.update(transactionId, {
    isRefund: false,
  })
}
