import { createFileRoute } from "@tanstack/react-router";
import { validateIssuerDetailSearch } from "@/features/issuers/detail-search";
import { IssuerDetailPage } from "@/features/issuers/issuer-detail-page";

/**
 * An issuer's detail page. Reuses the transactions view's typed search params —
 * account/month/text filters, date sort, pagination offset — so the issuer's
 * transactions table behaves (and bookmarks) exactly like the global one, and
 * adds this page's own `tab`; see `validateIssuerDetailSearch` for both.
 */
export const Route = createFileRoute("/issuers/$issuerId/")({
  validateSearch: validateIssuerDetailSearch,
  component: IssuerDetailPage,
});
