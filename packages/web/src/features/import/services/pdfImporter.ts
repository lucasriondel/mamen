import { transactionsApi } from '@/lib/api'
import type { Transaction } from '@/types'
import type { LLMTransaction } from '@/lib/schemas'

export type PDFImportResult = {
  count: number
  importBatchId: string
  transactionIds: number[]
}

export const importPDFTransactions = async (
  transactions: LLMTransaction[],
  accountId: number,
  importMonth: string,
): Promise<PDFImportResult> => {
  if (transactions.length === 0) {
    throw new Error('No transactions to import')
  }

  const importBatchId = crypto.randomUUID()
  const now = new Date()

  const records: Omit<Transaction, 'id'>[] = transactions.map((t) => ({
    accountId,
    date: new Date(t.date),
    amount: t.amount,
    rawMerchantString: t.description.trim(),
    importedAt: now,
    importMonth,
    importBatchId,
  }))

  const transactionIds = await transactionsApi.bulkAdd(records)

  return { count: records.length, importBatchId, transactionIds }
}
