import type {
  Transaction,
  TransactionId,
  TransferCandidate,
  TransferPair,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { transactionQueries } from "@/lib/sdk";

/**
 * One candidate counterpart of a row: the other leg, how far apart they are,
 * and — when the pairing is **IBAN-confirmed** (issue #179) — the id of the
 * account the bank's own IBAN named. Absent is the ordinary case: only SEPA rows
 * carry an IBAN and an account may have none on file, so an unmarked counterpart
 * is a candidate like any other.
 */
export type SuggestedCounterpart = {
  transaction: Transaction;
  daysApart: number;
  ibanConfirmedAccountId?: number;
};

/** A row's outstanding transfer suggestion — the row plus its counterparts. */
export type TransferSuggestion = {
  transaction: Transaction;
  counterparts: readonly SuggestedCounterpart[];
};

/**
 * "same day" / "1 day apart" / "4 days apart" — the day gap in words. Lives here
 * rather than in either surface: the table's panel and the detail page's list
 * both state it, and a candidate that reads "3 days apart" in one place and "3d"
 * in the other would look like two different facts.
 */
export function dayGapLabel(daysApart: number): string {
  if (daysApart === 0) return "same day";
  return daysApart === 1 ? "1 day apart" : `${daysApart} days apart`;
}

/**
 * Order a row's counterparts the way the panel reads them: **closest-date
 * first**, ties broken by id so the list is stable across reads. The server
 * already emits a debit leg's counterparts this way; the reverse direction is
 * assembled here from entries the server ordered by *leg*, so it needs the rule
 * applied. Stating it once means both directions rank identically.
 */
const byProximity = (a: SuggestedCounterpart, b: SuggestedCounterpart) =>
  a.daysApart - b.daysApart || a.transaction.id - b.transaction.id;

/**
 * Index the grouped candidate payload **both ways** (issue #91).
 *
 * The wire payload is oriented by sign — `leg` is always the debit — which is
 * what stops one real pair being surfaced as both A→B and B→A. But a credit row
 * needs an indicator too (a savings account is a list of incoming transfers, and
 * a blank one would be useless), and a credit never appears as a `leg`. So the
 * same payload is read twice: once forward (debit → its credits) and once
 * backward (credit → the debits it is a candidate for).
 *
 * Deriving the reverse direction here rather than asking the server for a group
 * per row in both directions is deliberate: that would double the payload and
 * bring back the duplicate-pair problem the sign orientation exists to solve.
 */
export function indexCandidates(
  candidates: readonly TransferCandidate[],
): ReadonlyMap<number, TransferSuggestion> {
  const byId = new Map<
    number,
    { transaction: Transaction; counterparts: SuggestedCounterpart[] }
  >();
  const entryFor = (transaction: Transaction) => {
    const existing = byId.get(transaction.id);
    if (existing !== undefined) return existing;
    const fresh = { transaction, counterparts: [] as SuggestedCounterpart[] };
    byId.set(transaction.id, fresh);
    return fresh;
  };

  for (const candidate of candidates) {
    const leg = entryFor(candidate.leg);
    for (const counterpart of candidate.counterparts) {
      // The **IBAN-confirmed** mark rides both directions unchanged (issue
      // #179): it is evidence about the *pairing*, and the account it names is
      // the one the bank's IBAN matched — which is the same account whichever
      // of the two rows is being looked at.
      const ibanConfirmed =
        counterpart.ibanConfirmedAccountId !== undefined
          ? { ibanConfirmedAccountId: counterpart.ibanConfirmedAccountId }
          : {};
      leg.counterparts.push({
        transaction: counterpart.transaction,
        daysApart: counterpart.daysApart,
        ...ibanConfirmed,
      });
      entryFor(counterpart.transaction).counterparts.push({
        transaction: candidate.leg,
        daysApart: counterpart.daysApart,
        ...ibanConfirmed,
      });
    }
  }

  for (const entry of byId.values()) entry.counterparts.sort(byProximity);
  return byId;
}

/**
 * The pair as the server stores it: **debit first** (issue #91). The caller
 * knows which two rows it displayed but not which the server filed as the leg,
 * so the orientation is derived from the one fact that decided it — the sign.
 * A pair is only ever built from a suggestion, and detection never pairs two
 * rows of the same sign, so exactly one of the two is the debit.
 */
export function toTransferPair(a: Transaction, b: Transaction): TransferPair {
  const [debit, credit] = a.amount < 0 ? [a, b] : [b, a];
  return {
    debitId: debit.id as TransactionId,
    creditId: credit.id as TransactionId,
  };
}

/**
 * The **transfer suggestions** for the whole dataset, indexed by transaction id
 * (issue #91) — ONE cached read behind every surface that shows them: the
 * transactions table's per-row indicator, the Transfers page and the transaction
 * detail page. Because they share the entry, they cannot disagree about a pair,
 * and opening a row's panel needs no request of its own.
 *
 * Unfiltered and unpaged, matching the query: a pair straddling a page boundary
 * is still a pair, and a table showing page 3 must still mark the row whose
 * counterpart is on page 7.
 *
 * A row with no entry has no outstanding suggestion — because nothing matches
 * it, because it is already a **transfer leg**, a **refund**, a **bundle
 * member** or a **bundle parent** (the server's eligibility rule, applied once
 * in SQL), or because every pairing it had has been **dismissed**. All of those
 * read the same here, which is the point: the client never re-derives who
 * qualifies.
 */
export function useTransferSuggestionIndex(): ReadonlyMap<number, TransferSuggestion> {
  const query = useQuery(transactionQueries.transferCandidates());
  return useMemo(
    () => indexCandidates((query.data ?? []) as readonly TransferCandidate[]),
    [query.data],
  );
}

/** One row's outstanding suggestion, or `undefined` when it has none. */
export function useTransferSuggestion(transaction: Transaction): TransferSuggestion | undefined {
  return useTransferSuggestionIndex().get(transaction.id);
}
