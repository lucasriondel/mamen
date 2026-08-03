import type { AnomalyFlag } from "./anomaly.types";

export type Transaction = {
	id?: number;
	accountId: number;
	date: Date;
	amount: number;
	rawIssuerString: string;
	issuerId?: number;
	categoryId?: number;
	manualCategory?: boolean;
	manualIssuer?: boolean;
	isRefund?: boolean;
	linkedRefundId?: number;
	transferGroupId?: number;
	anomalyFlags?: AnomalyFlag[];
	isDuplicateExcluded?: boolean;
	duplicateNote?: string;
	excludedFromRecap?: boolean;
	manualExcluded?: boolean;
	notes?: string;
	importedAt: Date;
	importMonth: string;
	importBatchId?: string;
};
