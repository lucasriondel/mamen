import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccountMonthData } from "../../hooks/useAccountMonthData";
import { MonthSlot } from "../MonthSlot";

type AccountMonthGridProps = {
	accountId: number;
	onMonthClick: (monthKey: string, accountId: number) => void;
	onFileDropped: (
		file: File,
		monthKey: string,
		accountId: number,
		transactionCount: number,
	) => void;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

export function AccountMonthGrid({
	accountId,
	onMonthClick,
	onFileDropped,
}: AccountMonthGridProps): React.ReactElement {
	const [year, setYear] = useState(() => new Date().getFullYear());
	const monthCounts = useAccountMonthData(accountId);

	const handlePrevYear = (): void => {
		setYear((y) => y - 1);
	};

	const handleNextYear = (): void => {
		setYear((y) => y + 1);
	};

	const handleMonthClick = (monthKey: string): void => {
		onMonthClick(monthKey, accountId);
	};

	const handleFileDropped = (file: File, monthKey: string): void => {
		const count = monthCounts.get(monthKey) ?? 0;
		onFileDropped(file, monthKey, accountId, count);
	};

	return (
		<div className="mt-3">
			<div className="flex items-center gap-2 mb-2">
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={handlePrevYear}
					aria-label="Previous year"
				>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				<span className="text-sm font-medium min-w-[3rem] text-center">
					{year}
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={handleNextYear}
					aria-label="Next year"
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex gap-2 overflow-x-auto pb-1">
				{MONTHS.map((month) => {
					const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
					return (
						<MonthSlot
							key={monthKey}
							month={month}
							year={year}
							transactionCount={monthCounts.get(monthKey) ?? 0}
							onMonthClick={handleMonthClick}
							onFileDropped={handleFileDropped}
						/>
					);
				})}
			</div>
		</div>
	);
}
