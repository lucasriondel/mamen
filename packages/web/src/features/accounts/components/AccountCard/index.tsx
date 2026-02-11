import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryKeys, transactionsApi } from "@/lib/api";
import type { Account } from "@/types";

type AccountCardProps = {
	account: Account;
	onEdit: (account: Account) => void;
	onDelete?: (account: Account) => void;
};

const accountTypeLabels: Record<string, string> = {
	checking: "Checking",
	savings: "Savings",
	credit_card: "Credit Card",
	other: "Other",
};

export function AccountCard({
	account,
	onEdit,
	onDelete,
}: AccountCardProps): React.ReactElement {
	const { data: transactionCount = 0 } = useQuery({
		queryKey: queryKeys.transactions.count({ accountId: account.id }),
		queryFn: () => transactionsApi.count({ accountId: account.id! }),
		enabled: account.id !== undefined,
	});

	const handleEdit = (): void => {
		onEdit(account);
	};

	const handleDelete = (): void => {
		onDelete?.(account);
	};

	return (
		<Card>
			<CardContent className="flex items-center justify-between py-0">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="font-semibold">{account.name}</span>
						<Badge variant="secondary">
							{accountTypeLabels[account.type] ?? account.type}
						</Badge>
					</div>
					<span className="text-sm text-muted-foreground">
						{transactionCount}{" "}
						{transactionCount === 1 ? "transaction" : "transactions"}
					</span>
				</div>
				<div className="flex gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={handleEdit}
						aria-label="Edit account"
					>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={handleDelete}
						aria-label="Delete account"
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
