import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import type { TransactionFilterValues } from "@/features/transactions/transactions-filters";
import {
	composeTransactionFilters,
	TransactionsSection,
} from "@/features/transactions/transactions-section";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { toPeriod } from "../search";
import { toDetailScope } from "./detail-scope";
import { RecapDetailHeader } from "./recap-detail-header";
import { accountsLabel, periodLabel } from "./scope-labels";
import { type RecapDetailSearch, toDetailTarget } from "./search";
import { useBucketIdentity } from "./use-bucket-identity";

const routeApi = getRouteApi("/recap-detail");

/**
 * The **recap detail** page (issue #86) — one recap line, opened up.
 *
 * The recap answers *how much*, per issuer and per category; this answers *which
 * transactions*. It is the same table, filter bar, sort and pagination every other
 * transactions surface uses ({@link TransactionsSection}), scoped to the line the
 * user clicked over the recap's own period and account selection
 * ({@link toDetailScope}) — so the rows here are the rows that line summed.
 *
 * Two kinds of line open it: a **bucket** on either breakdown, and the **excluded**
 * summary (issue #87) — the money held out of the totals, which has no bucket
 * because it is the complement of the spend rather than a slice of it.
 *
 * The scope is pinned, not editable: period and accounts arrive in the URL from
 * the recap and are stated in the header, because changing them would quietly make
 * this a different row's page. What the user *can* change is everything the
 * transactions view lets them change — including widening the recap-exclusion
 * filter the link seeds at `false`, to see what was held out of the total.
 */
export function RecapDetailView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	// Everything the URL pins — the target, the period, the accounts, and the scope
	// they compose into — derived in ONE memo keyed on `search`. The scope object's
	// identity is a query key downstream (the section memoizes its filters on it),
	// so rebuilding it each render would refetch the table on every render.
	const { target, period, accountIds, scope } = useMemo(() => {
		// `today` drives the current-month/year default, exactly as on the recap.
		const period = toPeriod(search, new Date());
		const accountIds = search.accountIds ?? [];
		const target = toDetailTarget(search);
		return {
			target,
			period,
			accountIds,
			scope:
				target === undefined
					? undefined
					: toDetailScope(target, period, accountIds),
		};
	}, [search]);

	const identity = useBucketIdentity(target);

	const accountsQuery = useQuery(accountQueries.list());
	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];

	// The signed net over the whole filtered set — from the `count` response,
	// sharing the section's scope + filters so the two can never disagree about
	// which rows they describe.
	const countFilters = useMemo(
		() => composeTransactionFilters(scope ?? {}, search),
		[scope, search],
	);
	const countQuery = useQuery({
		...transactionQueries.count(countFilters),
		enabled: scope !== undefined,
	});

	const applyFilters = (patch: TransactionFilterValues) => {
		navigate({
			search: (prev: RecapDetailSearch) => ({ ...prev, ...patch, page: 1 }),
		});
	};

	const toggleSort = () => {
		navigate({
			search: (prev: RecapDetailSearch) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
				page: 1,
			}),
		});
	};

	const goToPage = (page: number) => {
		navigate({ search: (prev: RecapDetailSearch) => ({ ...prev, page }) });
	};

	// The URL names neither a usable bucket nor the excluded view — only reachable
	// by hand-editing it. There is nothing to scope by, and querying unscoped would
	// show the whole table under a header claiming to be one line's rows.
	if (target === undefined || scope === undefined) {
		return (
			<section className="flex flex-col gap-6">
				<Link
					to="/recap"
					className="text-gousse-muted text-sm hover:text-gousse-ink"
				>
					← Recap
				</Link>
				<Empty
					title="Nothing to show"
					description="This link doesn't name an issuer, a category, or the excluded rows. Open a line from the recap to see its transactions."
				/>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-6">
			<TransactionsSection
				scope={scope}
				search={search}
				onFiltersChange={applyFilters}
				onToggleSort={toggleSort}
				onPageChange={goToPage}
				emptyDescription={
					target.kind === "excluded"
						? "Nothing was held out of the recap in this period."
						: "Nothing counted toward this recap row in the period."
				}
			>
				<RecapDetailHeader
					target={target}
					identity={identity}
					periodLabel={periodLabel(period)}
					accountsLabel={accountsLabel(accountIds, accounts)}
					total={countQuery.data?.total ?? 0}
					backSearch={{
						period: search.period,
						month: search.month,
						year: search.year,
						accountIds: search.accountIds,
					}}
				/>
			</TransactionsSection>
		</section>
	);
}
