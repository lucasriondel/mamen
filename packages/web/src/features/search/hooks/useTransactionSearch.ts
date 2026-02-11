import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { queryKeys, transactionsApi } from "@/lib/api";
import type { Transaction } from "@/types";
import {
	buildSearchIndex,
	searchTransactions,
	type TransactionSearchResult,
} from "../services/searchIndex";

type UseTransactionSearchResult = {
	results: TransactionSearchResult[];
	isLoading: boolean;
};

export const useTransactionSearch = (
	query: string,
): UseTransactionSearchResult => {
	const lastBuiltRef = useRef<Transaction[] | null>(null);

	const { data: transactions } = useQuery({
		queryKey: queryKeys.transactions.list({}),
		queryFn: () => transactionsApi.getAll(),
	});

	const results = useMemo(() => {
		if (!transactions) return [];

		// Rebuild index only when transactions reference changes
		if (lastBuiltRef.current !== transactions) {
			buildSearchIndex(transactions);
			lastBuiltRef.current = transactions;
		}

		if (!query.trim()) return [];
		return searchTransactions(query, 10);
	}, [query, transactions]);

	return {
		results,
		isLoading: transactions === undefined,
	};
};
