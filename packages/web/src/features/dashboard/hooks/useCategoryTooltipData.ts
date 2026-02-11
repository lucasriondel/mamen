import { useQuery } from "@tanstack/react-query";
import { merchantsApi, transactionsApi } from "@/lib/api";

type TopMerchant = {
	name: string;
	count: number;
};

type CategoryTooltipData = {
	transactionCount: number;
	topMerchants: TopMerchant[];
} | null;

export const useCategoryTooltipData = (
	categoryId: number | null,
	startDate: Date | undefined,
	endDate: Date | undefined,
	isOpen: boolean,
): CategoryTooltipData => {
	const { data = null } = useQuery({
		queryKey: [
			"categoryTooltip",
			categoryId,
			startDate?.toISOString(),
			endDate?.toISOString(),
		],
		queryFn: async () => {
			if (categoryId == null) return null;

			let txs = await transactionsApi.getAll({ categoryId });

			if (startDate && endDate) {
				txs = txs.filter((t) => t.date >= startDate && t.date <= endDate);
			}

			const merchantCounts = new Map<number, number>();
			for (const tx of txs) {
				if (tx.merchantId) {
					merchantCounts.set(
						tx.merchantId,
						(merchantCounts.get(tx.merchantId) ?? 0) + 1,
					);
				}
			}

			const sorted = [...merchantCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3);

			const topMerchants = await Promise.all(
				sorted.map(async ([id, count]) => {
					let name = "Unknown";
					try {
						const merchant = await merchantsApi.get(id);
						name = merchant?.name ?? "Unknown";
					} catch {
						// merchant not found
					}
					return { name, count };
				}),
			);

			return {
				transactionCount: txs.length,
				topMerchants,
			};
		},
		enabled: isOpen && categoryId != null,
	});

	return data;
};

export type { CategoryTooltipData, TopMerchant };
