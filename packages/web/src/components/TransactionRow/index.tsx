import { CheckIcon, Link2 } from "lucide-react";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Badge } from "@/components/ui/badge";
import { AnomalyBadge } from "@/features/anomalies/components/AnomalyBadge";
import { NewMerchantBadge } from "@/features/merchants/components/NewMerchantBadge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDate } from "@/lib/utils/formatDate";
import type { AnomalyType, Transaction } from "@/types";

export type TransactionRowProps = {
	transaction: Transaction;
	isFocused?: boolean;
	isSelected?: boolean;
	isHighlighted?: boolean;
	badgeAnimating?: boolean;
	cascadeIndex?: number;
	merchantCreatedAt?: Date | null;
	onClick?: () => void;
	onLinkClick?: (linkedTransactionId: number) => void;
	onDismissAnomaly?: (transactionId: number, anomalyType: AnomalyType) => void;
	onDismissDuplicate?: (transactionId: number) => void;
	onExcludeDuplicate?: (transactionId: number) => void;
	onViewLinked?: (linkedTransactionId: number) => void;
};

const STAGGER_MS = 50;

export function TransactionRow({
	transaction,
	isFocused = false,
	isSelected = false,
	isHighlighted = false,
	badgeAnimating = false,
	cascadeIndex,
	merchantCreatedAt,
	onClick,
	onLinkClick,
	onDismissAnomaly,
	onDismissDuplicate,
	onExcludeDuplicate,
	onViewLinked,
}: TransactionRowProps): React.ReactElement {
	const isUnmatched = !transaction.merchantId && !transaction.manualCategory;
	const isDuplicateExcluded = transaction.isDuplicateExcluded === true;

	const rowStyle: React.CSSProperties = {
		...(isHighlighted && cascadeIndex !== undefined
			? ({
					"--cascade-delay": `${cascadeIndex * STAGGER_MS}ms`,
				} as React.CSSProperties)
			: {}),
		...(isSelected ? { backgroundColor: "hsl(var(--ring) / 0.08)" } : {}),
		...(isSelected && isFocused
			? { backgroundColor: "hsl(var(--ring) / 0.12)" }
			: {}),
	};

	return (
		<div
			className={cn(
				"flex items-center h-12 px-4 gap-4 cursor-pointer",
				"hover:bg-muted/50 transition-colors duration-100",
				isFocused &&
					"ring-2 ring-ring ring-offset-2 ring-offset-background z-10",
				isSelected && "border-l-2 border-ring",
				!isFocused &&
					!isSelected &&
					isUnmatched &&
					"border-l-2 border-amber-500/50",
				isHighlighted && "cascade-highlight",
				isDuplicateExcluded && "opacity-50",
			)}
			style={rowStyle}
			onClick={onClick}
			role="row"
			tabIndex={0}
			aria-selected={isSelected}
		>
			{isSelected && (
				<div
					className="shrink-0 w-5 h-5 rounded-sm bg-ring flex items-center justify-center -ml-1"
					data-testid="selection-checkbox"
				>
					<CheckIcon className="w-3 h-3 text-background" />
				</div>
			)}
			<div
				className={cn(
					"w-20 text-sm text-muted-foreground shrink-0",
					isSelected && "w-16",
				)}
			>
				{formatDate(transaction.date)}
			</div>

			<div className="flex-1 min-w-0 flex items-center gap-1.5 text-sm">
				<span className="truncate">{transaction.rawMerchantString}</span>
				{merchantCreatedAt && (
					<NewMerchantBadge createdAt={merchantCreatedAt} size="sm" />
				)}
			</div>

			<div className="w-32 shrink-0 flex items-center gap-1">
				{isUnmatched ? (
					<Badge
						variant="outline"
						className="text-amber-500 border-amber-500/50"
					>
						Unmatched
					</Badge>
				) : transaction.categoryId ? (
					<>
						<span className={cn(badgeAnimating && "badge-cascade-enter")}>
							<CategoryBadge
								categoryId={transaction.categoryId}
								subcategoryId={transaction.subcategoryId}
							/>
						</span>
						{transaction.manualCategory && (
							<Badge
								variant="outline"
								className="text-xs h-5 text-muted-foreground border-dashed"
							>
								Manual
							</Badge>
						)}
					</>
				) : (
					<Badge variant="secondary">Matched</Badge>
				)}
			</div>

			{isDuplicateExcluded && (
				<Badge
					variant="outline"
					className="border-muted-foreground/30 bg-muted/50 text-muted-foreground text-[10px] px-1.5 py-0"
					data-testid="excluded-duplicate-badge"
				>
					Excluded duplicate
				</Badge>
			)}

			{transaction.anomalyFlags && transaction.anomalyFlags.length > 0 && (
				<AnomalyBadge
					flags={transaction.anomalyFlags}
					onDismiss={(type) => onDismissAnomaly?.(transaction.id!, type)}
					onDismissDuplicate={() => onDismissDuplicate?.(transaction.id!)}
					onExcludeDuplicate={() => onExcludeDuplicate?.(transaction.id!)}
					onViewLinked={onViewLinked}
				/>
			)}

			<div
				className={cn(
					"w-24 text-right font-mono text-sm shrink-0 flex items-center justify-end gap-1",
					transaction.amount < 0 ? "text-foreground" : "text-green-500",
				)}
			>
				{transaction.isRefund && (
					<Badge
						variant="outline"
						className="border-green-500/50 bg-green-500/10 text-green-500 text-[10px] px-1 py-0"
						data-testid="refund-badge"
					>
						Refund
					</Badge>
				)}
				{transaction.linkedRefundId && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onLinkClick?.(transaction.linkedRefundId!);
						}}
						className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
						aria-label={`Navigate to linked ${transaction.isRefund ? "purchase" : "refund"}`}
						data-testid="link-icon"
					>
						<Link2 className="h-3 w-3" />
					</button>
				)}
				<span>{formatCurrency(transaction.amount)}</span>
			</div>
		</div>
	);
}
