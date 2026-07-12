import { createFileRoute } from "@tanstack/react-router";
import { validateTransactionsSearch } from "@/features/transactions/search";
import { TransactionsView } from "@/features/transactions/transactions-view";

/**
 * The transactions route (app landing surface). Owns the typed search-param
 * schema — account/month filters, date sort direction, and pagination offset —
 * so a filtered/sorted/paged view is a bookmarkable URL. The view itself reads
 * these params and owns its queries (no Router loader).
 */
export const Route = createFileRoute("/transactions")({
	validateSearch: validateTransactionsSearch,
	component: TransactionsView,
});
