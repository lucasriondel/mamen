import type { Account, Category, Issuer, Transaction, TransactionId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { resolveCategoryColor } from "@/lib/category-tree";
import { accountQueries, categoryQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";

/** The whole (small) category tree, for the derived-category name lookup. */
const CATEGORY_SCAN_LIMIT = 200;

/** One transaction and everything its foreign keys point at, plus the read's state. */
export interface TransactionDetail {
  /** The row itself, once it has landed and only if the id names one. */
  transaction?: Transaction;
  /** Resolved account for `accountId`. */
  account?: Account;
  /** Resolved issuer for `issuerId`, if the row has one. */
  issuer?: Issuer;
  /** Resolved **derived** category for `categoryId`, if the row has one. */
  category?: Category;
  /** That category's **Resolved colour**, resolved against the whole tree. */
  categoryColor?: string;
  /** Resolved counterpart for `linkedRefundId`, if the row links a refund. */
  linkedRefund?: Transaction;
  /** True until the row *and* the issuer that names it have both landed. */
  isPending: boolean;
  /** The read failed, or the id names no row — the same dead end either way. */
  isNotFound: boolean;
}

/**
 * Read one transaction and resolve its foreign keys — the account, the issuer,
 * the derived category and its colour, and the counterpart of a linked refund.
 *
 * The **two surfaces that show a transaction** share this (issue #154): the
 * standalone page at `/transactions/$transactionId` and the detail panel beside
 * the grid at `/transactions?selected=…`. They differ in their chrome — a page
 * has a topbar and a back link, a panel has a close button — and in nothing
 * else, so the five reads and the states they can be in live here rather than
 * once per surface, where they would drift.
 *
 * The lookups are the same small, wide list queries the grid uses, so they are
 * already warm in the cache whenever the panel opens over a list the user was
 * just reading.
 *
 * `isPending` covers the row *and* its issuer, which is a dependent read: the id
 * comes off the row, so it lands a beat later. A caller that showed the row at
 * the first opportunity would title it with the raw bank string and then swap in
 * the issuer's name — the very flash the by-ids lookup exists to prevent (#62).
 */
export function useTransactionDetail(id: TransactionId): TransactionDetail {
  const txnQuery = useQuery(transactionQueries.getById(id));
  const accountsQuery = useQuery(accountQueries.list());
  const categoriesQuery = useQuery(categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }));
  // This row's issuer, asked for by its id — one issuer, not the issuer table (#62).
  const { issuersById, isPending: issuerPending } = useIssuerLookup([txnQuery.data?.issuerId]);
  // A refunded row links its counterpart; fetch it too so the link can show the
  // counterpart's date + amount rather than a bare id (disabled when unlinked).
  const linkedRefundId = txnQuery.data?.linkedRefundId;
  const linkedRefundQuery = useQuery({
    ...transactionQueries.getById(linkedRefundId as TransactionId),
    enabled: linkedRefundId != null,
  });

  if (txnQuery.isPending || issuerPending) {
    return { isPending: true, isNotFound: false };
  }

  const transaction = txnQuery.data as Transaction | undefined;
  if (txnQuery.isError || transaction == null) {
    return { isPending: false, isNotFound: true };
  }

  const accountsById = indexById((accountsQuery.data?.items ?? []) as readonly Account[]);
  const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
  const category =
    transaction.categoryId != null ? indexById(categories).get(transaction.categoryId) : undefined;

  return {
    transaction,
    account: accountsById.get(transaction.accountId),
    issuer: transaction.issuerId != null ? issuersById.get(transaction.issuerId) : undefined,
    category,
    categoryColor: category != null ? resolveCategoryColor(categories, category) : undefined,
    linkedRefund: (linkedRefundQuery.data as Transaction | undefined) ?? undefined,
    isPending: false,
    isNotFound: false,
  };
}
