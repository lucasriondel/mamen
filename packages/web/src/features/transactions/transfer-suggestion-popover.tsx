import type { Account, Transaction, TransactionId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { accountQueries } from "@/lib/sdk";
import { cn, indexById } from "@/lib/utils";
import { IbanConfirmedMark } from "./iban-confirmed-mark";
import { useTransfer } from "./use-transfer";
import {
  dayGapLabel,
  type SuggestedCounterpart,
  toTransferPair,
  useTransferSuggestion,
} from "./use-transfer-candidates";

/**
 * One candidate counterpart, with every field the user needs to judge it (issue
 * #91 stories 6–10): its **amount**, its **date**, its **account**, the bank's
 * own **raw issuer string** — usually the field that settles it outright, a
 * label like `VIR SEPA VERS LIVRET A` — and the **day gap** that explains its
 * rank. Plus the one per-counterpart action: confirm *this* pairing.
 *
 * When the pairing is **IBAN-confirmed** (issue #179) it also carries the mark,
 * naming the account the bank's own IBAN matched — the field that settles it
 * outright when the raw issuer string does not. The row is otherwise identical
 * to an unmarked one, and the list's order is untouched.
 *
 * Confirm is per-counterpart and there is deliberately no bulk confirm: a leg
 * belongs to at most one **transfer group**, so "confirm all" is incoherent.
 */
function CounterpartRow({
  counterpart,
  accountsById,
  onConfirm,
  disabled,
}: {
  counterpart: SuggestedCounterpart;
  accountsById: ReadonlyMap<number, Account>;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const leg = counterpart.transaction;
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-gousse-line px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-medium tabular-nums",
            leg.amount < 0 && "text-gousse-high",
            leg.amount > 0 && "text-gousse-low",
          )}
        >
          {formatCurrency(leg.amount)}
        </span>
        <span className="text-gousse-muted text-xs">{dayGapLabel(counterpart.daysApart)}</span>
      </div>
      <span className="text-gousse-muted text-xs">
        {formatShortDate(leg.date)} ·{" "}
        {accountsById.get(leg.accountId)?.name ?? `Account #${leg.accountId}`}
      </span>
      {/* The bank's own label, verbatim and monospaced like the table's Raw
          issuer column: it is evidence, so it is never normalised here. */}
      <span className="break-words font-mono text-gousse-muted text-xs">{leg.rawIssuerString}</span>
      {counterpart.ibanConfirmedAccountId !== undefined ? (
        <IbanConfirmedMark
          accountId={counterpart.ibanConfirmedAccountId}
          accountsById={accountsById}
        />
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={onConfirm}
      >
        Link as transfer
      </Button>
    </li>
  );
}

/**
 * The **transfer suggestion panel** (issue #91) — the indicator a row carries
 * when it looks like one half of an internal transfer, and the panel behind it.
 *
 * A **popover**, not a tooltip: it holds buttons, and a hover-triggered,
 * non-interactive tooltip cannot hold an action without shutting out keyboard
 * and touch users. The trigger is a real `<button>`, so it is tabbable and opens
 * on Enter/Space and on tap.
 *
 * The two actions are asymmetric, and the panel states the asymmetry rather than
 * hiding it:
 *
 * - **Link as transfer** is per counterpart — one pairing, chosen deliberately.
 *   Confirming stamps both legs with a group id, which makes them ineligible, so
 *   this row's other candidates vanish from the next read on their own.
 * - **Not a transfer** is ONE group-level action, rendered once at the foot of
 *   the panel. It writes a **dismissed pair** for every counterpart listed here
 *   and nothing else — the scope is exactly what the user could see. A
 *   per-counterpart dismiss button with group-wide effect was rejected: a
 *   button's placement must not lie about its blast radius.
 *
 * Dismissal is currently permanent (there is no undismiss), which the copy says
 * out loud rather than presenting it as a reversible tidy-up.
 *
 * The panel closes on either action, so the interface acknowledges the decision
 * instead of leaving a settled question on screen while the refetch lands.
 */
export function TransferSuggestionPanel({
  transaction,
  counterparts,
}: {
  transaction: Transaction;
  counterparts: readonly SuggestedCounterpart[];
}) {
  const [open, setOpen] = useState(false);
  const { link, dismiss } = useTransfer();
  const accountsQuery = useQuery(accountQueries.list());
  const accountsById = useMemo(
    () => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
    [accountsQuery.data],
  );

  const count = counterparts.length;
  const busy = link.isPending || dismiss.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${count} possible transfer ${count === 1 ? "match" : "matches"} for ${transaction.rawIssuerString}`}
            className="inline-flex items-center gap-1 rounded-full bg-gousse-accent/10 px-2 py-0.5 text-gousse-accent text-xs outline-none transition-colors hover:bg-gousse-accent/20 focus-visible:ring-2 focus-visible:ring-gousse-accent"
          >
            <ArrowLeftRight size={12} aria-hidden />
            {count}
          </button>
        }
      />
      <PopoverContent className="w-80 p-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium text-gousse-ink text-sm">Possible transfer</p>
            <p className="mt-0.5 text-gousse-muted text-xs">
              {count === 1
                ? "This row matches one transaction in another account."
                : `This row matches ${count} transactions in other accounts.`}{" "}
              Linking a pair nets it out of your recap.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {counterparts.map((counterpart) => (
              <CounterpartRow
                key={counterpart.transaction.id}
                counterpart={counterpart}
                accountsById={accountsById}
                disabled={busy}
                onConfirm={() => {
                  setOpen(false);
                  link.mutate([transaction.id, counterpart.transaction.id] as TransactionId[]);
                }}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-1 border-t border-gousse-line pt-3">
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                dismiss.mutate(
                  counterparts.map((counterpart) =>
                    toTransferPair(transaction, counterpart.transaction),
                  ),
                );
              }}
            >
              {count === 1 ? "Not a transfer" : `Not a transfer (${count})`}
            </Button>
            <p className="text-gousse-muted text-xs">
              {count === 1
                ? "Clears this suggestion for good — there's no undo yet."
                : `Clears all ${count} suggestions above for good — there's no undo yet.`}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The per-row form of {@link TransferSuggestionPanel}: looks the row up in the
 * shared two-way index and renders nothing when it has no outstanding
 * suggestion. Nothing is re-derived here — a row the server judged ineligible
 * (already grouped, a refund, bundled) simply has no entry, so an indicator is
 * never offered where the confirm action would be refused.
 */
export function TransferSuggestionCell({ transaction }: { transaction: Transaction }) {
  const suggestion = useTransferSuggestion(transaction);
  if (suggestion === undefined || suggestion.counterparts.length === 0) {
    return null;
  }
  return (
    <TransferSuggestionPanel transaction={transaction} counterparts={suggestion.counterparts} />
  );
}
