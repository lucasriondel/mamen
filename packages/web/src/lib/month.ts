/**
 * The `"YYYY-MM"` month a date falls in, in **UTC** — the one derivation of a
 * month key from a transaction's date, shared by everything that has to agree
 * about which month a row belongs to.
 *
 * UTC because the wire `date` is an instant the server stamped from a statement
 * date at midnight UTC, and because the server buckets the month filter by that
 * same instant (issue #87). Deriving in local time would put a row dated the
 * first of a month into the previous one for any viewer west of Greenwich — and
 * would do it in the dropdown but not in the query behind it, which is the exact
 * drift this key exists to prevent.
 *
 * Not to be confused with the recap's `monthKeyOf(today)`, which is deliberately
 * **local**: that one answers "which month is it for the user right now", a
 * question about the viewer rather than about a stored row.
 */
export function monthKey(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}
