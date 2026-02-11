import { transactionsApi } from "@/lib/api";

type AssignManualCategoryResult = {
	previousCategoryId: number | undefined;
	previousSubcategoryId: number | undefined;
	previousMerchantId: number | undefined;
	previousManualCategory: boolean | undefined;
};

export const assignManualCategory = async (
	transactionId: number,
	categoryId: number,
	subcategoryId?: number,
): Promise<AssignManualCategoryResult> => {
	const transaction = await transactionsApi.get(transactionId);
	if (!transaction) {
		throw new Error(`Transaction not found: ${transactionId}`);
	}

	const previous: AssignManualCategoryResult = {
		previousCategoryId: transaction.categoryId,
		previousSubcategoryId: transaction.subcategoryId,
		previousMerchantId: transaction.merchantId,
		previousManualCategory: transaction.manualCategory,
	};

	await transactionsApi.update(transactionId, {
		categoryId,
		subcategoryId: subcategoryId ?? undefined,
		manualCategory: true,
		merchantId: undefined,
	});

	return previous;
};

export const undoManualCategoryAssignment = async (
	transactionId: number,
	previousState: AssignManualCategoryResult,
): Promise<void> => {
	await transactionsApi.update(transactionId, {
		categoryId: previousState.previousCategoryId,
		subcategoryId: previousState.previousSubcategoryId,
		merchantId: previousState.previousMerchantId,
		manualCategory: previousState.previousManualCategory,
	});
};
