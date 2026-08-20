import { isPlausibleIban, normalizeIban } from "@/features/accounts/account-iban";
import { importMonthKey } from "./month";
import type { ParseContext, ParsedRow, StatementParser } from "./types";

/**
 * The columns that fingerprint a Green-Got CSV export. `matches` requires all of
 * these to be present (the file ships more, but these are the ones the parser
 * reads), which is specific enough to tell it apart from other banks.
 */
const REQUIRED_HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"] as const;

/** Only settled rows enter the ledger (pending/cancelled are skipped). */
const COMPLETE = "COMPLETE";

/** The column carrying the **counterparty IBAN**, in the bank's own words. */
const COUNTERPARTY_IBAN_COLUMN = "IBAN du tiers";

/**
 * The **counterparty IBAN** as it is stored, or `undefined` when the row carries
 * none (issue #178). Normalised with the very function the account-IBAN field
 * uses — upper-case, separators stripped — because the two columns exist to be
 * *joined* and a bank that prints its IBANs in groups of four would otherwise
 * fail that join. Sharing the function rather than restating the rule is what
 * keeps the two sides of that join from drifting apart.
 *
 * A blank column and a missing one both yield absent: only SEPA and direct-debit
 * rows carry an IBAN at all, so "not given" is the common answer and must have
 * exactly one spelling — an empty string would be a second one.
 *
 * So does a value that **could not be an IBAN** (PRD #175): banks write prose in
 * this column — "not communicated", a masked card number, a dash — and promotion
 * exists so a matcher can join this against `accounts.iban`. A string that cannot
 * be an account number is not evidence of one, and promoting it would put a value
 * in the matching column that only a second junk value could ever equal. The
 * check is the account field's own {@link isPlausibleIban}: shape only, no
 * per-country length table and no mod-97 checksum, so a statement from a bank
 * mamen has never seen still imports — the same latitude, for the same reason.
 *
 * Nothing is lost by refusing: the delivered value stays in the archive either
 * way, and unlike the account form — where the user typed it, is shown the
 * warning and is the authority on their own account number — there is nobody in
 * the loop at import time to ask.
 *
 * The *delivered* form is untouched in the archive. That disagreement is the
 * division of labour ADR 0012 records: the column is for matching, the raw
 * source is for provenance.
 */
const counterpartyIbanOf = (row: Record<string, string>): string | undefined => {
  const normalized = normalizeIban(row[COUNTERPARTY_IBAN_COLUMN] ?? "");
  // `isPlausibleIban` calls empty valid — the field it guards is optional, and an
  // untouched one is "not given" rather than a failed entry. Here that answer is
  // already spelled `undefined`, so emptiness is settled first.
  if (normalized.length === 0) return undefined;
  return isPlausibleIban(normalized) ? normalized : undefined;
};

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
 * `Moyen de paiement`, `N° transaction` — survive the import and can be read
 * later without re-importing. The mapping above is now about which columns are
 * *promoted*, not about which ones are kept.
 *
 * `IBAN du tiers` is the one column promoted back out of that archive (issue
 * #178): it becomes the **counterparty IBAN**, normalised on the way in so it
 * can be joined against `accounts.iban`. It is read opportunistically, like the
 * archive itself — the header fingerprint is unchanged, so a file lacking the
 * column still parses.
 */
export const greenGotParser: StatementParser = {
  id: "green-got",
  label: "Green-Got",

  matches: (headers) => REQUIRED_HEADERS.every((required) => headers.includes(required)),

  parse: (rows, ctx: ParseContext): ParsedRow[] => {
    const parsed: ParsedRow[] = [];
    rows.forEach((row, sourceIndex) => {
      if (row.Statut !== COMPLETE) return;

      const date = new Date(row.Date);
      const magnitude = Number.parseFloat(row.Montant);
      const amount = row.Direction === "DEBIT" ? -magnitude : magnitude;
      const counterpartyIban = counterpartyIbanOf(row);

      parsed.push({
        // Which row this came from — the skip rule above makes the output
        // shorter than the input, so the caller cannot work it out by counting.
        sourceIndex,
        record: {
          accountId: ctx.accountId,
          date,
          amount,
          rawIssuerString: row.Intitulé,
          // The whole row, every key, in the bank's own words. A copy rather
          // than the row itself so a caller reusing its parsed rows cannot see
          // one of them mutated through a record it handed us.
          rawSource: { ...row },
          // Spread rather than assigned `undefined`: the key is *absent* on a
          // row the bank gave no IBAN for, which is the shape the contract's
          // optional field and the column's null both mean.
          ...(counterpartyIban !== undefined ? { counterpartyIban } : {}),
          importMonth: importMonthKey(date),
          importBatchId: ctx.importBatchId,
        },
      });
    });
    return parsed;
  },
};
