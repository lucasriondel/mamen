import type { ParseContext, ParsedTransaction, StatementParser } from "./types";

/**
 * The columns that fingerprint a Green-Got CSV export. `matches` requires all of
 * these to be present (the file ships more, but these are the ones the parser
 * reads), which is specific enough to tell it apart from other banks.
 */
const REQUIRED_HEADERS = [
	"Statut",
	"Date",
	"Montant",
	"Direction",
	"Intitulé",
] as const;

/** Only settled rows enter the ledger (pending/cancelled are skipped). */
const COMPLETE = "COMPLETE";

/** Derive a `YYYY-MM` import-month key from a date, in UTC (the export is UTC). */
function monthKey(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

/**
 * Green-Got statement parser — the first parser in the registry.
 *
 * Column mapping (PRD): `Date` (ISO) → `date`; `Montant` + `Direction` → signed
 * `amount` (DEBIT negative, CREDIT positive); `Intitulé` → `rawIssuerString`;
 * `importMonth` derived per-row from the date. Rows are filtered to `Statut` ===
 * `COMPLETE`. `Arrondi` (round-up) is parsed by the bank but ignored here; the
 * bank's `Catégorie` and `N° transaction` are dropped (the contract has no
 * external-id field). A statement spanning a month boundary therefore splits
 * naturally, since each row derives its own `importMonth`.
 */
export const greenGotParser: StatementParser = {
	id: "green-got",
	label: "Green-Got",

	matches: (headers) =>
		REQUIRED_HEADERS.every((required) => headers.includes(required)),

	parse: (rows, ctx: ParseContext): ParsedTransaction[] => {
		const records: ParsedTransaction[] = [];
		for (const row of rows) {
			if (row.Statut !== COMPLETE) continue;

			const date = new Date(row.Date);
			const magnitude = Number.parseFloat(row.Montant);
			const amount = row.Direction === "DEBIT" ? -magnitude : magnitude;

			records.push({
				accountId: ctx.accountId,
				date,
				amount,
				rawIssuerString: row.Intitulé,
				importMonth: monthKey(date),
				importBatchId: ctx.importBatchId,
			});
		}
		return records;
	},
};
