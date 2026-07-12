import { createFileRoute } from "@tanstack/react-router";
import { TransactionsView } from "@/features/transactions/transactions-view";

export const Route = createFileRoute("/transactions")({
	component: TransactionsView,
});
