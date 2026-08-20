import type { Account } from "@mamen/shared/contract";
import { Landmark } from "lucide-react";

/**
 * The **IBAN-confirmed** mark (issue #179) — the badge a transfer candidate
 * carries when one leg's **counterparty IBAN** equals the other leg's account
 * IBAN, so the bank itself named the account the money reached and the pairing
 * is certain rather than probable.
 *
 * It **names the matched account**, because "mamen is confident" is worth
 * nothing on its own: the account name is the evidence, and it is the thing the
 * user can check against the statement they already have. A bank icon rather
 * than a tick: the claim is *your bank said so*, not *mamen validated this*.
 *
 * It **labels, and never reorders** — the list it sits in stays closest-date
 * first. And it never acts: confirming remains the user's own click on **Link as
 * transfer**, which re-validates the pairing server-side. An IBAN match proves
 * counterparty identity, not that the legs sum to zero, which is the invariant
 * that makes a transfer group safe to net out of the recap.
 *
 * Deliberately quiet — a small tinted badge, no border, no colour the rest of
 * the row does not use. An unmarked candidate is an ordinary one, not a
 * second-class one: most rows carry no IBAN at all, and an emphatic mark on the
 * few that do would read as a warning on all the others.
 */
export function IbanConfirmedMark({
  accountId,
  accountsById,
}: {
  accountId: number;
  accountsById: ReadonlyMap<number, Account>;
}) {
  const name = accountsById.get(accountId)?.name ?? `Account #${accountId}`;
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full bg-gousse-accent/10 px-2 py-0.5 text-gousse-accent text-xs"
      title={`Your bank's IBAN names ${name}, so this is the right pairing. Linking it is still your call.`}
    >
      <Landmark size={12} aria-hidden />
      IBAN-confirmed · {name}
    </span>
  );
}
