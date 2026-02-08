import MiniSearch from 'minisearch'
import type { Transaction } from '@/types'
import { formatDate } from '@/lib/utils/formatDate'

export type SearchableTransaction = {
  id: number
  rawMerchantString: string
  amount: number
  amountFormatted: string
  date: Date
  dateFormatted: string
  accountId: number
}

const mapToSearchable = (tx: Transaction): SearchableTransaction => ({
  id: tx.id!,
  rawMerchantString: tx.rawMerchantString,
  amount: tx.amount,
  amountFormatted: String(tx.amount),
  date: tx.date,
  dateFormatted: formatDate(tx.date),
  accountId: tx.accountId,
})

let searchIndex: MiniSearch<SearchableTransaction> | null = null

const createIndex = (): MiniSearch<SearchableTransaction> => {
  return new MiniSearch<SearchableTransaction>({
    fields: ['rawMerchantString', 'amountFormatted'],
    storeFields: ['id', 'rawMerchantString', 'amount', 'date', 'dateFormatted', 'accountId'],
    searchOptions: {
      boost: { rawMerchantString: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
    tokenize: (text) => text.toLowerCase().split(/[\s\-_*]+/).filter(Boolean),
  })
}

export const buildSearchIndex = (transactions: Transaction[]): void => {
  searchIndex = createIndex()
  const searchable = transactions
    .filter((tx) => tx.id !== undefined)
    .map(mapToSearchable)
  searchIndex.addAll(searchable)
}

export type TransactionSearchResult = {
  id: number
  rawMerchantString: string
  amount: number
  date: Date
  dateFormatted: string
  accountId: number
  score: number
}

export const searchTransactions = (query: string, limit = 10): TransactionSearchResult[] => {
  if (!searchIndex || !query.trim()) return []

  const results = searchIndex.search(query).slice(0, limit)

  return results.map((result) => ({
    id: result.id as number,
    rawMerchantString: result.rawMerchantString as string,
    amount: result.amount as number,
    date: result.date as Date,
    dateFormatted: result.dateFormatted as string,
    accountId: result.accountId as number,
    score: result.score,
  }))
}

export const isIndexReady = (): boolean => searchIndex !== null

export const clearSearchIndex = (): void => {
  searchIndex = null
}
