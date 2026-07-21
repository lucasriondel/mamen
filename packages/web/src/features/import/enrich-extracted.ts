import type { ExtractedTransaction } from "@mamen/shared/contract";
import { importMonthKey } from "./parsers/month";
import type { ParseContext, ParsedTransaction } from "./parsers/types";

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
		importMonth: importMonthKey(tx.date),
		importBatchId: ctx.importBatchId,
	}));
}
