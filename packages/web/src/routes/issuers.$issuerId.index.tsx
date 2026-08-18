import { createFileRoute } from "@tanstack/react-router";
import { IssuerDetailPage } from "@/features/issuers/issuer-detail-page";
import {
  DEFAULT_ISSUER_TAB,
  type IssuerTab,
  parseIssuerTab,
} from "@/features/issuers/issuer-detail-tabs";
import {
  type TransactionsSearch,
  validateTransactionsSearch,
} from "@/features/transactions/search";

/** This route's search: the transactions view's params, plus the open panel. */
export interface IssuerDetailSearch extends TransactionsSearch {
  /** Which panel is showing. Absent means {@link DEFAULT_ISSUER_TAB}. */
  tab?: IssuerTab;
}

/**
 * An issuer's detail page. Reuses the transactions view's typed search params —
 * account/month/text filters, date sort, pagination offset — so the issuer's
 * transactions table behaves (and bookmarks) exactly like the global one, and
 * adds this page's own `tab`.
 *
 * The default tab is normalized *out* of the URL rather than into it: a bare
 * `/issuers/1` and `/issuers/1?tab=transactions` are the same view, so only the
 * two non-default panels ever name themselves.
 */
export const Route = createFileRoute("/issuers/$issuerId/")({
  validateSearch: (search: Record<string, unknown>): IssuerDetailSearch => {
    const tab = parseIssuerTab(search.tab);
    return {
      ...validateTransactionsSearch(search),
      ...(tab === DEFAULT_ISSUER_TAB ? {} : { tab }),
    };
  },
  component: IssuerDetailPage,
});
