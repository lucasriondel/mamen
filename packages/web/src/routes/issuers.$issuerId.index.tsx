import { createFileRoute } from "@tanstack/react-router";
import { IssuerDetailPage } from "@/features/issuers/issuer-detail-page";
import { validateTransactionsSearch } from "@/features/transactions/search";

/**
 * An issuer's detail page. Reuses the transactions view's typed search params —
 * account/month/text filters, date sort, pagination offset — so the issuer's
 * transactions table behaves (and bookmarks) exactly like the global one.
 */
export const Route = createFileRoute("/issuers/$issuerId/")({
	validateSearch: validateTransactionsSearch,
	component: IssuerDetailPage,
});
