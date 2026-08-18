import { createFileRoute } from "@tanstack/react-router";
import { CategoryTransactionsView } from "@/features/categories/category-transactions-view";
import { validateTransactionsSearch } from "@/features/transactions/search";

/**
 * A category's transactions page (issue #25). Reuses the transactions view's
 * typed search params — account/month filters, date sort, pagination offset — so
 * a filtered/sorted/paged category view is a bookmarkable URL. The `$categoryId`
 * path param names the leaf or folder whose transactions (and total) it shows.
 */
export const Route = createFileRoute("/categories/$categoryId")({
  validateSearch: validateTransactionsSearch,
  component: CategoryTransactionsView,
});
