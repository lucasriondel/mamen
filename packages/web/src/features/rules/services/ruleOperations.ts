import { db } from '@/lib/db'
import type { Rule } from '@/types'
import { applyRulesToTransactions, applyMatchResults } from './rulesEngine'

export const updateRuleWithReeval = async (
  ruleId: number,
  updates: Partial<Pick<Rule, 'pattern' | 'categoryOverride'>>,
): Promise<{
  updatedTransactionCount: number
  previousTransactionCount: number
  previousRule: Rule
}> => {
  const rule = await db.rules.get(ruleId)
  if (!rule) throw new Error('Rule not found')

  const previousRule = { ...rule }

  const oldRegex = new RegExp(rule.pattern, 'i')
  const oldMatches = await db.transactions
    .filter((tx) => oldRegex.test(tx.rawMerchantString) && tx.merchantId === rule.merchantId)
    .primaryKeys()

  await db.transaction('rw', [db.transactions, db.rules], async () => {
    for (const txId of oldMatches) {
      await db.transactions.update(txId, {
        merchantId: undefined,
        categoryId: undefined,
      })
    }

    await db.rules.update(ruleId, {
      ...updates,
      matchCount: 0,
    })
  })

  const updatedRule = await db.rules.get(ruleId)
  if (!updatedRule) throw new Error('Rule disappeared after update')

  const newRegex = new RegExp(updatedRule.pattern, 'i')
  const allUnmatched = await db.transactions
    .filter((tx) => !tx.merchantId && newRegex.test(tx.rawMerchantString))
    .primaryKeys()

  const toReeval = [...new Set([...oldMatches, ...allUnmatched])]

  if (toReeval.length > 0) {
    const result = await applyRulesToTransactions(toReeval)
    await applyMatchResults(result.matched)
  }

  const finalRule = await db.rules.get(ruleId)
  const updatedTransactionCount = finalRule?.matchCount ?? 0

  return {
    updatedTransactionCount,
    previousTransactionCount: oldMatches.length,
    previousRule,
  }
}

export const deleteRuleWithCleanup = async (
  ruleId: number,
): Promise<{
  affectedTransactionCount: number
  deletedRule: Rule
}> => {
  const rule = await db.rules.get(ruleId)
  if (!rule) throw new Error('Rule not found')

  const deletedRule = { ...rule }

  const regex = new RegExp(rule.pattern, 'i')
  const matchedTxIds = await db.transactions
    .filter((tx) => regex.test(tx.rawMerchantString) && tx.merchantId === rule.merchantId)
    .primaryKeys()

  await db.transaction('rw', [db.transactions, db.rules], async () => {
    for (const txId of matchedTxIds) {
      await db.transactions.update(txId, {
        merchantId: undefined,
        categoryId: undefined,
      })
    }

    await db.rules.delete(ruleId)
  })

  return {
    affectedTransactionCount: matchedTxIds.length,
    deletedRule,
  }
}

export const restoreDeletedRule = async (
  deletedRule: Rule,
): Promise<void> => {
  const newRuleId = await db.rules.add({
    merchantId: deletedRule.merchantId,
    pattern: deletedRule.pattern,
    categoryOverride: deletedRule.categoryOverride,
    matchCount: 0,
    createdAt: deletedRule.createdAt,
  })

  const regex = new RegExp(deletedRule.pattern, 'i')
  const unmatched = await db.transactions
    .filter((tx) => !tx.merchantId && regex.test(tx.rawMerchantString))
    .primaryKeys()

  if (unmatched.length > 0) {
    const result = await applyRulesToTransactions(unmatched)
    await applyMatchResults(result.matched)
  }

  // Update match count after re-application
  const finalMatches = await db.transactions
    .filter((tx) => regex.test(tx.rawMerchantString) && tx.merchantId === deletedRule.merchantId)
    .count()

  await db.rules.update(newRuleId, { matchCount: finalMatches })
}

export const undoRuleUpdate = async (
  ruleId: number,
  previousRule: Rule,
): Promise<void> => {
  await updateRuleWithReeval(ruleId, {
    pattern: previousRule.pattern,
    categoryOverride: previousRule.categoryOverride,
  })
}
