import type { Transaction } from '@/types'

export type ParsedTransaction = {
  date: Date
  amount: number
  rawMerchantString: string
}

export type DuplicateCheckResult = {
  duplicates: ParsedTransaction[]
  unique: ParsedTransaction[]
  existingMatches: Map<string, Transaction>
  hasDuplicates: boolean
  allDuplicates: boolean
}

export type DuplicateDecision = 'skip' | 'import-anyway' | 'cancel'
