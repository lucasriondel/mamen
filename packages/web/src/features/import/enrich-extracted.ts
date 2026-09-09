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
 *
 * The row's archive travels too (issue #189, ADR 0012). It is the PDF
 * counterpart of what `applyFormat` keeps for a CSV row: the cells the model
 * read, in the statement's own words and as it printed them. Carried rather than
 * built, because the only thing that ever saw the statement is the extraction —
 * this side has a PDF and no rows in it.
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
    // Spread rather than assigned `undefined`, the way `applyFormat` writes the
    // counterparty IBAN: a row with nothing to archive — one the endpoint folded
    // to absent, or one the user typed in side-by-side validation — carries no
    // key at all, so the detail page shows nothing rather than an empty block.
    ...(tx.rawSource === undefined ? {} : { rawSource: tx.rawSource }),
    importMonth: importMonthKey(tx.date),
    importBatchId: ctx.importBatchId,
  }));
}
