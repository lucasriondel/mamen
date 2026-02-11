import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { queryKeys, transactionsApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDate } from "@/lib/utils/formatDate";

type MatchPreviewListProps = {
	pattern: string;
	maxVisible?: number;
};

export function MatchPreviewList({
	pattern,
	maxVisible = 3,
}: MatchPreviewListProps): React.ReactElement {
	const [expanded, setExpanded] = useState(false);

	const { data: matches = [] } = useQuery({
		queryKey: [
			...queryKeys.transactions.all,
			"matchPreview",
			pattern,
			expanded,
			maxVisible,
		],
		queryFn: async () => {
			if (!pattern) return [];
			try {
				const regex = new RegExp(pattern, "i");
				const allTx = await transactionsApi.getAll();
				return allTx
					.filter((tx) => regex.test(tx.rawMerchantString))
					.slice(0, expanded ? 50 : maxVisible + 1);
			} catch {
				return [];
			}
		},
		enabled: !!pattern,
	});

	const { data: totalCount = 0 } = useQuery({
		queryKey: [...queryKeys.transactions.all, "matchCount", pattern],
		queryFn: async () => {
			if (!pattern) return 0;
			try {
				const regex = new RegExp(pattern, "i");
				const allTx = await transactionsApi.getAll();
				return allTx.filter((tx) => regex.test(tx.rawMerchantString)).length;
			} catch {
				return 0;
			}
		},
		enabled: !!pattern,
	});

	if (!pattern || totalCount === 0) {
		return (
			<p className="text-xs text-muted-foreground" aria-live="polite">
				No matching transactions
			</p>
		);
	}

	const visibleMatches = expanded ? matches : matches.slice(0, maxVisible);
	const remaining = totalCount - maxVisible;

	return (
		<div className="space-y-1">
			<p className="text-xs font-medium" aria-live="polite">
				{totalCount} transaction{totalCount !== 1 ? "s" : ""} will match
			</p>
			<div className="space-y-0.5">
				{visibleMatches.map((tx) => (
					<div
						key={tx.id}
						className="flex items-center gap-2 text-xs text-muted-foreground"
					>
						<span className="truncate flex-1 font-mono">
							{tx.rawMerchantString}
						</span>
						<span className="shrink-0">{formatDate(tx.date)}</span>
						<span className="shrink-0 font-mono">
							{formatCurrency(tx.amount)}
						</span>
					</div>
				))}
			</div>
			{!expanded && remaining > 0 && (
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto p-0 text-xs"
					onClick={() => setExpanded(true)}
				>
					... and {remaining} more
				</Button>
			)}
			{expanded && remaining > 0 && (
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto p-0 text-xs"
					onClick={() => setExpanded(false)}
				>
					Show less
				</Button>
			)}
		</div>
	);
}
