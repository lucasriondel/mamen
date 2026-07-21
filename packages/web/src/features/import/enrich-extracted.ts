import type { ExtractedTransaction } from "@mamen/shared/contract";
import type { ParseContext, ParsedTransaction } from "./parsers/types";

/** Derive a `YYYY-MM` import-month key from a date, in UTC (matches the CSV parsers). */
function monthKey(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

/**
 * Turn the account-agnostic **extracted transactions** returned by
 * `POST /import/extract-pdf` into the same {@link ParsedTransaction} shape a CSV
 * **Parser** produces, so the PDF path rejoins the shared commit rail. The model
 * already supplies the PDF-observable fields (`date`, signed `amount`,
 * `rawIssuerString`); this stamps the client-side context (account, import batch)
 * and derives each row's `importMonth` from its date — exactly as the parsers do,
 * so a statement spanning a month boundary still splits per month.
 */
export function enrichExtracted(
	transactions: readonly ExtractedTransaction[],
	ctx: ParseContext,
): ParsedTransaction[] {
	return transactions.map((tx) => ({
		accountId: ctx.accountId,
		date: tx.date,
		amount: tx.amount,
		rawIssuerString: tx.rawIssuerString,
		importMonth: monthKey(tx.date),
		importBatchId: ctx.importBatchId,
	}));
}
