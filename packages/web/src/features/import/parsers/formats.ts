import type { StatementFormat } from "./format";

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
 * Green-Got as a **Statement Format** — the proof the vocabulary in
 * {@link module:format} is sufficient for a real bank (PRD #180).
 *
 * It reads: `Date` (a full ISO instant) → `date`; `Montant` signed by
 * `Direction`, where `DEBIT` means money left → `amount`; `Intitulé` →
 * `rawIssuerString`; and only rows whose `Statut` is `COMPLETE`, so pending and
 * cancelled operations never enter the ledger. Amounts are dot-decimal.
 *
 * `Arrondi` (the bank's round-up) is read by nothing, as before — it reaches the
 * row's **raw source** like every other unmapped column, so it is recoverable
 * without a re-import if it ever turns out to matter.
 *
 * A literal at this stage. It becomes a stored, user-authored row when the
 * formats table lands; nothing here is seeded into that table (PRD: Green-Got is
 * created through the new UI, which makes the feature's first use its first
 * end-to-end test).
 */
export const greenGotFormat: StatementFormat = {
  id: "green-got",
  name: "Green-Got",
  kind: "csv",
  headers: GREEN_GOT_HEADERS,
  mapping: {
    date: "Date",
    rawIssuerString: "Intitulé",
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
};
