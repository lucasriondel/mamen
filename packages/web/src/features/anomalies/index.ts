export { AnomalyBadge } from "./components/AnomalyBadge";
export { AnomalySettingsForm } from "./components/AnomalySettingsForm";
export { type UseAnomaliesReturn, useAnomalies } from "./hooks/useAnomalies";
export { useAnomalyDismiss } from "./hooks/useAnomalyDismiss";
export { useDuplicateActions } from "./hooks/useDuplicateActions";
export {
	buildReason,
	cleanExpiredNewMerchantFlags,
	confirmDuplicate,
	DUPLICATE_WINDOW_DAYS,
	detectHighAmountAnomalies,
	detectNewMerchantAnomalies,
	detectPotentialDuplicates,
	dismissAnomaly,
	dismissDuplicateAnomaly,
	getAnomalySettings,
	NEW_MERCHANT_THRESHOLD_DAYS,
	removeHighAmountFlags,
	undoConfirmDuplicate,
	undoDismissAnomaly,
	undoDismissDuplicateAnomaly,
} from "./services/anomalyDetector";
