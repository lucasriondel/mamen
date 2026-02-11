import { AlertTriangle } from "lucide-react";
import { TransactionRow } from "@/components/TransactionRow";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Transaction } from "@/types";
import type {
	CategoryDistribution,
	TimePeriod,
} from "../../hooks/useMerchantDetail";

export type MerchantTransactionListProps = {
	transactions: Transaction[];
	categoryDistribution: CategoryDistribution;
	isMixed: boolean;
	timePeriod: TimePeriod;
	onTimePeriodChange: (period: TimePeriod) => void;
};

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
	"this-month": "This Month",
	"last-month": "Last Month",
	"last-3-months": "Last 3 Months",
	"this-year": "This Year",
	"all-time": "All Time",
};

export function MerchantTransactionList({
	transactions,
	categoryDistribution,
	isMixed,
	timePeriod,
	onTimePeriodChange,
}: MerchantTransactionListProps): React.ReactElement {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Transactions</h2>
				<Select
					value={timePeriod}
					onValueChange={(v) => onTimePeriodChange(v as TimePeriod)}
				>
					<SelectTrigger className="w-[160px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.entries(TIME_PERIOD_LABELS) as [TimePeriod, string][]).map(
							([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							),
						)}
					</SelectContent>
				</Select>
			</div>

			{isMixed && (
				<div className="flex items-start gap-2 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
					<AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
					<div>
						<p className="font-medium text-amber-500">
							Mixed categories:{" "}
							{categoryDistribution
								.map((c) => `${c.count} ${c.categoryLabel}`)
								.join(", ")}
						</p>
						<p className="text-muted-foreground text-xs mt-0.5">
							This is expected — override rules assign different categories
						</p>
					</div>
				</div>
			)}

			{transactions.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground">
					No transactions for this period
				</div>
			) : (
				<div className="border rounded-lg divide-y">
					{transactions.map((tx) => (
						<TransactionRow key={tx.id} transaction={tx} />
					))}
				</div>
			)}
		</div>
	);
}
