import type { ResolvedDateRange, TimePeriod } from "../types";

const monthNames = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const shortMonthNames = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export const resolveTimePeriod = (
	period: TimePeriod,
	now = new Date(),
): ResolvedDateRange => {
	const year = now.getFullYear();
	const month = now.getMonth();

	switch (period.type) {
		case "this-month":
			return {
				startDate: new Date(year, month, 1),
				endDate: now,
				label: `${monthNames[month]} ${year}`,
			};

		case "last-month": {
			const lastMonthDate = new Date(year, month - 1, 1);
			const lmYear = lastMonthDate.getFullYear();
			const lmMonth = lastMonthDate.getMonth();
			return {
				startDate: new Date(lmYear, lmMonth, 1),
				endDate: new Date(lmYear, lmMonth + 1, 0, 23, 59, 59, 999),
				label: `${monthNames[lmMonth]} ${lmYear}`,
			};
		}

		case "last-3-months":
			return {
				startDate: new Date(year, month - 2, 1),
				endDate: now,
				label: "Last 3 Months",
			};

		case "this-year":
			return {
				startDate: new Date(year, 0, 1),
				endDate: now,
				label: `${year}`,
			};

		case "custom": {
			const { startDate, endDate } = period;
			const startLabel = `${shortMonthNames[startDate.getMonth()]} ${startDate.getDate()}`;
			const endLabel = `${shortMonthNames[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;
			return {
				startDate,
				endDate,
				label: `${startLabel} - ${endLabel}`,
			};
		}
	}
};

export const getTimePeriodLabel = (
	period: TimePeriod,
	now = new Date(),
): string => {
	return resolveTimePeriod(period, now).label;
};
