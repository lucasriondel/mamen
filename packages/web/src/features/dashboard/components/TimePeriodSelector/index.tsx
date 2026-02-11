import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { TimePeriod, TimePeriodPreset } from "../../types";

type TimePeriodSelectorProps = {
	selectedPeriod: TimePeriod;
	periodLabel: string;
	onSelect: (period: TimePeriod) => void;
};

const PRESETS: { value: TimePeriodPreset; label: string }[] = [
	{ value: "this-month", label: "This Month" },
	{ value: "last-month", label: "Last Month" },
	{ value: "last-3-months", label: "Last 3 Months" },
	{ value: "this-year", label: "This Year" },
];

export function TimePeriodSelector({
	selectedPeriod,
	periodLabel,
	onSelect,
}: TimePeriodSelectorProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const [showCustom, setShowCustom] = useState(false);
	const [customStart, setCustomStart] = useState("");
	const [customEnd, setCustomEnd] = useState("");
	const [customError, setCustomError] = useState("");
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const listRef = useRef<HTMLDivElement>(null);

	const totalOptions = PRESETS.length + 1; // presets + custom range

	const resetCustom = useCallback(() => {
		setShowCustom(false);
		setCustomStart("");
		setCustomEnd("");
		setCustomError("");
	}, []);

	useEffect(() => {
		if (!open) {
			resetCustom();
			setFocusedIndex(-1);
		}
	}, [open, resetCustom]);

	const handlePresetSelect = (preset: TimePeriodPreset) => {
		onSelect({ type: preset });
		setOpen(false);
	};

	const handleCustomApply = () => {
		if (!customStart || !customEnd) {
			setCustomError("Both dates are required");
			return;
		}

		const start = new Date(`${customStart}T00:00:00`);
		const end = new Date(`${customEnd}T23:59:59.999`);

		if (start >= end) {
			setCustomError("Start date must be before end date");
			return;
		}

		onSelect({ type: "custom", startDate: start, endDate: end });
		setOpen(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (showCustom) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setFocusedIndex((i) => (i + 1) % totalOptions);
				break;
			case "ArrowUp":
				e.preventDefault();
				setFocusedIndex((i) => (i - 1 + totalOptions) % totalOptions);
				break;
			case "Enter":
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < PRESETS.length) {
					handlePresetSelect(PRESETS[focusedIndex].value);
				} else if (focusedIndex === PRESETS.length) {
					setShowCustom(true);
				}
				break;
			case "Escape":
				e.preventDefault();
				setOpen(false);
				break;
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="gap-2">
					{periodLabel}
					<ChevronDown className="size-4 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-64 p-0"
				align="start"
				onKeyDown={handleKeyDown}
			>
				{showCustom ? (
					<div className="p-3 space-y-3">
						<button
							type="button"
							className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
							onClick={resetCustom}
						>
							<ArrowLeft className="size-3" />
							Back to presets
						</button>

						<div className="space-y-2">
							<label className="block text-sm">
								Start
								<input
									type="date"
									value={customStart}
									onChange={(e) => {
										setCustomStart(e.target.value);
										setCustomError("");
									}}
									className="mt-1 block w-full rounded-md border bg-background px-2 py-1 text-sm"
								/>
							</label>
							<label className="block text-sm">
								End
								<input
									type="date"
									value={customEnd}
									onChange={(e) => {
										setCustomEnd(e.target.value);
										setCustomError("");
									}}
									className="mt-1 block w-full rounded-md border bg-background px-2 py-1 text-sm"
								/>
							</label>
						</div>

						{customError && (
							<p className="text-sm text-destructive">{customError}</p>
						)}

						<div className="flex gap-2 justify-end">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									resetCustom();
								}}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={handleCustomApply}>
								Apply
							</Button>
						</div>
					</div>
				) : (
					<div ref={listRef} role="listbox" className="py-1">
						{PRESETS.map((preset, index) => {
							const isSelected = selectedPeriod.type === preset.value;
							const isFocused = focusedIndex === index;
							return (
								<button
									key={preset.value}
									role="option"
									aria-selected={isSelected}
									type="button"
									className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent ${
										isFocused ? "bg-accent" : ""
									}`}
									onClick={() => handlePresetSelect(preset.value)}
								>
									{preset.label}
									{isSelected && <Check className="size-4" />}
								</button>
							);
						})}
						<div className="mx-3 my-1 border-t" />
						<button
							type="button"
							role="option"
							aria-selected={selectedPeriod.type === "custom"}
							className={`flex w-full items-center px-3 py-2 text-sm hover:bg-accent ${
								focusedIndex === PRESETS.length ? "bg-accent" : ""
							}`}
							onClick={() => setShowCustom(true)}
						>
							Custom Range...
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
