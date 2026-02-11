import { DollarSign } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TransactionFilterValues } from "../../hooks/useTransactionFilters";

type AmountFilterProps = {
	filterValues: TransactionFilterValues;
	onAmountRange: (min?: number, max?: number) => void;
	onAmountPrecise: (value: number | undefined) => void;
	onClear: () => void;
};

export function AmountFilter({
	filterValues,
	onAmountRange,
	onAmountPrecise,
	onClear,
}: AmountFilterProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"range" | "precise">(
		filterValues.amountMode ?? "range",
	);
	const [min, setMin] = useState(filterValues.amountMin?.toString() ?? "");
	const [max, setMax] = useState(filterValues.amountMax?.toString() ?? "");
	const [precise, setPrecise] = useState(
		filterValues.amountPrecise?.toString() ?? "",
	);

	const isActive = filterValues.amountMode != null;

	const handleApply = () => {
		if (mode === "precise") {
			const val = parseFloat(precise);
			if (!isNaN(val)) {
				onAmountPrecise(val);
			}
		} else {
			const minVal = min ? parseFloat(min) : undefined;
			const maxVal = max ? parseFloat(max) : undefined;
			if (minVal != null || maxVal != null) {
				onAmountRange(
					minVal != null && !isNaN(minVal) ? minVal : undefined,
					maxVal != null && !isNaN(maxVal) ? maxVal : undefined,
				);
			}
		}
		setOpen(false);
	};

	const handleClear = () => {
		setMin("");
		setMax("");
		setPrecise("");
		setMode("range");
		onClear();
		setOpen(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (next) {
			setMode(filterValues.amountMode ?? "range");
			setMin(filterValues.amountMin?.toString() ?? "");
			setMax(filterValues.amountMax?.toString() ?? "");
			setPrecise(filterValues.amountPrecise?.toString() ?? "");
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
					<DollarSign className="h-3.5 w-3.5" />
					Amount
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64" align="start">
				<div className="flex flex-col gap-3">
					<RadioGroup
						value={mode}
						onValueChange={(v) => setMode(v as "range" | "precise")}
					>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="range" id="amount-range" />
							<Label htmlFor="amount-range" className="text-xs font-normal">
								Range
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="precise" id="amount-precise" />
							<Label htmlFor="amount-precise" className="text-xs font-normal">
								Exact amount
							</Label>
						</div>
					</RadioGroup>

					{mode === "range" ? (
						<div className="flex items-center gap-2">
							<Input
								type="number"
								placeholder="Min"
								value={min}
								onChange={(e) => setMin(e.target.value)}
								className="h-8 text-xs"
							/>
							<span className="text-xs text-muted-foreground">to</span>
							<Input
								type="number"
								placeholder="Max"
								value={max}
								onChange={(e) => setMax(e.target.value)}
								className="h-8 text-xs"
							/>
						</div>
					) : (
						<Input
							type="number"
							placeholder="Amount"
							value={precise}
							onChange={(e) => setPrecise(e.target.value)}
							className="h-8 text-xs"
						/>
					)}

					<div className="flex justify-between">
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
				</div>
			</PopoverContent>
		</Popover>
	);
}
