import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useFocusMode } from "@/context/FocusModeContext";

type DrillDownFilter = {
	categoryId: number | null;
	periodStart: Date | null;
	periodEnd: Date | null;
	fromDashboard: boolean;
};

type UseDrillDownFilterReturn = {
	filter: DrillDownFilter;
	isActive: boolean;
	clearDrillDownFilter: () => void;
	clearAllFilters: () => void;
};

export const useDrillDownFilter = (): UseDrillDownFilterReturn => {
	const search = useSearch({ from: "/transactions" });
	const navigate = useNavigate();
	const { toggleFocusMode } = useFocusMode();

	const filter: DrillDownFilter = useMemo(() => {
		const periodStart = search.periodStart
			? new Date(search.periodStart)
			: null;
		const periodEnd = search.periodEnd ? new Date(search.periodEnd) : null;

		return {
			categoryId: search.categoryId ?? null,
			periodStart:
				periodStart && !Number.isNaN(periodStart.getTime())
					? periodStart
					: null,
			periodEnd:
				periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null,
			fromDashboard: search.from === "dashboard",
		};
	}, [search.categoryId, search.periodStart, search.periodEnd, search.from]);

	const isActive = filter.categoryId !== null;

	const clearDrillDownFilter = useCallback(() => {
		navigate({
			to: "/transactions",
			search: {},
			replace: true,
		});
	}, [navigate]);

	const clearAllFilters = useCallback(() => {
		// Clear URL drill-down params
		navigate({
			to: "/transactions",
			search: {},
			replace: true,
		});
		// Clear focus mode filters (U/M/S)
		toggleFocusMode("all");
	}, [navigate, toggleFocusMode]);

	return { filter, isActive, clearDrillDownFilter, clearAllFilters };
};

export type { DrillDownFilter, UseDrillDownFilterReturn };
