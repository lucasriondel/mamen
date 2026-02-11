import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { invalidateEntity } from "@/lib/api";
import {
	batchCategoryAssign,
	undoBatchCategoryAssign,
} from "../services/batchCategoryAssign";

type UseBatchCategoryAssignReturn = {
	batchAssignCategory: (
		transactionIds: number[],
		categoryId: number,
		subcategoryId?: number,
	) => Promise<void>;
	isAssigning: boolean;
};

export const useBatchCategoryAssign = (): UseBatchCategoryAssignReturn => {
	const [isAssigning, setIsAssigning] = useState(false);
	const { getCategoryById } = useCategories();

	const batchAssignCategory = useCallback(
		async (
			transactionIds: number[],
			categoryId: number,
			subcategoryId?: number,
		): Promise<void> => {
			setIsAssigning(true);

			try {
				const result = await batchCategoryAssign({
					transactionIds,
					categoryId,
					subcategoryId,
				});
				invalidateEntity("transactions");

				const category = getCategoryById(categoryId);
				const subcategory = subcategoryId
					? getCategoryById(subcategoryId)
					: undefined;

				const displayName = subcategory
					? `${category?.name} > ${subcategory.name}`
					: (category?.name ?? "Unknown");

				toast(`${result.affectedCount} transactions → ${displayName}`, {
					action: {
						label: "Undo",
						onClick: () => {
							undoBatchCategoryAssign(result.previousStates).then(() => {
								invalidateEntity("transactions");
							});
							toast("Batch category assignment undone");
						},
					},
					duration: 10000,
				});
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to assign categories";
				toast.error("Failed to assign categories", { description: message });
			} finally {
				setIsAssigning(false);
			}
		},
		[getCategoryById],
	);

	return {
		batchAssignCategory,
		isAssigning,
	};
};
