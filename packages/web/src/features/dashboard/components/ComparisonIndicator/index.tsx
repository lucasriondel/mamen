import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import type { ComparisonResult } from "../../utils/computeComparison";

type ComparisonIndicatorProps = {
	comparison: ComparisonResult | undefined;
	label: string;
	size?: "sm" | "md";
};

export function ComparisonIndicator({
	comparison,
	label,
	size = "md",
}: ComparisonIndicatorProps): React.ReactElement {
	if (!comparison) {
		return (
			<div
				data-testid="comparison-indicator"
				className="flex items-center gap-1 text-muted-foreground text-sm"
			>
				<Minus className="h-3.5 w-3.5" />
				<span>No previous data to compare</span>
			</div>
		);
	}

	const isSm = size === "sm";
	const iconSize = isSm ? "h-3 w-3" : "h-3.5 w-3.5";
	const textSize = isSm ? "text-xs" : "text-sm";

	// "New" for sm when category didn't exist before
	if (isSm && !comparison.hasPreviousData) {
		return (
			<div
				data-testid="comparison-indicator"
				className={`flex items-center gap-1 text-muted-foreground ${textSize}`}
			>
				<span>New</span>
			</div>
		);
	}

	if (comparison.direction === "flat") {
		return (
			<div
				data-testid="comparison-indicator"
				className={`flex items-center gap-1 text-muted-foreground ${textSize}`}
			>
				<Minus className={iconSize} />
				<span>No change {label}</span>
			</div>
		);
	}

	const isUp = comparison.direction === "up";
	const Icon = isUp ? TrendingUp : TrendingDown;
	const colorClass = isUp ? "text-destructive" : "text-green-500";
	const sign = isUp ? "+" : "";
	const pctStr = `${sign}${Math.round(comparison.percentageChange)}%`;

	if (isSm) {
		return (
			<div
				data-testid="comparison-indicator"
				className={`flex items-center gap-1 ${colorClass} ${textSize}`}
			>
				<Icon className={iconSize} />
				<span>{pctStr}</span>
			</div>
		);
	}

	const amtStr = `${sign}${formatCurrency(Math.abs(comparison.absoluteChange))}`;

	return (
		<div
			data-testid="comparison-indicator"
			className={`flex items-center gap-1 ${colorClass} ${textSize}`}
		>
			<Icon className={iconSize} />
			<span className="font-mono tabular-nums">{amtStr}</span>
			<span>({pctStr})</span>
			<span className="text-muted-foreground">{label}</span>
		</div>
	);
}
