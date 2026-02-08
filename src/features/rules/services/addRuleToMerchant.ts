import { db } from '@/lib/db'
import { applyRuleToTransactions } from './applyRule'

type AddRuleToMerchantParams = {
  merchantId: number
  pattern: string
  categoryOverrideId: number | null
}

type AddRuleToMerchantResult = {
  ruleId: number
  matchCount: number
  affectedTransactionIds: number[]
}

export const addRuleToMerchant = async (
  params: AddRuleToMerchantParams,
): Promise<AddRuleToMerchantResult> => {
  const { merchantId, pattern, categoryOverrideId } = params

  const merchant = await db.merchants.get(merchantId)
  if (!merchant) {
    throw new Error(`Merchant not found: ${merchantId}`)
  }

  const categoryId = categoryOverrideId ?? merchant.defaultCategoryId
  if (categoryId === undefined) {
    throw new Error('No category specified and merchant has no default category')
  }

  const ruleId = (await db.rules.add({
    merchantId,
    pattern,
    categoryOverride: categoryOverrideId ?? undefined,
    matchCount: 0,
    createdAt: new Date(),
  })) as number

  const rule = {
    id: ruleId,
    merchantId,
    pattern,
    categoryOverride: categoryOverrideId ?? undefined,
    matchCount: 0,
    createdAt: new Date(),
  }

  const { count, affectedIds } = await applyRuleToTransactions(rule, categoryId)

  return {
    ruleId,
    matchCount: count,
    affectedTransactionIds: affectedIds,
  }
}

export const undoAddRule = async (
  ruleId: number,
  affectedTransactionIds: number[],
): Promise<void> => {
  await db.transaction('rw', [db.rules, db.transactions], async () => {
    await db.rules.delete(ruleId)

    for (const txId of affectedTransactionIds) {
      await db.transactions.update(txId, {
        merchantId: undefined,
        categoryId: undefined,
      })
    }
  })
}
