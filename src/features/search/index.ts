export { useTransactionSearch } from './hooks/useTransactionSearch'
export {
  buildSearchIndex,
  searchTransactions,
  clearSearchIndex,
  isIndexReady,
  type SearchableTransaction,
  type TransactionSearchResult,
} from './services/searchIndex'
