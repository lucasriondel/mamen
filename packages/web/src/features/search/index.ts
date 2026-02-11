export { useTransactionSearch } from "./hooks/useTransactionSearch";
export {
	buildSearchIndex,
	clearSearchIndex,
	isIndexReady,
	type SearchableTransaction,
	searchTransactions,
	type TransactionSearchResult,
} from "./services/searchIndex";
