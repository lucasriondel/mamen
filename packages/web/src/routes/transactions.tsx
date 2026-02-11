import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { z } from "zod";
import { TransactionList } from "@/features/transactions";

const transactionSearchSchema = z.object({
	highlight: z.coerce.number().optional(),
	categoryId: z.coerce.number().optional(),
	periodStart: z.string().optional(),
	periodEnd: z.string().optional(),
	from: z.string().optional(),
});

export const Route = createFileRoute("/transactions")({
	component: TransactionsLayout,
	validateSearch: transactionSearchSchema,
});

function TransactionsLayout(): React.ReactElement {
	const childMatch = useMatch({
		from: "/transactions/unmatched",
		shouldThrow: false,
	});

	if (childMatch) {
		return <Outlet />;
	}

	return <TransactionsPage />;
}

function TransactionsPage(): React.ReactElement {
	const { highlight } = Route.useSearch();

	return (
		<div className="flex flex-col h-full -m-6">
			<div className="px-6 py-4 border-b">
				<h2 className="text-2xl font-bold">Transactions</h2>
			</div>
			<div className="flex-1 min-h-0">
				<TransactionList highlightId={highlight} />
			</div>
			<div className="flex justify-center gap-6 text-xs text-muted-foreground bg-background/80 backdrop-blur px-4 py-2 border-t">
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">J</kbd>/
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">K</kbd>{" "}
					Navigate
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
						Enter
					</kbd>{" "}
					Select
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>{" "}
					Clear
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">R</kbd>{" "}
					Create Rule
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">C</kbd>{" "}
					Category
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">F</kbd>{" "}
					Refund
				</span>
				<span>
					<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">D</kbd>{" "}
					Delete
				</span>
			</div>
		</div>
	);
}
