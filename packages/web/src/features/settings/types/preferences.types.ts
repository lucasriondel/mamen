export type CurrencySymbol = "€" | "$" | "£" | "¥" | "₹" | "kr" | "CHF";

export type DateFormatOption = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export type DashboardTimePeriod =
	| "this-month"
	| "last-month"
	| "last-3-months"
	| "this-year";

export type AnomalyThreshold = {
	multiplier: number;
	absoluteAmount?: number;
};

export type DisplayPreferences = {
	currencySymbol: CurrencySymbol;
	dateFormat: DateFormatOption;
	defaultDashboardPeriod: DashboardTimePeriod;
	anomalyThreshold: AnomalyThreshold;
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
	currencySymbol: "€",
	dateFormat: "DD/MM/YYYY",
	defaultDashboardPeriod: "this-month",
	anomalyThreshold: { multiplier: 2 },
};
