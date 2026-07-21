/**
 * Derive a `YYYY-MM` import-month key from a date, in UTC. Shared by the CSV
 * parsers and the PDF enrichment so a statement spanning a month boundary splits
 * the same way regardless of source. UTC because statement dates are UTC.
 */
export function importMonthKey(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}
