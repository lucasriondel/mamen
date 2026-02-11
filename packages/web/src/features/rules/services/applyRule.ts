import { merchantsApi, rulesApi, transactionsApi } from "@/lib/api";
import type { Rule } from "@/types";

export const applyRuleToTransactions = async (
	rule: Rule,
	categoryId: number,
): Promise<{ count: number; affectedIds: number[] }> => {
	const regex = new RegExp(rule.pattern, "i");

	const allTransactions = await transactionsApi.getAll();
	const transactions = allTransactions.filter((tx) =>
		regex.test(tx.rawMerchantString),
	);

	const affectedIds: number[] = [];

	for (const tx of transactions) {
		if (tx.id !== undefined) {
			await transactionsApi.update(tx.id, {
				merchantId: rule.merchantId,
				categoryId,
			});
			affectedIds.push(tx.id);
		}
	}

	if (rule.id !== undefined) {
		await rulesApi.update(rule.id, { matchCount: transactions.length });
	}

	return { count: transactions.length, affectedIds };
};

export const undoRuleApplication = async (
	merchantId: number,
	ruleId: number,
	affectedTransactionIds: number[],
): Promise<void> => {
	await rulesApi.delete(ruleId);

	const remainingRules = await rulesApi.count({ merchantId });
	if (remainingRules === 0) {
		await merchantsApi.delete(merchantId);
	}

	for (const txId of affectedTransactionIds) {
		await transactionsApi.update(txId, {
			merchantId: undefined,
			categoryId: undefined,
		});
	}
};
