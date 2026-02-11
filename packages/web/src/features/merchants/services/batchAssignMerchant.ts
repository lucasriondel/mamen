import { merchantsApi, rulesApi, transactionsApi } from "@/lib/api";

export type BatchAssignParams = {
	mode: "new" | "existing";
	merchantName?: string;
	merchantId?: number;
	pattern: string;
	additionalPatterns?: string[];
	categoryId: number;
	categoryOverrideId?: number | null;
	transactionIds: number[];
	assignWithoutRule?: boolean;
};

export type BatchAssignResult = {
	merchantId: number;
	ruleIds: number[];
	affectedTransactionIds: number[];
	matchCount: number;
};

export type BatchUndoParams = {
	merchantId: number;
	ruleIds: number[];
	affectedTransactionIds: number[];
	previousState: Array<{
		id: number;
		merchantId: number | null;
		categoryId: number | null;
	}>;
	deleteNewMerchant: boolean;
};

export const batchAssignMerchant = async (
	params: BatchAssignParams,
): Promise<BatchAssignResult> => {
	const {
		mode,
		merchantName,
		merchantId: existingMerchantId,
		pattern,
		additionalPatterns,
		categoryId,
		categoryOverrideId,
		transactionIds,
		assignWithoutRule,
	} = params;

	// 1. Create or get merchant
	let merchantId: number;

	if (mode === "new") {
		const now = new Date();
		merchantId = await merchantsApi.create({
			name: merchantName!,
			defaultCategoryId: categoryId,
			createdAt: now,
			firstSeen: now,
		});
	} else {
		merchantId = existingMerchantId!;
		const merchant = await merchantsApi.get(merchantId);
		if (!merchant) throw new Error(`Merchant not found: ${merchantId}`);
	}

	const effectiveCategoryId = categoryOverrideId ?? categoryId;
	const ruleIds: number[] = [];
	const affectedIdSet = new Set<number>();

	if (assignWithoutRule) {
		// Assign without rule: only update selected transactions
		for (const txId of transactionIds) {
			await transactionsApi.update(txId, {
				merchantId,
				categoryId: effectiveCategoryId,
			});
			affectedIdSet.add(txId);
		}
	} else {
		// Create rule(s) and apply globally
		const allPatterns = [pattern, ...(additionalPatterns ?? [])].filter(
			Boolean,
		);

		for (const p of allPatterns) {
			const ruleId = await rulesApi.create({
				merchantId,
				pattern: p,
				categoryOverride: categoryOverrideId ?? undefined,
				matchCount: 0,
				createdAt: new Date(),
			});
			ruleIds.push(ruleId);

			// Apply rule to ALL matching transactions
			const regex = new RegExp(p, "i");
			const allTransactions = await transactionsApi.getAll();
			const matching = allTransactions.filter((tx) =>
				regex.test(tx.rawMerchantString),
			);

			for (const tx of matching) {
				if (tx.id !== undefined) {
					await transactionsApi.update(tx.id, {
						merchantId,
						categoryId: effectiveCategoryId,
					});
					affectedIdSet.add(tx.id);
				}
			}

			await rulesApi.update(ruleId, { matchCount: matching.length });
		}
	}

	const affectedTransactionIds = Array.from(affectedIdSet);

	return {
		merchantId,
		ruleIds,
		affectedTransactionIds,
		matchCount: affectedTransactionIds.length,
	};
};

export const undoBatchAssign = async (
	params: BatchUndoParams,
): Promise<void> => {
	const { merchantId, ruleIds, previousState, deleteNewMerchant } = params;

	// 1. Delete rules
	for (const ruleId of ruleIds) {
		await rulesApi.delete(ruleId);
	}

	// 2. Delete merchant if it was newly created
	if (deleteNewMerchant) {
		await merchantsApi.delete(merchantId);
	}

	// 3. Restore transactions to previous state
	for (const prev of previousState) {
		await transactionsApi.update(prev.id, {
			merchantId: prev.merchantId ?? undefined,
			categoryId: prev.categoryId ?? undefined,
		});
	}
};
