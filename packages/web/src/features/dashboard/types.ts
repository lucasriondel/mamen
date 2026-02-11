export type TimePeriodPreset =
	| "this-month"
	| "last-month"
	| "last-3-months"
	| "this-year";

export type TimePeriodCustom = {
	type: "custom";
	startDate: Date;
	endDate: Date;
};

export type TimePeriod = { type: TimePeriodPreset } | TimePeriodCustom;

export type ResolvedDateRange = {
	startDate: Date;
	endDate: Date;
	label: string;
};
