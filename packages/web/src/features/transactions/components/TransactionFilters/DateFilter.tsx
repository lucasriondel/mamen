import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { TransactionFilterValues } from "../../hooks/useTransactionFilters";

type DateFilterProps = {
	filterValues: TransactionFilterValues;
	onDateExact: (date: Date | undefined) => void;
	onDateRange: (start?: Date, end?: Date) => void;
	onMonthYear: (monthYear: { month: number; year: number } | undefined) => void;
	onClear: () => void;
};

const MONTHS = [
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

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

export function DateFilter({
	filterValues,
	onDateExact,
	onDateRange,
	onMonthYear,
	onClear,
}: DateFilterProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"exact" | "range" | "month">(
		filterValues.dateMode ?? "exact",
	);
	const [exactDate, setExactDate] = useState<Date | undefined>(
		filterValues.dateExact,
	);
	const [rangeValue, setRangeValue] = useState<DateRange | undefined>(
		filterValues.dateStart || filterValues.dateEnd
			? { from: filterValues.dateStart, to: filterValues.dateEnd }
			: undefined,
	);
	const [selectedMonth, setSelectedMonth] = useState<string>(
		filterValues.monthYear?.month?.toString() ?? "",
	);
	const [selectedYear, setSelectedYear] = useState<string>(
		filterValues.monthYear?.year?.toString() ?? "",
	);

	const isActive = filterValues.dateMode != null;

	const handleApply = () => {
		if (mode === "exact" && exactDate) {
			onDateExact(exactDate);
		} else if (mode === "range" && rangeValue?.from) {
			onDateRange(rangeValue.from, rangeValue.to);
		} else if (mode === "month" && selectedMonth && selectedYear) {
			onMonthYear({
				month: parseInt(selectedMonth, 10),
				year: parseInt(selectedYear, 10),
			});
		}
		setOpen(false);
	};

	const handleClear = () => {
		setExactDate(undefined);
		setRangeValue(undefined);
		setSelectedMonth("");
		setSelectedYear("");
		setMode("exact");
		onClear();
		setOpen(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (next) {
			setMode(filterValues.dateMode ?? "exact");
			setExactDate(filterValues.dateExact);
			setRangeValue(
				filterValues.dateStart || filterValues.dateEnd
					? { from: filterValues.dateStart, to: filterValues.dateEnd }
					: undefined,
			);
			setSelectedMonth(filterValues.monthYear?.month?.toString() ?? "");
			setSelectedYear(filterValues.monthYear?.year?.toString() ?? "");
		}
		setOpen(next);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant={isActive ? "default" : "outline"}
					size="sm"
					className="h-8 gap-1.5 text-xs"
				>
					<CalendarDays className="h-3.5 w-3.5" />
					Date
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<div className="flex flex-col gap-3 p-3">
					<RadioGroup
						value={mode}
						onValueChange={(v) => setMode(v as "exact" | "range" | "month")}
					>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="exact" id="date-exact" />
							<Label htmlFor="date-exact" className="text-xs font-normal">
								Exact date
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="range" id="date-range" />
							<Label htmlFor="date-range" className="text-xs font-normal">
								Date range
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="month" id="date-month" />
							<Label htmlFor="date-month" className="text-xs font-normal">
								Month + Year
							</Label>
						</div>
					</RadioGroup>
				</div>

				{mode === "exact" && (
					<Calendar
						mode="single"
						selected={exactDate}
						onSelect={setExactDate}
					/>
				)}

				{mode === "range" && (
					<Calendar
						mode="range"
						selected={rangeValue}
						onSelect={setRangeValue}
					/>
				)}

				{mode === "month" && (
					<div className="flex gap-2 px-3 pb-1">
						<Select value={selectedMonth} onValueChange={setSelectedMonth}>
							<SelectTrigger size="sm" className="flex-1 text-xs">
								<SelectValue placeholder="Month" />
							</SelectTrigger>
							<SelectContent>
								{MONTHS.map((m, i) => (
									<SelectItem key={m} value={String(i)}>
										{m}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={selectedYear} onValueChange={setSelectedYear}>
							<SelectTrigger size="sm" className="w-20 text-xs">
								<SelectValue placeholder="Year" />
							</SelectTrigger>
							<SelectContent>
								{YEARS.map((y) => (
									<SelectItem key={y} value={String(y)}>
										{y}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="flex justify-between border-t p-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={handleClear}
					>
						Clear
					</Button>
					<Button size="sm" className="h-7 text-xs" onClick={handleApply}>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
