export type { SpendingView } from "./components/CategoryBreakdown";
export { CategoryBreakdown } from "./components/CategoryBreakdown";
export { ComparisonIndicator } from "./components/ComparisonIndicator";
export { DashboardPage } from "./components/DashboardPage";
export { SpendingSummary } from "./components/SpendingSummary";
export { TimePeriodSelector } from "./components/TimePeriodSelector";
export type { CategorySpending, SpendingSummary } from "./hooks/useNetSpending";
export { useNetSpending } from "./hooks/useNetSpending";
export { useSpendingBreakdown } from "./hooks/useSpendingBreakdown";
export type { SpendingComparison } from "./hooks/useSpendingComparison";
export { useSpendingComparison } from "./hooks/useSpendingComparison";
export { useTimePeriod } from "./hooks/useTimePeriod";
export type {
	ResolvedDateRange,
	TimePeriod,
	TimePeriodCustom,
	TimePeriodPreset,
} from "./types";
export type { ComparisonResult } from "./utils/computeComparison";
export {
	computeComparison,
	getComparisonLabel,
	getPreviousPeriodRange,
} from "./utils/computeComparison";
export {
	getTimePeriodLabel,
	resolveTimePeriod,
} from "./utils/resolveTimePeriod";
