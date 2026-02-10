import { db } from '@/lib/db'
import { escapeRegex, extractPrefix } from '@/lib/utils/patternUtils'
import { countMatches } from './ruleEngine'

export type BatchPatternResult = {
  type: 'common-prefix' | 'combined' | 'no-pattern'
  suggestions: BatchPatternSuggestion[]
  rawStrings: string[]
}

export type BatchPatternSuggestion = {
  pattern: string
  label: string
  matchCount: number
  matchesOutsideSelection: number
  type: 'prefix' | 'combined' | 'individual'
}

const findLongestCommonPrefix = (strings: string[]): string => {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]

  const sorted = [...strings].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  let i = 0
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++
  }
  return first.slice(0, i)
}

const groupByRoot = (strings: string[]): Record<string, string[]> => {
  const groups: Record<string, string[]> = {}
  for (const s of strings) {
    const prefix = extractPrefix(s)
    const root = prefix ?? s.split(/\s+/)[0] ?? s
    const key = root.toUpperCase()
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(s)
  }
  return groups
}

export const analyzeBatchPatterns = async (
  rawStrings: string[],
): Promise<BatchPatternResult> => {
  if (rawStrings.length === 0) {
    return { type: 'no-pattern', suggestions: [], rawStrings }
  }

  // 1. Extract prefixes from each string
  const prefixes = rawStrings.map((s) => extractPrefix(s)).filter(Boolean) as string[]

  // 2. Find longest common prefix among extracted prefixes
  const commonPrefix = prefixes.length > 0 ? findLongestCommonPrefix(prefixes) : ''

  if (commonPrefix && commonPrefix.length >= 3) {
    const pattern = `^${escapeRegex(commonPrefix)}.*`
    const matchCount = await countMatches(pattern)
    const outsideCount = matchCount - rawStrings.length

    return {
      type: 'common-prefix',
      suggestions: [
        {
          pattern,
          label: `Prefix: "${commonPrefix}" (${matchCount} transactions)`,
          matchCount,
          matchesOutsideSelection: Math.max(0, outsideCount),
          type: 'prefix',
        },
      ],
      rawStrings,
    }
  }

  // 3. Group by distinct roots
  const groups = groupByRoot(rawStrings)
  const rootKeys = Object.keys(groups)

  if (rootKeys.length <= 3) {
    const escapedRoots = rootKeys.map((r) => escapeRegex(r))
    const pattern = `^(${escapedRoots.join('|')}).*`
    const matchCount = await countMatches(pattern)
    const outsideCount = matchCount - rawStrings.length

    return {
      type: 'combined',
      suggestions: [
        {
          pattern,
          label: `Combined: (${rootKeys.join('|')})`,
          matchCount,
          matchesOutsideSelection: Math.max(0, outsideCount),
          type: 'combined',
        },
      ],
      rawStrings,
    }
  }

  // 4. Too diverse
  return {
    type: 'no-pattern',
    suggestions: [],
    rawStrings,
  }
}

export const getMatchingTransactionsOutsideSelection = async (
  pattern: string,
  selectedRawStrings: string[],
): Promise<{ rawMerchantString: string; date: Date; amount: number; id?: number }[]> => {
  try {
    const regex = new RegExp(pattern, 'i')
    const selectedSet = new Set(selectedRawStrings)
    const matches = await db.transactions
      .filter((tx) => regex.test(tx.rawMerchantString) && !selectedSet.has(tx.rawMerchantString))
      .limit(10)
      .toArray()
    return matches.map((tx) => ({
      rawMerchantString: tx.rawMerchantString,
      date: tx.date,
      amount: tx.amount,
      id: tx.id,
    }))
  } catch {
    return []
  }
}
