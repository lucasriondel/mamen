/**
 * Presentation formatters for money, dates, and import months.
 *
 * The sample data is EUR only (see the PRD's multi-currency out-of-scope note),
 * so currency is hard-wired to EUR / `fr-FR` grouping. Amounts follow the app's
 * sign convention: debits negative, credits positive.
 */

const EUR = new Intl.NumberFormat("fr-FR", {
	style: "currency",
	currency: "EUR",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	signDisplay: "exceptZero",
});

const EUR_NO_SIGN = new Intl.NumberFormat("fr-FR", {
	style: "currency",
	currency: "EUR",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	signDisplay: "auto",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

const MONTH = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "numeric",
});

/** Options for {@link formatCurrency}. */
export interface FormatCurrencyOptions {
	/**
	 * Show an explicit `+` on positive amounts (default `true`). Zero never gets a
	 * sign. Pass `false` for contexts where the sign is redundant.
	 */
	signDisplay?: boolean;
}

/**
 * Format an amount (in euros) as a EUR string. Positive amounts get a leading
 * `+`, negatives a `-`, zero neither, and there are always two fraction digits.
 */
export function formatCurrency(
	amount: number,
	options: FormatCurrencyOptions = {},
): string {
	const fmt = options.signDisplay === false ? EUR_NO_SIGN : EUR;
	return fmt.format(amount);
}

/** Format a `Date` or ISO date string as a short readable day (e.g. `15 Jan 2026`). */
export function formatShortDate(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return SHORT_DATE.format(d);
}

/**
 * Turn a `YYYY-MM` import-month key into a readable `Mon YYYY` label. Returns the
 * raw input unchanged when it is not a valid `YYYY-MM`.
 */
export function formatMonth(month: string): string {
	const match = /^(\d{4})-(\d{2})$/.exec(month);
	if (!match) return month;
	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	if (monthIndex < 0 || monthIndex > 11) return month;
	return MONTH.format(new Date(Date.UTC(year, monthIndex, 1)));
}
