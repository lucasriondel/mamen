import { createFileRoute } from "@tanstack/react-router";
import { TransactionDetailPanel } from "@/features/transactions/components/TransactionDetailPanel";

export const Route = createFileRoute("/transactions/$transactionId")({
	component: TransactionDetailRoute,
});

function TransactionDetailRoute(): React.ReactElement {
	const { transactionId } = Route.useParams();

	return <TransactionDetailPanel transactionId={Number(transactionId)} />;
}
