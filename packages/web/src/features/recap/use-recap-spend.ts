import type { Account, AccountId, Category } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { accountQueries, categoryQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import type { Period } from "./period";
import { periodToFilter } from "./period";
import { type RecapSpend, toSpendRows } from "./spend-rows";

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
}

/** The empty summary the view renders while the aggregation is in flight. */
const NO_SPEND: RecapSpend = {
	byIssuer: [],
	byCategory: [],
	transfers: { total: 0, count: 0 },
	excluded: { total: 0, count: 0 },
};

/**
 * Load the recap page's spend (issue #35, moved server-side by #71).
 *
 * One request, whatever the account selection: the period becomes an inclusive
 * `startDate`/`endDate` bound on the transaction **date** and the selected
 * accounts ride as a set, and the API returns the totals already summed by
 * issuer and by category over the **whole** filtered set. There is no page to
 * scan, no row cap, and nothing here re-expresses which rows count toward
 * spend — a transfer leg, an excluded row, a duplicate and a **bundle member**
 * are all held out by the server's one `countsTowardRecap` predicate. What is
 * left client-side is naming the buckets ({@link toSpendRows}).
 *
 * The month/year picker options come from a separate unscoped read (a period
 * must not disappear because you navigated away from it), likewise derived from
 * the transaction date.
 */
export function useRecapSpend(
	period: Period,
	accountIds: readonly number[],
): RecapSpendResult {
	const accountsQuery = useQuery(accountQueries.list());
	const categoriesQuery = useQuery(categoryQueries.list({ limit: 200 }));
	const periodsQuery = useQuery(transactionQueries.recapPeriods());

	// Computed inline each render — no memo needed: the query is keyed by its
	// serialized params, so a fresh-but-equal param object hits the same cache
	// entry rather than refetching.
	const recapQuery = useQuery(
		transactionQueries.recap({
			...periodToFilter(period),
			// An empty selection is "every account", which is the absent filter —
			// passing `[]` would ask for the accounts in an empty set, i.e. nothing.
			...(accountIds.length > 0
				? { accountId: accountIds as ReadonlyArray<AccountId> }
				: {}),
		}),
	);

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const categoriesById = useMemo(() => indexById(categories), [categories]);

	const summary = recapQuery.data;

	// The breakdown names the issuers of the buckets it shows — so it asks for
	// those ids, not for the issuer table, none of which can fall off a page this
	// way (#62). The set is now the *buckets*' ids rather than every scanned row's.
	const {
		issuersById,
		isPending: issuersPending,
		isError: issuersError,
	} = useIssuerLookup(summary?.byIssuer.map((b) => b.id) ?? []);

	const spend = useMemo(
		() =>
			summary === undefined
				? NO_SPEND
				: toSpendRows(summary, { issuersById, categoriesById }),
		[summary, issuersById, categoriesById],
	);

	const { months, years } = useMemo(() => {
		const monthList = [...(periodsQuery.data?.months ?? [])];
		const yearList = [...new Set(monthList.map((m) => m.slice(0, 4)))];
		return { months: monthList, years: yearList };
	}, [periodsQuery.data]);

	// The issuer lookup reads the ids of the buckets, so it lands a beat after
	// them — folded into `isPending` so the view holds its skeleton rather than
	// briefly showing every bucket as *Unassigned*.
	const isPending =
		accountsQuery.isPending ||
		issuersPending ||
		categoriesQuery.isPending ||
		recapQuery.isPending;
	const isError =
		accountsQuery.isError ||
		issuersError ||
		categoriesQuery.isError ||
		recapQuery.isError;

	return { spend, accounts, months, years, isPending, isError };
}
