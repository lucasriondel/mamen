import { useQuery } from "@tanstack/react-query";
import { invalidateEntity, merchantsApi, queryKeys } from "@/lib/api";
import type { Merchant } from "@/types";

export type UseMerchantsReturn = {
	merchants: Merchant[];
	isLoading: boolean;
	createMerchant: (name: string, defaultCategoryId?: number) => Promise<number>;
	getMerchantByName: (name: string) => Promise<Merchant | undefined>;
};

export const useMerchants = (): UseMerchantsReturn => {
	const { data: merchants, isLoading } = useQuery({
		queryKey: queryKeys.merchants.list({ orderBy: "name" }),
		queryFn: () => merchantsApi.getAll({ orderBy: "name" }),
	});

	const createMerchant = async (
		name: string,
		defaultCategoryId?: number,
	): Promise<number> => {
		const now = new Date();
		const id = await merchantsApi.create({
			name,
			defaultCategoryId,
			createdAt: now,
			firstSeen: now,
		});
		invalidateEntity("merchants");
		return id;
	};

	const getMerchantByName = async (
		name: string,
	): Promise<Merchant | undefined> => {
		try {
			return await merchantsApi.getByNameCaseInsensitive(name);
		} catch {
			return undefined;
		}
	};

	return {
		merchants: merchants ?? [],
		isLoading: !!isLoading,
		createMerchant,
		getMerchantByName,
	};
};
