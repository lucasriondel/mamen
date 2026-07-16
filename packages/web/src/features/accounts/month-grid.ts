/**
 * Pure helpers for the accounts import grid (issue #36).
 *
 * The grid is accounts (rows) × the twelve months of a chosen year (columns).
 * A cell is a dropzone only when its month is *importable*: a fully-elapsed past
 * month. The current month and any future month are inert — their statements
 * aren't final yet, so there's nothing complete to import.
 *
 * Everything here is a pure function over `YYYY-MM` strings and takes the
 * "current month" as an argument rather than reading the clock, so the grid's
 * logic is testable without faking time.
 */

/** A `YYYY-MM` import-month key, matching the transaction's `importMonth`. */
export type MonthKey = string;

/** Zero-pad a 1-based month number to the `MM` half of a {@link MonthKey}. */
function pad2(month: number): string {
	return String(month).padStart(2, "0");
}

/** The `YYYY-MM` key for a given year and 1-based month. */
export function monthKey(year: number, month1Based: number): MonthKey {
	return `${year}-${pad2(month1Based)}`;
}

/** The twelve `YYYY-MM` keys of a year, January → December. */
export function monthsOfYear(year: number): MonthKey[] {
	return Array.from({ length: 12 }, (_, index) => monthKey(year, index + 1));
}

/**
 * Whether `month` is importable relative to `currentMonth` (both `YYYY-MM`).
 *
 * Only strictly-past months qualify: the current month is excluded because its
 * statement is still accruing, and future months obviously so. Comparison is
 * lexicographic, which is correct for zero-padded `YYYY-MM`.
 */
export function isMonthImportable(
	month: MonthKey,
	currentMonth: MonthKey,
): boolean {
	return month < currentMonth;
}

/** Extract the year (number) from a `YYYY-MM` key. */
export function yearOf(month: MonthKey): number {
	return Number(month.slice(0, 4));
}

/**
 * The years to offer in the grid's year selector, newest first.
 *
 * Spans from the earliest imported month's year (or the current year, whichever
 * is earlier) up to the current year — so the user can always reach every year
 * that holds data plus the year they're living in, and never a future year with
 * nothing importable in it.
 */
export function availableYears(
	importedMonths: Iterable<MonthKey>,
	currentYear: number,
): number[] {
	let earliest = currentYear;
	for (const month of importedMonths) {
		const year = yearOf(month);
		if (Number.isFinite(year) && year < earliest) earliest = year;
	}
	const years: number[] = [];
	for (let year = currentYear; year >= earliest; year--) years.push(year);
	return years;
}
