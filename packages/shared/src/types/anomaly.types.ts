export type AnomalyType =
	| "high-amount"
	| "new-issuer"
	| "potential-duplicate"
	| "non-negative-bundle";

export type AnomalyFlag = {
	type: AnomalyType;
	reason: string;
	detectedAt: string;
	dismissed: boolean;
	dismissedAt?: string;
	linkedTransactionId?: number;
};

export type AnomalySettings = {
	multiplierThreshold: number;
	absoluteThreshold: number | null;
	minTransactionsForDetection: number;
};
