import type { ResolvedDateRange, TimePeriod } from "../types";

export type ComparisonResult = {
	absoluteChange: number;
	percentageChange: number;
	direction: "up" | "down" | "flat";
	hasPreviousData: boolean;
};

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

export const getPreviousPeriodRange = (
	period: TimePeriod,
	now = new Date(),
): ResolvedDateRange => {
	const year = now.getFullYear();
	const month = now.getMonth();

	switch (period.type) {
		case "this-month": {
			const prevDate = new Date(year, month - 1, 1);
			const prevYear = prevDate.getFullYear();
			const prevMonth = prevDate.getMonth();
			return {
				startDate: new Date(prevYear, prevMonth, 1),
				endDate: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999),
				label: `${monthNames[prevMonth]} ${prevYear}`,
			};
		}

		case "last-month": {
			const prevDate = new Date(year, month - 2, 1);
			const prevYear = prevDate.getFullYear();
			const prevMonth = prevDate.getMonth();
			return {
				startDate: new Date(prevYear, prevMonth, 1),
				endDate: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999),
				label: `${monthNames[prevMonth]} ${prevYear}`,
			};
		}

		case "last-3-months": {
			// Current window: month-2 to month (3 months inclusive)
			// Previous window: month-5 to month-3
			const prevStart = new Date(year, month - 5, 1);
			const prevEnd = new Date(year, month - 2, 0, 23, 59, 59, 999); // last day of month-3
			return {
				startDate: prevStart,
				endDate: prevEnd,
				label: "previous 3 months",
			};
		}

		case "this-year": {
			return {
				startDate: new Date(year - 1, 0, 1),
				endDate: new Date(
					year - 1,
					month,
					now.getDate(),
					now.getHours(),
					now.getMinutes(),
					now.getSeconds(),
					now.getMilliseconds(),
				),
				label: `${year - 1}`,
			};
		}

		case "custom": {
			const { startDate, endDate } = period;
			const durationMs = endDate.getTime() - startDate.getTime();
			const prevEnd = new Date(startDate.getTime() - 1);
			const prevStart = new Date(prevEnd.getTime() - durationMs);
			return {
				startDate: prevStart,
				endDate: prevEnd,
				label: "previous period",
			};
		}
	}
};

export const computeComparison = (
	current: number,
	previous: number,
): ComparisonResult => {
	if (previous === 0 && current === 0) {
		return {
			absoluteChange: 0,
			percentageChange: 0,
			direction: "flat",
			hasPreviousData: false,
		};
	}

	if (previous === 0) {
		return {
			absoluteChange: current,
			percentageChange: 100,
			direction: "up",
			hasPreviousData: false,
		};
	}

	const absoluteChange = current - previous;
	const percentageChange = (absoluteChange / previous) * 100;

	let direction: "up" | "down" | "flat";
	if (Math.abs(percentageChange) <= 0.5) {
		direction = "flat";
	} else if (absoluteChange > 0) {
		direction = "up";
	} else {
		direction = "down";
	}

	return { absoluteChange, percentageChange, direction, hasPreviousData: true };
};

export const getComparisonLabel = (
	period: TimePeriod,
	now = new Date(),
): string => {
	switch (period.type) {
		case "this-month":
			return "vs last month";
		case "last-month": {
			const range = getPreviousPeriodRange(period, now);
			return `vs ${range.label}`;
		}
		case "last-3-months":
			return "vs previous 3 months";
		case "this-year":
			return "vs last year";
		case "custom":
			return "vs previous period";
	}
};
