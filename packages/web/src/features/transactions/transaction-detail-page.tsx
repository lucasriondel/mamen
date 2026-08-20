import type { TransactionId } from "@mamen/shared/contract";
import { getRouteApi, Link } from "@tanstack/react-router";
import { BackLink } from "@/components/back-link";
import { PageLayout } from "@/components/page-layout";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BUTTON_CLASS } from "@/features/issuers/field-styles";
import { cn } from "@/lib/utils";
import { TransactionDetailContent } from "./transaction-detail-content";
import { TransactionDetailSkeleton } from "./transaction-detail-skeleton";
import { useTransactionDetail } from "./use-transaction-detail";

const routeApi = getRouteApi("/transactions_/$transactionId");

/**
 * The transaction **detail page** at `/transactions/$transactionId` — reached by
 * a link from anywhere in the app, and by a row click on a viewport too narrow
 * to hold the grid's **detail panel** beside its table (issue #154). Shows every
 * field the app holds for one transaction.
 *
 * This component owns the page's *chrome*: the topbar, the way back, and the
 * loading / not-found states a page can be in. The reads behind it are
 * {@link useTransactionDetail}, shared with the panel so the two surfaces cannot
 * disagree about what a transaction is; the resolved render is
 * {@link TransactionDetailContent}.
 */
export function TransactionDetailPage() {
  const { transactionId } = routeApi.useParams();
  const id = Number(transactionId) as TransactionId;

  const detail = useTransactionDetail(id);

  if (detail.isPending) {
    // The wait is a page too (issue #129): the collapse flag outlives the
    // navigation that got here, so the way back to the panel has to survive the
    // read. The topbar is the settled page's, slot for slot — the counterparty,
    // the date and the amount stand in as placeholders where each will land,
    // so the row arriving fills the header rather than replacing it.
    return (
      <PageLayout
        back={<BackLink to="/transactions">Transactions</BackLink>}
        title={
          <>
            {/* `h-7`: one line of the title's `text-2xl`, which is what lands
                in its place. */}
            <Skeleton as="span" className="block h-7 w-56" />
            {/* Never an empty heading: until the row names it, the page is
                titled by what it is — the same stand-in the not-found state
                below settles on, for the same reason. The wait itself is
                announced by the skeleton's live region, not twice here. */}
            <span className="sr-only">Transaction</span>
          </>
        }
        description={<Skeleton as="span" className="block h-3.5 w-24" />}
        actions={<Skeleton as="span" className="block h-7 w-24" />}
        className="gap-8"
      >
        <TransactionDetailSkeleton />
      </PageLayout>
    );
  }

  const txn = detail.transaction;
  if (detail.isNotFound || txn == null) {
    // Still a page, so still a topbar: this state has no counterparty to name,
    // but a user who arrived here with the sidebar collapsed needs the way back
    // to it as much as on any other page (issue #129).
    return (
      <PageLayout title="Transaction" back={<BackLink to="/transactions">Transactions</BackLink>}>
        <Empty
          title="Couldn't load this transaction"
          description="It may have been deleted, or something went wrong. Head back to the grid."
        >
          <Link to="/transactions" className={cn(BUTTON_CLASS, "mt-2")}>
            Back to transactions
          </Link>
        </Empty>
      </PageLayout>
    );
  }

  return (
    <TransactionDetailContent
      transaction={txn}
      account={detail.account}
      issuer={detail.issuer}
      category={detail.category}
      categoryColor={detail.categoryColor}
      linkedRefund={detail.linkedRefund}
    />
  );
}
