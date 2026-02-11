import { Check } from "lucide-react";
import { useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type MonthSlotProps = {
	month: number;
	year: number;
	transactionCount: number;
	onMonthClick: (monthKey: string) => void;
	onFileDropped: (file: File, monthKey: string) => void;
};

const MONTH_LABELS = [
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
] as const;

function formatMonthKey(year: number, month: number): string {
	return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function MonthSlot({
	month,
	year,
	transactionCount,
	onMonthClick,
	onFileDropped,
}: MonthSlotProps): React.ReactElement {
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const monthKey = formatMonthKey(year, month);
	const isImported = transactionCount > 0;

	const handleClick = (): void => {
		if (isImported) {
			onMonthClick(monthKey);
		} else {
			fileInputRef.current?.click();
		}
	};

	const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
		const files = e.target.files;
		if (files && files.length > 0) {
			onFileDropped(files[0], monthKey);
		}
		// Reset so the same file can be re-selected
		e.target.value = "";
	};

	const handleDragOver = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		const files = e.dataTransfer.files;
		if (files.length > 0) {
			onFileDropped(files[0], monthKey);
		}
	};

	const slotContent = (
		<div className="relative">
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,.pdf"
				className="hidden"
				onChange={handleFileInput}
				data-testid={`file-input-${monthKey}`}
			/>
			<button
				type="button"
				className={cn(
					"flex flex-col items-center justify-center gap-1 rounded-md p-2 min-w-[80px] h-[80px] transition-colors",
					isImported
						? "border border-border cursor-pointer hover:bg-accent"
						: "border border-dashed border-muted-foreground/30 cursor-pointer hover:border-muted-foreground/50",
					isDragOver && "border-ring border-solid bg-accent/50",
				)}
				onClick={handleClick}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				data-testid={`month-slot-${monthKey}`}
				aria-label={
					isImported
						? `${MONTH_LABELS[month]} ${year}: ${transactionCount} transactions`
						: `${MONTH_LABELS[month]} ${year}: Browse files or drop statement here`
				}
			>
				<span className="text-xs font-medium">{MONTH_LABELS[month]}</span>
				{isDragOver ? (
					<span className="text-xs text-ring font-medium">Drop here</span>
				) : isImported ? (
					<>
						<Check className="h-4 w-4 text-green-500" />
						<span className="text-xs text-muted-foreground">
							{transactionCount}
						</span>
					</>
				) : null}
			</button>
		</div>
	);

	if (!isImported && !isDragOver) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>{slotContent}</TooltipTrigger>
					<TooltipContent>Drop statement here</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return slotContent;
}
