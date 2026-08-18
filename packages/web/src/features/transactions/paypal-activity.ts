/**
 * PayPal activity lookup for an unresolved transaction.
 *
 * A PayPal line on a bank statement never names the real merchant — the bank
 * only ever sees "PAYPAL EUROPE S.A.R.L.". The merchant lives in the PayPal
 * activity feed, so resolving such a row means going there and finding the
 * payment by date. This builds that deep link: the activity feed filtered to a
 * window ending on the transaction's date, since PayPal settles to the bank a
 * few days after the purchase.
 */

/** How many days before the bank date the activity window opens. */
const WINDOW_DAYS = 5;

/**
 * Does this raw counterparty string look like a PayPal payment? Matched on the
 * substring, case-insensitively: the bank label varies wildly
 * (`PAYPAL EUROPE S.A.R.L. ET CIE S.C.A`, `PAYPAL *EBAY`), and every variant
 * warrants the same lookup.
 */
export function isPaypalRawIssuer(rawIssuerString: string): boolean {
  return rawIssuerString.toLowerCase().includes("paypal");
}

/**
 * Format a date as `YYYY-MM-DD` in **local** time — PayPal's filter takes a
 * calendar day, and the transaction's date is a calendar day too, so going
 * through UTC (`toISOString`) would shift it by one for anyone west of GMT.
 */
export function toIsoDay(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The PayPal activity URL for a transaction dated `date`: the feed windowed to
 * the {@link WINDOW_DAYS} days up to and including that date.
 */
export function paypalActivityUrl(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - WINDOW_DAYS);
  return `https://www.paypal.com/myaccount/activities/?start_date=${toIsoDay(
    start,
  )}&end_date=${toIsoDay(date)}`;
}
