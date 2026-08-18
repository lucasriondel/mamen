import { createFileRoute } from "@tanstack/react-router";
import { TransactionDetailPage } from "@/features/transactions/transaction-detail-page";

/**
 * A single transaction's detail page (`/transactions/$transactionId`). Reached by
 * clicking a row in the transactions grid; shows every field the app holds for the
 * transaction. The `$transactionId` path param names the row, and the page owns
 * its own `getById` query (no Router loader) so a read failure shows an inline
 * not-found state.
 */
export const Route = createFileRoute("/transactions_/$transactionId")({
  component: TransactionDetailPage,
});
