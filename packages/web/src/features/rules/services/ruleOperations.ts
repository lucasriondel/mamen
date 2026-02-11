import { rulesApi, transactionsApi } from '@/lib/api'
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
  const rule = await rulesApi.get(ruleId)
  if (!rule) throw new Error('Rule not found')

  const previousRule = { ...rule }

  const oldRegex = new RegExp(rule.pattern, 'i')
  const allTransactions = await transactionsApi.getAll()
  const oldMatches = allTransactions
    .filter((tx) => oldRegex.test(tx.rawMerchantString) && tx.merchantId === rule.merchantId)
    .map((tx) => tx.id!)

  // Clear old matches
  for (const txId of oldMatches) {
    await transactionsApi.update(txId, {
      merchantId: undefined,
      categoryId: undefined,
    })
  }

  // Update the rule
  await rulesApi.update(ruleId, {
    ...updates,
    matchCount: 0,
  })

  const updatedRule = await rulesApi.get(ruleId)
  if (!updatedRule) throw new Error('Rule disappeared after update')

  const newRegex = new RegExp(updatedRule.pattern, 'i')
  const currentTransactions = await transactionsApi.getAll()
  const allUnmatched = currentTransactions
    .filter((tx) => !tx.merchantId && newRegex.test(tx.rawMerchantString))
    .map((tx) => tx.id!)

  const toReeval = [...new Set([...oldMatches, ...allUnmatched])]

  if (toReeval.length > 0) {
    const result = await applyRulesToTransactions(toReeval)
    await applyMatchResults(result.matched)
  }

  const finalRule = await rulesApi.get(ruleId)
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
  const rule = await rulesApi.get(ruleId)
  if (!rule) throw new Error('Rule not found')

  const deletedRule = { ...rule }

  const regex = new RegExp(rule.pattern, 'i')
  const allTransactions = await transactionsApi.getAll()
  const matchedTxIds = allTransactions
    .filter((tx) => regex.test(tx.rawMerchantString) && tx.merchantId === rule.merchantId)
    .map((tx) => tx.id!)

  for (const txId of matchedTxIds) {
    await transactionsApi.update(txId, {
      merchantId: undefined,
      categoryId: undefined,
    })
  }

  await rulesApi.delete(ruleId)

  return {
    affectedTransactionCount: matchedTxIds.length,
    deletedRule,
  }
}

export const restoreDeletedRule = async (
  deletedRule: Rule,
): Promise<void> => {
  const newRuleId = await rulesApi.create({
    merchantId: deletedRule.merchantId,
    pattern: deletedRule.pattern,
    categoryOverride: deletedRule.categoryOverride,
    matchCount: 0,
    createdAt: deletedRule.createdAt,
  })

  const regex = new RegExp(deletedRule.pattern, 'i')
  const allTransactions = await transactionsApi.getAll()
  const unmatched = allTransactions
    .filter((tx) => !tx.merchantId && regex.test(tx.rawMerchantString))
    .map((tx) => tx.id!)

  if (unmatched.length > 0) {
    const result = await applyRulesToTransactions(unmatched)
    await applyMatchResults(result.matched)
  }

  // Update match count after re-application
  const finalTransactions = await transactionsApi.getAll()
  const finalMatches = finalTransactions
    .filter((tx) => regex.test(tx.rawMerchantString) && tx.merchantId === deletedRule.merchantId)
    .length

  await rulesApi.update(newRuleId, { matchCount: finalMatches })
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
