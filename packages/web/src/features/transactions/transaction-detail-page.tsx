import type {
	Account,
	Category,
	Issuer,
	Transaction,
	TransactionId,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Empty } from "@/components/ui/empty";
import { BUTTON_CLASS } from "@/features/issuers/field-styles";
import {
	accountQueries,
	categoryQueries,
	issuerQueries,
	transactionQueries,
} from "@/lib/sdk";
import { cn, indexById } from "@/lib/utils";
import { TransactionDetailContent } from "./transaction-detail-content";

const routeApi = getRouteApi("/transactions_/$transactionId");

/** The whole (small) category tree, for the derived-category name lookup. */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * The transaction **detail page** at `/transactions/$transactionId`, reached by
 * clicking a row in the grid. Shows every field the app holds for one transaction.
 *
 * This outer component owns the async reads — the transaction itself plus the
 * account / issuer / category lookups needed to resolve its foreign keys — and the
 * loading / not-found states; once the row resolves it hands off to
 * {@link TransactionDetailContent} for the pure render. The lookups are the same
 * small, wide list queries the grid uses, so they're already warm in the cache.
 */
export function TransactionDetailPage() {
	const { transactionId } = routeApi.useParams();
	const id = Number(transactionId) as TransactionId;

	const txnQuery = useQuery(transactionQueries.getById(id));
	const accountsQuery = useQuery(accountQueries.list());
	const issuersQuery = useQuery(issuerQueries.list());
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }),
	);
	// A refunded row links its counterpart; fetch it too so the link can show the
	// counterpart's date + amount rather than a bare id (disabled when unlinked).
	const linkedRefundId = txnQuery.data?.linkedRefundId;
	const linkedRefundQuery = useQuery({
		...transactionQueries.getById(linkedRefundId as TransactionId),
		enabled: linkedRefundId != null,
	});

	if (txnQuery.isPending) {
		return <p className="py-16 text-center text-muted">Loading transaction…</p>;
	}

	const txn = txnQuery.data as Transaction | undefined;
	if (txnQuery.isError || txn == null) {
		return (
			<Empty
				title="Couldn't load this transaction"
				description="It may have been deleted, or something went wrong. Head back to the grid."
			>
				<Link to="/transactions" className={cn(BUTTON_CLASS, "mt-2")}>
					Back to transactions
				</Link>
			</Empty>
		);
	}

	const accountsById = indexById(
		(accountsQuery.data?.items ?? []) as readonly Account[],
	);
	const issuersById = indexById(
		(issuersQuery.data?.items ?? []) as readonly Issuer[],
	);
	const categoriesById = indexById(
		(categoriesQuery.data?.items ?? []) as readonly Category[],
	);

	return (
		<TransactionDetailContent
			transaction={txn}
			account={accountsById.get(txn.accountId)}
			issuer={txn.issuerId != null ? issuersById.get(txn.issuerId) : undefined}
			category={
				txn.categoryId != null ? categoriesById.get(txn.categoryId) : undefined
			}
			linkedRefund={
				(linkedRefundQuery.data as Transaction | undefined) ?? undefined
			}
		/>
	);
}
