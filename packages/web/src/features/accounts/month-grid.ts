/**
 * Pure helpers for an account's **month strip** (issues #36, #131).
 *
 * The strip is the twelve months of a chosen year, one per account card — the
 * grid of accounts × months this started as, cut into per-account rows so an
 * account and its coverage are read in one place. A cell is a dropzone only when
 * its month is *importable*: a fully-elapsed past month. The current month and
 * any future month are inert — their statements aren't final yet, so there's
 * nothing complete to import.
 *
 * Everything here is a pure function over `YYYY-MM` strings and takes the
 * "current month" as an argument rather than reading the clock, so the strip's
 * logic is testable without faking time.
 */

/** A `YYYY-MM` import-month key, matching the transaction's `importMonth`. */
export type MonthKey = string;

/**
 * A month cell's interaction state, derived from the calendar and import data.
 *
 * Lives here rather than on the component that paints it, because the card's
 * `3/7 months` stat counts these same states — one derivation, read twice.
 */
export type CellState = "imported" | "available" | "disabled";

/** Short month labels, January → December. */
export const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

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

/** One month of a strip: its key, its column label and its state. */
export interface MonthCellSpec {
	month: MonthKey;
	label: string;
	state: CellState;
}

/**
 * The twelve cells of one account's year, in order.
 *
 * Takes `isImported` as a predicate rather than a set of pairs so the caller
 * decides what "imported" means for the account it is rendering — the strip
 * holds one account, the imported set holds all of them.
 */
export function monthCells(
	year: number,
	currentMonth: MonthKey,
	isImported: (month: MonthKey) => boolean,
): MonthCellSpec[] {
	return monthsOfYear(year).map((month, index) => ({
		month,
		label: MONTH_LABELS[index],
		state: !isMonthImportable(month, currentMonth)
			? "disabled"
			: isImported(month)
				? "imported"
				: "available",
	}));
}

/**
 * How much of a year an account has covered: imported months over *importable*
 * ones.
 *
 * The denominator excludes the current and future months on purpose. A card
 * reading `1/12 months` every January would call an account that is completely
 * caught up eleven months behind, which inverts the thing the stat is for.
 */
export function monthProgress(cells: readonly MonthCellSpec[]): {
	imported: number;
	importable: number;
} {
	let imported = 0;
	let importable = 0;
	for (const cell of cells) {
		if (cell.state === "disabled") continue;
		importable++;
		if (cell.state === "imported") imported++;
	}
	return { imported, importable };
}
