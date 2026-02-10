import { db } from '@/lib/db'
import type { Transaction } from '@/types'
import type { ParsedTransaction, DuplicateCheckResult } from '../types/duplicate.types'

const normalizeAmount = (amount: number): number =>
  Math.round(amount * 100) / 100

const generateKey = (
  accountId: number,
  date: Date,
  amount: number,
  merchant: string,
): string => {
  const dateStr = date.toISOString().split('T')[0]
  return `${accountId}|${dateStr}|${normalizeAmount(amount)}|${merchant.trim()}`
}

export const detectDuplicates = async (
  accountId: number,
  newTransactions: ParsedTransaction[],
): Promise<DuplicateCheckResult> => {
  if (newTransactions.length === 0) {
    return {
      duplicates: [],
      unique: [],
      existingMatches: new Map(),
      hasDuplicates: false,
      allDuplicates: false,
    }
  }

  const existing = await db.transactions
    .where('accountId')
    .equals(accountId)
    .toArray()

  const existingKeys = new Map<string, Transaction>()
  for (const tx of existing) {
    const key = generateKey(accountId, tx.date, tx.amount, tx.rawMerchantString)
    existingKeys.set(key, tx)
  }

  const duplicates: ParsedTransaction[] = []
  const unique: ParsedTransaction[] = []
  const existingMatches = new Map<string, Transaction>()
  const seenKeys = new Set<string>()

  for (const tx of newTransactions) {
    const key = generateKey(accountId, tx.date, tx.amount, tx.rawMerchantString)

    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicates.push(tx)
      const match = existingKeys.get(key)
      if (match) {
        existingMatches.set(key, match)
      }
    } else {
      unique.push(tx)
      seenKeys.add(key)
    }
  }

  return {
    duplicates,
    unique,
    existingMatches,
    hasDuplicates: duplicates.length > 0,
    allDuplicates:
      duplicates.length === newTransactions.length && newTransactions.length > 0,
  }
}

export { generateKey as _generateKeyForTesting }
