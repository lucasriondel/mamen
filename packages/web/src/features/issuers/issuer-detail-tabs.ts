/**
 * The issuer detail page's **tab** — which of the three panels is showing, as a
 * URL search param so a refresh, a bookmark, or a shared link lands where the
 * sender was (issue #8 follow-up).
 *
 * Kept out of `validateTransactionsSearch`: that schema is shared by
 * `/transactions` and the category page, neither of which has tabs, so a `tab`
 * field there would be a param those routes accept and ignore. The issuer route
 * composes the two instead — the transactions search plus this.
 */

/**
 * The panels, in the order the strip shows them. The note is *not* one of them —
 * it lives under the title as the page's description, editable in place.
 */
export const ISSUER_TABS = ["transactions", "rules"] as const;

export type IssuerTab = (typeof ISSUER_TABS)[number];

/**
 * The tab a URL with no (or a junk) `tab` param resolves to. Transactions is the
 * reason the page is usually open, so it is both the default and the one value
 * that stays *out* of the URL — a bare `/issuers/1` and `?tab=transactions`
 * would otherwise be two URLs for one view.
 */
export const DEFAULT_ISSUER_TAB: IssuerTab = "transactions";

/** Whether a raw value names one of the panels. */
export function isIssuerTab(value: unknown): value is IssuerTab {
  return typeof value === "string" && (ISSUER_TABS as readonly string[]).includes(value);
}

/**
 * Normalize a raw `tab` search value to a panel name. Anything unrecognised —
 * absent, misspelled, or a stale link to a panel that no longer exists (an old
 * `?tab=notes` bookmark) — falls back to {@link DEFAULT_ISSUER_TAB} rather than
 * rendering an empty page.
 */
export function parseIssuerTab(raw: unknown): IssuerTab {
  return isIssuerTab(raw) ? raw : DEFAULT_ISSUER_TAB;
}
