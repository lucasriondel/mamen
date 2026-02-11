import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { categoriesApi, merchantsApi, transactionsApi } from "@/lib/api";

export type MerchantListItem = {
	id: number;
	name: string;
	defaultCategoryId: number | undefined;
	categoryLabel: string;
	transactionCount: number;
	totalSpent: number;
	lastSeen: Date | null;
	createdAt: Date;
};

export type MerchantSortField =
	| "name"
	| "transactionCount"
	| "totalSpent"
	| "lastSeen";

export type MerchantSortOrder = "asc" | "desc";

type UseMerchantsListOptions = {
	sortField?: MerchantSortField;
	sortOrder?: MerchantSortOrder;
	searchQuery?: string;
};

type UseMerchantsListReturn = {
	merchants: MerchantListItem[];
	totalCount: number;
	isLoading: boolean;
};

export const useMerchantsList = ({
	sortField = "totalSpent",
	sortOrder = "desc",
	searchQuery,
}: UseMerchantsListOptions): UseMerchantsListReturn => {
	const { data = [] } = useQuery({
		queryKey: ["merchantsList"],
		queryFn: async () => {
			const [allMerchants, allTransactions, allCategories] = await Promise.all([
				merchantsApi.getAll(),
				transactionsApi.getAll(),
				categoriesApi.getAll(),
			]);

			const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

			return allMerchants.map((merchant) => {
				const merchantTxns = allTransactions.filter(
					(tx) => tx.merchantId === merchant.id,
				);
				const expenses = merchantTxns.filter((tx) => tx.amount < 0);

				let categoryLabel = "Uncategorized";
				if (merchant.defaultCategoryId != null) {
					const cat = categoryMap.get(merchant.defaultCategoryId);
					if (cat) {
						if (cat.parentId !== null) {
							const parent = categoryMap.get(cat.parentId);
							categoryLabel = parent
								? `${parent.name} > ${cat.name}`
								: cat.name;
						} else {
							categoryLabel = cat.name;
						}
					} else {
						categoryLabel = "Unknown";
					}
				}

				return {
					id: merchant.id!,
					name: merchant.name,
					defaultCategoryId: merchant.defaultCategoryId,
					categoryLabel,
					transactionCount: merchantTxns.length,
					totalSpent: Math.abs(
						expenses.reduce((sum, tx) => sum + tx.amount, 0),
					),
					lastSeen:
						merchantTxns.length > 0
							? new Date(
									Math.max(...merchantTxns.map((tx) => tx.date.getTime())),
								)
							: null,
					createdAt: merchant.createdAt,
				};
			});
		},
	});

	const totalCount = data.length;

	const result = useMemo(() => {
		let filtered = data;
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			filtered = data.filter((m) => m.name.toLowerCase().includes(query));
		}

		const sorted = [...filtered].sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case "name":
					comparison = a.name.localeCompare(b.name);
					break;
				case "transactionCount":
					comparison = a.transactionCount - b.transactionCount;
					break;
				case "totalSpent":
					comparison = a.totalSpent - b.totalSpent;
					break;
				case "lastSeen":
					comparison =
						(a.lastSeen?.getTime() ?? 0) - (b.lastSeen?.getTime() ?? 0);
					break;
			}
			if (comparison === 0) {
				comparison = a.name.localeCompare(b.name);
			}
			return sortOrder === "asc" ? comparison : -comparison;
		});

		return sorted;
	}, [data, searchQuery, sortField, sortOrder]);

	return {
		merchants: result,
		totalCount,
		isLoading: data.length === 0,
	};
};
