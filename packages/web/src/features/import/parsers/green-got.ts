import { importMonthKey } from "./month";
import type { ParseContext, ParsedTransaction, StatementParser } from "./types";

/**
 * The columns that fingerprint a Green-Got CSV export. `matches` requires all of
 * these to be present (the file ships more, but these are the ones the parser
 * reads), which is specific enough to tell it apart from other banks.
 */
const REQUIRED_HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"] as const;

/** Only settled rows enter the ledger (pending/cancelled are skipped). */
const COMPLETE = "COMPLETE";

/**
 * Green-Got statement parser — the first parser in the registry.
 *
 * Column mapping (PRD): `Date` (ISO) → `date`; `Montant` + `Direction` → signed
 * `amount` (DEBIT negative, CREDIT positive); `Intitulé` → `rawIssuerString`;
 * `importMonth` derived per-row from the date. Rows are filtered to `Statut` ===
 * `COMPLETE`. `Arrondi` (round-up) is parsed by the bank but ignored here. A
 * statement spanning a month boundary therefore splits naturally, since each row
 * derives its own `importMonth`.
 *
 * Nothing is dropped any more (issue #176): the whole row is archived verbatim
 * as **raw source**, so the columns no field maps — `Catégorie`, `Référence`,
 * `Moyen de paiement`, `N° transaction`, and the `IBAN du tiers` that turned out
 * to matter — survive the import and can be read later without re-importing.
 * The mapping above is now about which columns are *promoted*, not about which
 * ones are kept.
 */
export const greenGotParser: StatementParser = {
  id: "green-got",
  label: "Green-Got",

  matches: (headers) => REQUIRED_HEADERS.every((required) => headers.includes(required)),

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
        // The whole row, every key, in the bank's own words. A copy rather than
        // the row itself so a caller reusing its parsed rows cannot see one of
        // them mutated through a record it handed us.
        rawSource: { ...row },
        importMonth: importMonthKey(date),
        importBatchId: ctx.importBatchId,
      });
    }
    return records;
  },
};
