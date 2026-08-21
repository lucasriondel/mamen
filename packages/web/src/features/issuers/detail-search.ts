import {
  type TransactionsSearch,
  validateTransactionsSearch,
} from "@/features/transactions/search";
import { DEFAULT_ISSUER_TAB, type IssuerTab, parseIssuerTab } from "./issuer-detail-tabs";

/**
 * Typed URL search-param schema for the issuer **detail** route.
 *
 * The transactions view's params — account/month/text filters, date sort,
 * pagination — plus this page's own `tab`, so the issuer's transactions table
 * behaves (and bookmarks) exactly like the global one. It lives beside the page
 * rather than in the route file so the page can annotate its own navigations
 * against it: a handler typed as the shared {@link TransactionsSearch} writes
 * `tab` unchecked, since that type has no such field (issue #165).
 */
export interface IssuerDetailSearch extends TransactionsSearch {
  /** Which panel is showing. Absent means {@link DEFAULT_ISSUER_TAB}. */
  tab?: IssuerTab;
}

/**
 * Normalize raw URL search into {@link IssuerDetailSearch} — TanStack Router's
 * `validateSearch`, so it is unit-testable without a router.
 *
 * The default tab is normalized *out* of the URL rather than into it: a bare
 * `/issuers/1` and `/issuers/1?tab=transactions` are the same view, so only the
 * two non-default panels ever name themselves.
 */
export function validateIssuerDetailSearch(search: Record<string, unknown>): IssuerDetailSearch {
  const tab = parseIssuerTab(search.tab);
  return {
    ...validateTransactionsSearch(search),
    ...(tab === DEFAULT_ISSUER_TAB ? {} : { tab }),
  };
}
