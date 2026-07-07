import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Building2, Calendar, CreditCard, Tag, X } from "lucide-react";
import { CategoryBadge } from "@/components/CategoryBadge";
import { MerchantAvatar } from "@/components/MerchantAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnomalyBadge } from "@/features/anomalies/components/AnomalyBadge";
import {
	accountsApi,
	merchantsApi,
	queryKeys,
	transactionsApi,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDate } from "@/lib/utils/formatDate";

type TransactionDetailPanelProps = {
	transactionId: number;
};

export function TransactionDetailPanel({
	transactionId,
}: TransactionDetailPanelProps): React.ReactElement {
	const navigate = useNavigate();

	const { data: transaction, isLoading } = useQuery({
		queryKey: [...queryKeys.transactions.all, "detail", transactionId],
		queryFn: () => transactionsApi.get(transactionId),
	});

	const { data: merchant } = useQuery({
		queryKey: [...queryKeys.merchants.all, "detail", transaction?.merchantId],
		queryFn: () => merchantsApi.get(transaction!.merchantId!),
		enabled: !!transaction?.merchantId,
	});

	const { data: account } = useQuery({
		queryKey: [...queryKeys.accounts.all, "detail", transaction?.accountId],
		queryFn: () => accountsApi.get(transaction!.accountId),
		enabled: !!transaction,
	});

	const handleClose = (): void => {
		navigate({ to: "/transactions", search: (prev) => prev });
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
				Loading...
			</div>
		);
	}

	if (!transaction) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
				<p className="text-sm">Transaction not found</p>
				<Button variant="outline" size="sm" onClick={handleClose}>
					Close
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b">
				<h3 className="text-sm font-semibold">Transaction Details</h3>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={handleClose}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto px-4 py-4 space-y-6">
				{/* Amount hero */}
				<div className="text-center">
					<p
						className={`text-3xl font-bold font-mono ${transaction.amount < 0 ? "text-foreground" : "text-green-500"}`}
					>
						{formatCurrency(transaction.amount)}
					</p>
					{transaction.isRefund && (
						<Badge
							variant="outline"
							className="mt-1 border-green-500/50 bg-green-500/10 text-green-500"
						>
							Refund
						</Badge>
					)}
				</div>

				{/* Merchant info */}
				<div className="space-y-3">
					{merchant ? (
						<div className="flex items-center gap-3">
							<MerchantAvatar
								name={merchant.name}
								imageUrl={merchant.imageUrl}
								size="lg"
							/>
							<div className="min-w-0">
								<p className="font-medium truncate">{merchant.name}</p>
								<p className="text-xs text-muted-foreground truncate">
									{transaction.rawMerchantString}
								</p>
							</div>
						</div>
					) : (
						<div className="flex items-center gap-3">
							<div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
								<Building2 className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<p className="font-medium truncate">
									{transaction.rawMerchantString}
								</p>
								<p className="text-xs text-muted-foreground">
									Unmatched merchant
								</p>
							</div>
						</div>
					)}
				</div>

				{/* Details grid */}
				<div className="space-y-3">
					<DetailRow
						icon={<Calendar className="h-4 w-4" />}
						label="Date"
						value={formatDate(transaction.date)}
					/>

					<DetailRow
						icon={<CreditCard className="h-4 w-4" />}
						label="Account"
						value={account?.name ?? "Unknown"}
					/>

					<DetailRow icon={<Tag className="h-4 w-4" />} label="Category">
						{transaction.categoryId ? (
							<div className="flex items-center gap-1.5">
								<CategoryBadge
									categoryId={transaction.categoryId}
									subcategoryId={transaction.subcategoryId}
								/>
								{transaction.manualCategory && (
									<Badge
										variant="outline"
										className="text-xs h-5 text-muted-foreground border-dashed"
									>
										Manual
									</Badge>
								)}
							</div>
						) : (
							<Badge
								variant="outline"
								className="text-amber-500 border-amber-500/50"
							>
								Unmatched
							</Badge>
						)}
					</DetailRow>
				</div>

				{/* Anomaly flags */}
				{transaction.anomalyFlags && transaction.anomalyFlags.length > 0 && (
					<div className="space-y-2">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Alerts
						</p>
						<AnomalyBadge
							flags={transaction.anomalyFlags}
							onDismiss={() => {}}
							onDismissDuplicate={() => {}}
							onExcludeDuplicate={() => {}}
							onViewLinked={() => {}}
						/>
					</div>
				)}

				{/* Metadata */}
				<div className="space-y-2 pt-2 border-t">
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Import Info
					</p>
					<div className="text-xs text-muted-foreground space-y-1">
						<p>Import month: {transaction.importMonth}</p>
						<p>
							Imported: {new Date(transaction.importedAt).toLocaleDateString()}
						</p>
						{transaction.isDuplicateExcluded && (
							<Badge
								variant="outline"
								className="border-muted-foreground/30 bg-muted/50 text-muted-foreground text-[10px]"
							>
								Excluded duplicate
							</Badge>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function DetailRow({
	icon,
	label,
	value,
	children,
}: {
	icon: React.ReactNode;
	label: string;
	value?: string;
	children?: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="flex items-center gap-3">
			<div className="text-muted-foreground">{icon}</div>
			<div className="flex-1 min-w-0">
				<p className="text-xs text-muted-foreground">{label}</p>
				{children ?? <p className="text-sm font-medium">{value}</p>}
			</div>
		</div>
	);
}
