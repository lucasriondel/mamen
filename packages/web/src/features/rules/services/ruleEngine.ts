import { transactionsApi } from '@/lib/api'
import { escapeRegex, extractPrefix } from '@/lib/utils/patternUtils'

export type PatternSuggestion = {
  pattern: string
  label: string
  matchCount: number
  type: 'exact' | 'prefix' | 'custom'
}

export const countMatches = async (pattern: string): Promise<number> => {
  try {
    const regex = new RegExp(pattern, 'i')
    const allTransactions = await transactionsApi.getAll()
    return allTransactions.filter((tx) => regex.test(tx.rawMerchantString)).length
  } catch {
    return 0
  }
}

export const getMatchingTransactions = async (pattern: string) => {
  try {
    const regex = new RegExp(pattern, 'i')
    const allTransactions = await transactionsApi.getAll()
    return allTransactions.filter((tx) => regex.test(tx.rawMerchantString))
  } catch {
    return []
  }
}

export const generatePatternSuggestions = async (
  rawMerchantString: string,
): Promise<PatternSuggestion[]> => {
  const suggestions: PatternSuggestion[] = []

  // 1. Exact match (escaped)
  const exactPattern = `^${escapeRegex(rawMerchantString)}$`
  suggestions.push({
    pattern: exactPattern,
    label: `Exact: "${rawMerchantString}"`,
    matchCount: await countMatches(exactPattern),
    type: 'exact',
  })

  // 2. Prefix match
  const prefix = extractPrefix(rawMerchantString)
  if (prefix && prefix.length >= 3) {
    const prefixPattern = `^${escapeRegex(prefix)}.*`
    const prefixCount = await countMatches(prefixPattern)
    if (prefixCount > 1) {
      suggestions.push({
        pattern: prefixPattern,
        label: `Prefix: "${prefix}*"`,
        matchCount: prefixCount,
        type: 'prefix',
      })
    }
  }

  return suggestions
}
