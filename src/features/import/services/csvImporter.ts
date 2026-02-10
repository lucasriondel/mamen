import Papa from 'papaparse'
import { db } from '@/lib/db'
import { parseFullCSV, parseDate, parseAmount, isDebitDirection } from '@/lib/csv/parser'
import type { ColumnMapping, DateFormatOption } from '@/lib/csv/parser'
import type { Transaction } from '@/types'
import type { ParsedTransaction } from '../types/duplicate.types'

export type ImportResult = {
  count: number
  importBatchId: string
  transactionIds: number[]
}

export const parseCSVTransactions = async (
  file: File,
  hasHeaders: boolean,
  mapping: ColumnMapping,
  dateFormat: DateFormatOption,
): Promise<ParsedTransaction[]> => {
  const rows = await parseFullCSV(file, hasHeaders)

  if (rows.length === 0) {
    throw new Error('No data rows found in the CSV file')
  }

  const headerRow = hasHeaders
    ? await getHeaderRow(file)
    : rows[0].map((_, i) => `Column ${i + 1}`)

  const dateIdx = headerRow.indexOf(mapping.dateColumn)
  const amountIdx = headerRow.indexOf(mapping.amountColumn)
  const descIndices = mapping.descriptionColumns.map((col) => headerRow.indexOf(col))
  const dirIdx = mapping.directionColumn ? headerRow.indexOf(mapping.directionColumn) : -1

  if (dateIdx === -1 || amountIdx === -1 || descIndices.some((i) => i === -1)) {
    throw new Error('Column mapping is invalid')
  }

  const transactions: ParsedTransaction[] = []

  for (const row of rows) {
    const dateStr = row[dateIdx]
    const amountStr = row[amountIdx]
    const description = descIndices.map((i) => row[i]).filter(Boolean).join(' ')
    const direction = dirIdx !== -1 ? row[dirIdx] : undefined

    if (!dateStr || !amountStr) continue

    const date = parseDate(dateStr, dateFormat)
    if (!date) continue

    const amount = parseAmount(amountStr)
    if (amount === null) continue

    // Apply direction: if a direction column is mapped, use it to determine sign
    const signedAmount = direction
      ? (isDebitDirection(direction) ? -Math.abs(amount) : Math.abs(amount))
      : amount

    transactions.push({
      date,
      amount: signedAmount,
      rawMerchantString: (description ?? '').trim(),
    })
  }

  if (transactions.length === 0) {
    throw new Error('No valid transactions found in the CSV file')
  }

  return transactions
}

export const importTransactions = async (
  parsedTransactions: ParsedTransaction[],
  accountId: number,
  importMonth: string,
): Promise<ImportResult> => {
  if (parsedTransactions.length === 0) {
    throw new Error('No transactions to import')
  }

  const importBatchId = crypto.randomUUID()
  const now = new Date()

  const transactions: Omit<Transaction, 'id'>[] = parsedTransactions.map((t) => ({
    accountId,
    date: t.date,
    amount: t.amount,
    rawMerchantString: t.rawMerchantString,
    importedAt: now,
    importMonth,
    importBatchId,
  }))

  let transactionIds: number[] = []
  await db.transaction('rw', db.transactions, async () => {
    const ids = await db.transactions.bulkAdd(transactions, { allKeys: true })
    transactionIds = ids as number[]
  })

  return { count: transactions.length, importBatchId, transactionIds }
}

export const importCSV = async (
  file: File,
  hasHeaders: boolean,
  mapping: ColumnMapping,
  dateFormat: DateFormatOption,
  accountId: number,
  importMonth: string,
): Promise<ImportResult> => {
  const parsed = await parseCSVTransactions(file, hasHeaders, mapping, dateFormat)
  return importTransactions(parsed, accountId, importMonth)
}

export const undoImport = async (importBatchId: string): Promise<number> => {
  const count = await db.transactions.where('importBatchId').equals(importBatchId).count()
  await db.transactions.where('importBatchId').equals(importBatchId).delete()
  return count
}

export const deleteTransactionsForMonth = async (
  accountId: number,
  importMonth: string,
): Promise<number> => {
  const count = await db.transactions
    .where('[accountId+importMonth]')
    .equals([accountId, importMonth])
    .count()
  await db.transactions
    .where('[accountId+importMonth]')
    .equals([accountId, importMonth])
    .delete()
  return count
}

const getHeaderRow = (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      preview: 1,
      complete: (results) => {
        resolve((results.data[0] as string[]) ?? [])
      },
      error: () => reject(new Error('Failed to read file headers')),
    })
  })
}
