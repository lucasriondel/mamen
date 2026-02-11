import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys, transactionsApi } from "@/lib/api";

export function useAccountMonthData(
	accountId: number | undefined,
): Map<string, number> {
	const { data: transactions } = useQuery({
		queryKey: [...queryKeys.transactions.all, "accountMonth", accountId],
		queryFn: () => {
			if (accountId === undefined) return Promise.resolve([]);
			return transactionsApi.getAll({ accountId });
		},
	});

	return useMemo(() => {
		const counts = new Map<string, number>();
		if (!transactions) return counts;

		for (const tx of transactions) {
			const key = tx.importMonth;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	}, [transactions]);
}
