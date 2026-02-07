import Papa from 'papaparse'
import { db } from '@/lib/db'
import { parseFullCSV, parseDate, parseAmount } from '@/lib/csv/parser'
import type { ColumnMapping, DateFormatOption } from '@/lib/csv/parser'
import type { Transaction } from '@/types'

export type ImportResult = {
  count: number
  importBatchId: string
}

export const importCSV = async (
  file: File,
  hasHeaders: boolean,
  mapping: ColumnMapping,
  dateFormat: DateFormatOption,
  accountId: number,
  importMonth: string,
): Promise<ImportResult> => {
  const rows = await parseFullCSV(file, hasHeaders)

  if (rows.length === 0) {
    throw new Error('No data rows found in the CSV file')
  }

  // We need to get header indices from the preview headers
  // Re-parse to get headers
  const headerRow = hasHeaders
    ? await getHeaderRow(file)
    : rows[0].map((_, i) => `Column ${i + 1}`)

  const dateIdx = headerRow.indexOf(mapping.dateColumn)
  const amountIdx = headerRow.indexOf(mapping.amountColumn)
  const descIdx = headerRow.indexOf(mapping.descriptionColumn)

  if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
    throw new Error('Column mapping is invalid')
  }

  const importBatchId = crypto.randomUUID()
  const now = new Date()

  const transactions: Omit<Transaction, 'id'>[] = []

  for (const row of rows) {
    const dateStr = row[dateIdx]
    const amountStr = row[amountIdx]
    const description = row[descIdx]

    if (!dateStr || !amountStr) continue

    const date = parseDate(dateStr, dateFormat)
    if (!date) continue

    const amount = parseAmount(amountStr)
    if (amount === null) continue

    transactions.push({
      accountId,
      date,
      amount,
      rawMerchantString: (description ?? '').trim(),
      importedAt: now,
      importMonth,
      importBatchId,
    })
  }

  if (transactions.length === 0) {
    throw new Error('No valid transactions found in the CSV file')
  }

  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.bulkAdd(transactions)
  })

  return { count: transactions.length, importBatchId }
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
