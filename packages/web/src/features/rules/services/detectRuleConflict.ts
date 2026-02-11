import { rulesApi, merchantsApi } from '@/lib/api'

type ConflictResult = {
  hasConflict: boolean
  conflictingMerchant?: string
  conflictingPattern?: string
  specificity?: 'more' | 'less' | 'equal'
}

export const detectRuleConflict = async (
  pattern: string,
  excludeMerchantId?: number,
): Promise<ConflictResult> => {
  const allRules = await rulesApi.getAll()
  const otherRules = excludeMerchantId
    ? allRules.filter((r) => r.merchantId !== excludeMerchantId)
    : allRules

  try {
    new RegExp(pattern, 'i')
  } catch {
    return { hasConflict: false }
  }

  for (const rule of otherRules) {
    const overlap = checkPatternOverlap(pattern, rule.pattern)

    if (overlap) {
      const merchant = await merchantsApi.get(rule.merchantId)
      const specificity = compareSpecificity(pattern, rule.pattern)

      return {
        hasConflict: true,
        conflictingMerchant: merchant?.name ?? 'Unknown',
        conflictingPattern: rule.pattern,
        specificity,
      }
    }
  }

  return { hasConflict: false }
}

const checkPatternOverlap = (pattern1: string, pattern2: string): boolean => {
  const getLiteralPrefix = (pattern: string): string => {
    const match = pattern.match(/^\^?([A-Za-z0-9]+)/)
    return match ? match[1].toLowerCase() : ''
  }

  const prefix1 = getLiteralPrefix(pattern1)
  const prefix2 = getLiteralPrefix(pattern2)

  return (
    prefix1.length > 0 &&
    prefix2.length > 0 &&
    (prefix1.startsWith(prefix2) || prefix2.startsWith(prefix1))
  )
}

const compareSpecificity = (
  newPattern: string,
  existingPattern: string,
): 'more' | 'less' | 'equal' => {
  const stripMeta = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '').length
  const newLength = stripMeta(newPattern)
  const existingLength = stripMeta(existingPattern)

  if (newLength > existingLength) return 'more'
  if (newLength < existingLength) return 'less'
  return 'equal'
}
