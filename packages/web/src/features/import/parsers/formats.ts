import type { AccountId, CsvStatementFormat, StatementFormatId } from "@mamen/shared/contract";

/**
 * The columns that fingerprint a Green-Got CSV export. The file ships thirteen;
 * these five are the ones the format reads, which is specific enough to tell it
 * apart from another bank's export.
 *
 * `scripts/scrub-bank-statements.sh` reads this array out of this file to check
 * that the synthetic fixture still carries the columns the format needs — so the
 * two agree by derivation rather than by a second list somewhere.
 */
const GREEN_GOT_HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"] as const;

/**
 * Green-Got as a **Statement Format** — the proof the contract's format
 * vocabulary is sufficient for a real bank (PRD #180, issue #182).
 *
 * It reads: `Date` (a full ISO instant) → `date`; `Montant` signed by
 * `Direction`, where `DEBIT` means money left → `amount`; `Intitulé` →
 * `rawIssuerString`; `IBAN du tiers` → `counterpartyIban`; and only rows whose
 * `Statut` is `COMPLETE`, so pending and cancelled operations never enter the
 * ledger. Amounts are dot-decimal.
 *
 * The IBAN column is not part of the fingerprint above and is read
 * opportunistically: a Green-Got export lacking it still matches, and its rows
 * simply carry no counterparty IBAN.
 *
 * `Arrondi` (the bank's round-up) is read by nothing — it reaches the row's
 * **raw source** like every other unmapped column, so it is recoverable without
 * a re-import if it ever turns out to matter.
 *
 * **Nothing imports this at runtime any more.** Since issue #184 the wizard
 * reads the account's stored formats, and Green-Got is one the user authors
 * through the UI (the PRD declines to seed it, so the feature's first real use
 * is its first end-to-end test). What survives here is a reference record: the
 * shape a stored row takes, driven by the applying suite against the shipped
 * fixture, and the one list the scrub script derives the fixture's required
 * columns from. Its `id` and `accountId` are the placeholders that implies.
 */
export const greenGotFormat: CsvStatementFormat = {
  id: 1 as StatementFormatId,
  accountId: 1 as AccountId,
  name: "Green-Got",
  kind: "csv",
  headers: GREEN_GOT_HEADERS,
  mapping: {
    date: "Date",
    rawIssuerString: "Intitulé",
    counterpartyIban: "IBAN du tiers",
  },
  rules: {
    sign: {
      strategy: "direction-column",
      amountColumn: "Montant",
      directionColumn: "Direction",
      debitValue: "DEBIT",
    },
    dateOrder: "iso",
    decimalSeparator: "dot",
    filter: { column: "Statut", equals: "COMPLETE" },
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
