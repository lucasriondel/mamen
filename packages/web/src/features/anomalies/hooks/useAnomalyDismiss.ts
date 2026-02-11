import { useCallback } from "react";
import { toast } from "sonner";
import { invalidateEntity } from "@/lib/api";
import type { AnomalyType } from "@/types";
import {
	dismissAnomaly,
	undoDismissAnomaly,
} from "../services/anomalyDetector";

export const useAnomalyDismiss = () => {
	const handleDismiss = useCallback(
		(transactionId: number, anomalyType: AnomalyType) => {
			dismissAnomaly(transactionId, anomalyType).then(() => {
				invalidateEntity("transactions");
				toast.info("Anomaly dismissed", {
					action: {
						label: "Undo",
						onClick: () => {
							undoDismissAnomaly(transactionId, anomalyType).then(() => {
								invalidateEntity("transactions");
							});
						},
					},
					duration: 5000,
				});
			});
		},
		[],
	);

	return { handleDismiss };
};
