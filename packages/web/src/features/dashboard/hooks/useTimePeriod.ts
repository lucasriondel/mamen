import { useMemo, useState } from "react";
import type { ResolvedDateRange, TimePeriod } from "../types";
import {
	getTimePeriodLabel,
	resolveTimePeriod,
} from "../utils/resolveTimePeriod";

export const useTimePeriod = () => {
	const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>({
		type: "this-month",
	});

	const resolvedRange: ResolvedDateRange = useMemo(
		() => resolveTimePeriod(selectedPeriod),
		[selectedPeriod],
	);

	const periodLabel = useMemo(
		() => getTimePeriodLabel(selectedPeriod),
		[selectedPeriod],
	);

	return { selectedPeriod, setSelectedPeriod, resolvedRange, periodLabel };
};
