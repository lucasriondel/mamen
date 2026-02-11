import { useCallback } from "react";
import { toast } from "sonner";
import { invalidateEntity, transactionsApi } from "@/lib/api";
import {
	confirmDuplicate,
	dismissDuplicateAnomaly,
	undoConfirmDuplicate,
	undoDismissDuplicateAnomaly,
} from "../services/anomalyDetector";

export const useDuplicateActions = () => {
	const handleDismissDuplicate = useCallback((transactionId: number) => {
		transactionsApi.get(transactionId).then((tx) => {
			const dupFlag = tx?.anomalyFlags?.find(
				(f) => f.type === "potential-duplicate" && !f.dismissed,
			);
			const linkedId = dupFlag?.linkedTransactionId;

			dismissDuplicateAnomaly(transactionId).then(() => {
				invalidateEntity("transactions");
				toast.info("Duplicate flag dismissed for both transactions", {
					action: {
						label: "Undo",
						onClick: () => {
							if (linkedId) {
								undoDismissDuplicateAnomaly(transactionId, linkedId).then(
									() => {
										invalidateEntity("transactions");
									},
								);
							}
						},
					},
					duration: 5000,
				});
			});
		});
	}, []);

	const handleExcludeDuplicate = useCallback((transactionId: number) => {
		transactionsApi.get(transactionId).then((tx) => {
			const dupFlag = tx?.anomalyFlags?.find(
				(f) => f.type === "potential-duplicate" && !f.dismissed,
			);
			const linkedId = dupFlag?.linkedTransactionId;

			confirmDuplicate(transactionId, "exclude").then(() => {
				invalidateEntity("transactions");
				toast.info("Transaction excluded as duplicate", {
					action: {
						label: "Undo",
						onClick: () => {
							undoConfirmDuplicate(transactionId, linkedId).then(() => {
								invalidateEntity("transactions");
							});
						},
					},
					duration: 5000,
				});
			});
		});
	}, []);

	return { handleDismissDuplicate, handleExcludeDuplicate };
};
