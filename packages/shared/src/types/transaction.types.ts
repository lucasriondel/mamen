import type { AnomalyFlag } from "./anomaly.types";

export type Transaction = {
	id?: number;
	accountId: number;
	date: Date;
	amount: number;
	rawMerchantString: string;
	merchantId?: number;
	categoryId?: number;
	subcategoryId?: number;
	categoryOverride?: string;
	manualCategory?: boolean;
	isRefund?: boolean;
	linkedRefundId?: number;
	anomalyFlags?: AnomalyFlag[];
	isDuplicateExcluded?: boolean;
	duplicateNote?: string;
	importedAt: Date;
	importMonth: string;
	importBatchId?: string;
};
