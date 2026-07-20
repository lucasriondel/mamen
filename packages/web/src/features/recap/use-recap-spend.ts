import type {
	Account,
	AccountId,
	Category,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	accountQueries,
	categoryQueries,
	issuerQueries,
	type TransactionListParams,
	transactionQueries,
} from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import type { Period } from "./period";
import { periodToFilter } from "./period";
import { aggregateSpend, type RecapSpend } from "./recap-aggregate";

/**
 * How many transactions to scan per account when summing spend. The contract has
 * no server-side sum endpoint (only a signed-net `count`), so the recap lists the
 * filtered rows and reduces `amount` client-side — mirroring the issuers grid's
 * wide scan. A single user's per-account/month history is small (PRD).
 */
const RECAP_SCAN_LIMIT = 1000;

/** What {@link useRecapSpend} returns to the view. */
export interface RecapSpendResult {
	spend: RecapSpend;
	accounts: readonly Account[];
	/** Every distinct `YYYY-MM` month present, newest first — for the month picker. */
	months: string[];
	/** Every distinct `YYYY` year present, newest first — for the year picker. */
	years: string[];
	isPending: boolean;
	isError: boolean;
	/**
	 * True when at least one account's filtered set exceeds {@link RECAP_SCAN_LIMIT}
	 * and the scan saw only its first page — so the displayed totals are partial.
	 * The view surfaces this rather than silently under-reporting spend.
	 */
	truncated: boolean;
}

/**
 * Load and aggregate the recap page's spend (issue #35).
 *
 * The account filter is multi-select but the list endpoint's `accountId` is
 * single-valued, so a non-empty selection fans out one query per account (via
 * `useQueries`) and the results are merged; an empty selection is a single
 * unfiltered query (all accounts). The period becomes an `importMonth` or a
 * `startDate`/`endDate` bound. The merged rows are aggregated by issuer and
 * category through the pure {@link aggregateSpend}.
 *
 * The month/year picker options come from a separate wide unfiltered scan (the
 * contract has no distinct-period endpoint), so switching period never drops the
 * option the user might switch back to.
 */
export function useRecapSpend(
	period: Period,
	accountIds: readonly number[],
): RecapSpendResult {
	const accountsQuery = useQuery(accountQueries.list());
	const issuersQuery = useQuery(issuerQueries.list());
	const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));

	// The full unfiltered history, capped, purely to enumerate the distinct
	// months/years the pickers offer.
	const periodsQuery = useQuery(
		transactionQueries.list({ limit: RECAP_SCAN_LIMIT, offset: 0 }),
	);

	// One spend query per selected account, or a single all-accounts query when
	// the selection is empty. Computed inline each render — no memo needed: each
	// query is keyed by its serialized params, so a fresh-but-equal param object
	// hits the same cache entry rather than refetching.
	const base: TransactionListParams = {
		...periodToFilter(period),
		limit: RECAP_SCAN_LIMIT,
		offset: 0,
	};
	const spendParams: TransactionListParams[] =
		accountIds.length === 0
			? [base]
			: accountIds.map((id) => ({ ...base, accountId: id as AccountId }));

	const spendQueries = useQueries({
		queries: spendParams.map((params) => transactionQueries.list(params)),
	});

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const issuersById = useMemo(() => indexById(issuers), [issuers]);
	const categoriesById = useMemo(() => indexById(categories), [categories]);

	// Merge every account query's page into one row set before aggregating.
	const transactions = useMemo<Transaction[]>(
		() =>
			spendQueries.flatMap(
				(q) => (q.data?.items ?? []) as readonly Transaction[],
			),
		[spendQueries],
	);

	const spend = useMemo(
		() => aggregateSpend(transactions, { issuersById, categoriesById }),
		[transactions, issuersById, categoriesById],
	);

	const { months, years } = useMemo(() => {
		const items = (periodsQuery.data?.items ?? []) as readonly Transaction[];
		const monthSet = new Set(items.map((t) => t.importMonth));
		const monthList = [...monthSet].sort().reverse();
		const yearList = [...new Set(monthList.map((m) => m.slice(0, 4)))]
			.sort()
			.reverse();
		return { months: monthList, years: yearList };
	}, [periodsQuery.data]);

	const isPending =
		accountsQuery.isPending ||
		issuersQuery.isPending ||
		categoriesQuery.isPending ||
		spendQueries.some((q) => q.isPending);
	const isError =
		accountsQuery.isError ||
		issuersQuery.isError ||
		categoriesQuery.isError ||
		spendQueries.some((q) => q.isError);

	// A query's `total` is the full filtered count; if it exceeds the page we
	// scanned, the sums built from `items` are partial. `Paged.total` gives this
	// for free, so no extra request is needed to detect it.
	const truncated = spendQueries.some(
		(q) => (q.data?.total ?? 0) > (q.data?.items.length ?? 0),
	);

	return { spend, accounts, months, years, isPending, isError, truncated };
}
