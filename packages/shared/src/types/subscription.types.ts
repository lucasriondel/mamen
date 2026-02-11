export type SubscriptionFrequency = "weekly" | "monthly" | "yearly";
export type SubscriptionStatus = "active" | "possibly-cancelled";

export type Subscription = {
	id?: number;
	merchantId: number;
	merchantName: string;
	typicalAmount: number;
	frequency: SubscriptionFrequency;
	intervalDays: number;
	lastChargeDate: string;
	firstChargeDate: string;
	chargeCount: number;
	status: SubscriptionStatus;
	transactionIds: number[];
	detectedAt: string;
	updatedAt: string;
};
