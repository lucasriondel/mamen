import { db } from '@/lib/db'
import type { Rule } from '@/types'

export const applyRuleToTransactions = async (
  rule: Rule,
  categoryId: number,
): Promise<{ count: number; affectedIds: number[] }> => {
  const regex = new RegExp(rule.pattern, 'i')

  const transactions = await db.transactions
    .filter((tx) => regex.test(tx.rawMerchantString))
    .toArray()

  const affectedIds: number[] = []

  await db.transaction('rw', db.transactions, async () => {
    for (const tx of transactions) {
      if (tx.id !== undefined) {
        await db.transactions.update(tx.id, {
          merchantId: rule.merchantId,
          categoryId,
        })
        affectedIds.push(tx.id)
      }
    }
  })

  if (rule.id !== undefined) {
    await db.rules.update(rule.id, { matchCount: transactions.length })
  }

  return { count: transactions.length, affectedIds }
}

export const undoRuleApplication = async (
  merchantId: number,
  ruleId: number,
  affectedTransactionIds: number[],
): Promise<void> => {
  await db.transaction('rw', [db.merchants, db.rules, db.transactions], async () => {
    await db.rules.delete(ruleId)

    const remainingRules = await db.rules.where('merchantId').equals(merchantId).count()
    if (remainingRules === 0) {
      await db.merchants.delete(merchantId)
    }

    for (const txId of affectedTransactionIds) {
      await db.transactions.update(txId, {
        merchantId: undefined,
        categoryId: undefined,
      })
    }
  })
}
