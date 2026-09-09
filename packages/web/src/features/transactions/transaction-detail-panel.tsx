import type { TransactionId } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/format";
import { DetailAmount, TransactionDetailFields } from "./transaction-detail-content";
import { TransactionDetailSkeleton } from "./transaction-detail-skeleton";
import { useTransactionDetail } from "./use-transaction-detail";

export interface TransactionDetailPanelProps {
  /** The row this panel is about — the transactions route's `selected` param. */
  transactionId: TransactionId;
  /** Close the panel: the caller drops `selected` from the URL. */
  onClose: () => void;
}

/**
 * One transaction's detail, **beside the grid rather than instead of it** (issue
 * #154).
 *
 * Curating is a loop — read a row, name its issuer, pick a category, move to the
 * next — and every turn of it used to cost a full page swap in each direction,
 * with the row being worked on off screen while it was being worked on. Here the
 * list stays mounted, the open row stays visible and marked, and clicking the
 * next row swaps only what is in this column.
 *
 * It shows the **whole** detail surface, not a summary that links out: a summary
 * would send the user to the page for anything real, which is the swap this
 * exists to remove. So the body is {@link TransactionDetailFields}, the same
 * sections the standalone page renders, and the reads are
 * {@link useTransactionDetail}, the same five queries — already warm, since the
 * grid behind it has just made most of them.
 *
 * What differs from the page is only the chrome: a close button instead of a
 * back link, a `h2` instead of the page's `h1` (the page is *Transactions*; this
 * is a region within it), and a link out to the full page — which stays the
 * right answer for a deep link, a new tab, and any viewport too narrow to hold
 * a column beside the table.
 */
export function TransactionDetailPanel({ transactionId, onClose }: TransactionDetailPanelProps) {
  const detail = useTransactionDetail(transactionId);
  const txn = detail.transaction;

  // Focus follows the open row into the panel, on every row (`transactionId` is
  // the dependency, not mount): a keyboard user would otherwise have to tab
  // through the rest of the table to reach what their Enter just opened, and
  // Escape — the way back out — would land on whatever still held focus.
  const panelRef = useRef<HTMLElement>(null);
  // What held focus when the panel took it — the row that was clicked or
  // Entered — so closing can hand it back.
  const openerRef = useRef<Element | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
  }, [transactionId]);

  // Closing returns focus to the row it came from, which is the other half of
  // the loop the panel exists for: the next transaction is then one arrow key
  // away, where dropping focus to the top of the document would make every row
  // curated cost a walk back through the whole table. Guarded on `isConnected`
  // — a row deleted while its panel was open is no longer somewhere to land.
  const close = () => {
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    onClose();
  };

  // The row's counterparty names the panel, as it titles the page — the raw bank
  // string only while no issuer resolves it.
  const title = detail.issuer?.name ?? txn?.rawIssuerString;

  return (
    // A complementary landmark: this is content beside the table, about a row of
    // it, and naming it gives a screen reader a way to reach it and to tell it
    // from the grid. Not a dialog — nothing here is modal, and the whole point
    // is that the list stays live underneath.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape is handled on the container because it is the *container* the key dismisses; the rule's fix (move it to an interactive element) would tie the panel's exit to whichever control happened to hold focus
    <aside
      ref={panelRef}
      aria-label="Transaction detail"
      // Focusable, never a tab stop of its own: the effect above puts focus
      // here when the panel opens, and from there Tab walks its controls.
      tabIndex={-1}
      // Escape closes it, the way it leaves any transient surface — on the
      // container rather than the document, so a picker's own Escape (which
      // reverts an edit in place) is handled where it happens and stops there.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        close();
      }}
      // `sticky` so the panel stays with the reader as the list scrolls past it,
      // and scrolls internally when the detail is longer than the viewport.
      className="sticky top-6 flex w-[26rem] shrink-0 flex-col gap-6 self-start overflow-y-auto rounded-2xl border border-gousse-line bg-gousse-panel p-5 max-h-[calc(100vh-3rem)] xl:w-[28rem]"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gousse-ink">
              {title ?? <Skeleton as="span" className="block h-6 w-40" />}
            </h2>
            <p className="mt-0.5 text-sm text-gousse-muted">
              {txn != null ? formatShortDate(txn.date) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {txn != null ? <DetailAmount amount={txn.amount} /> : null}
            <button
              type="button"
              onClick={close}
              aria-label="Close detail"
              className="inline-flex size-8 items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-bg hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        {/* The way to the surface this one is beside, never in place of: a full
            page to link, to open in a tab, or to fall back to on a narrow
            viewport. */}
        <Link
          to="/transactions/$transactionId"
          params={{ transactionId: String(transactionId) }}
          className="flex items-center gap-1 self-start text-sm text-gousse-muted transition-colors hover:text-gousse-ink"
        >
          <ExternalLink size={14} aria-hidden />
          Open full page
        </Link>
      </header>

      {detail.isPending ? (
        <TransactionDetailSkeleton />
      ) : detail.isNotFound || txn == null ? (
        <Empty
          title="Couldn't load this transaction"
          description="It may have been deleted, or something went wrong."
        />
      ) : (
        // The same `gap-8` rhythm the page sets between these sections, so a row
        // read here and read there is laid out identically.
        <div className="flex flex-col gap-8">
          <TransactionDetailFields
            transaction={txn}
            account={detail.account}
            issuer={detail.issuer}
            category={detail.category}
            categoryColor={detail.categoryColor}
            linkedRefund={detail.linkedRefund}
          />
        </div>
      )}
    </aside>
  );
}
