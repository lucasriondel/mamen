import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { AccountMultiSelect } from "@/components/ui/account-multi-select";
import { Empty } from "@/components/ui/empty";
import { ExcludedSummaryLine } from "./excluded-summary-line";
import type { Period } from "./period";
import { PeriodSelector } from "./period-selector";
import { RecapSkeleton } from "./recap-skeleton";
import type { SpendSort } from "./recap-sort";
import { sortSpendRows } from "./recap-sort";
import { type RecapSearch, toPeriod, toSpendSort } from "./search";
import type { SpendRow } from "./spend-rows";
import { SpendSection } from "./spend-section";
import { TransferSummaryLine } from "./transfer-summary-line";
import { useRecapSpend } from "./use-recap-spend";

const routeApi = getRouteApi("/recap");

/** Sum a section's rows into its period total (a positive magnitude). */
function sumSpent(rows: readonly SpendRow[]): number {
	return rows.reduce((total, row) => total + row.spent, 0);
}

/**
 * Recap view (issue #35) — review spending by issuer and by category over a
 * period (month/year/all) and an optional multi-account filter.
 *
 * Filters + sort live in the route's typed URL search params, so a filtered
 * recap is bookmarkable and survives a refresh, mirroring the transactions and
 * issuers routes. The spend itself is summed **server-side** over the whole
 * period (issue #71) and read by {@link useRecapSpend}; the two pure sections
 * just sort and render. A read failure shows an inline `Empty`.
 */
export function RecapView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	// `today` drives the current-month/year default; read once per render.
	const period = toPeriod(search, new Date());
	const sort = toSpendSort(search);
	const accountIds = search.accountIds ?? [];

	const { spend, accounts, months, years, isPending, isError } = useRecapSpend(
		period,
		accountIds,
	);

	const byIssuer = useMemo(
		() => sortSpendRows(spend.byIssuer, sort),
		[spend.byIssuer, sort],
	);
	const byCategory = useMemo(
		() => sortSpendRows(spend.byCategory, sort),
		[spend.byCategory, sort],
	);

	const setPeriod = (next: Period) => {
		navigate({
			search: (prev: RecapSearch) => ({
				...prev,
				period: next.kind,
				month: next.kind === "month" ? next.month : undefined,
				year: next.kind === "year" ? next.year : undefined,
			}),
		});
	};

	const setAccounts = (ids: number[]) => {
		navigate({
			search: (prev: RecapSearch) => ({
				...prev,
				accountIds: ids.length > 0 ? ids : undefined,
			}),
		});
	};

	const setSort = (next: SpendSort) => {
		navigate({
			search: (prev: RecapSearch) => ({
				...prev,
				sort: next.key,
				direction: next.direction,
			}),
			replace: true,
		});
	};

	return (
		<section className="flex flex-col gap-6">
			<header>
				<PageHeader>
					<h1 className="text-2xl font-semibold text-gousse-ink text-balance">
						Recap
					</h1>
				</PageHeader>
				<p className="mt-1 text-gousse-muted">
					Where your money went, by issuer and by category.
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-3">
				<PeriodSelector
					period={period}
					months={months}
					years={years}
					onChange={setPeriod}
				/>
				<AccountMultiSelect
					accounts={accounts}
					selected={accountIds}
					onChange={setAccounts}
				/>
			</div>

			{isError ? (
				<Empty
					title="Couldn't load your recap"
					description="Something went wrong reading your spending. Try again in a moment."
				/>
			) : isPending ? (
				<RecapSkeleton />
			) : (
				<>
					{/* Both lines open their own rows in the transactions list (issue #87). */}
					{spend.transfers.count > 0 ? (
						<TransferSummaryLine
							transfers={spend.transfers}
							period={period}
							accountIds={accountIds}
						/>
					) : null}
					{spend.excluded.count > 0 ? (
						<ExcludedSummaryLine
							excluded={spend.excluded}
							period={period}
							accountIds={accountIds}
						/>
					) : null}
					<div className="grid gap-6 lg:grid-cols-2">
						<SpendSection
							title="By issuer"
							sortLabel="Sort issuers"
							axis="issuer"
							rows={byIssuer}
							total={sumSpent(byIssuer)}
							sort={sort}
							onSortChange={setSort}
							period={period}
							accountIds={accountIds}
						/>
						<SpendSection
							title="By category"
							sortLabel="Sort categories"
							axis="category"
							rows={byCategory}
							total={sumSpent(byCategory)}
							sort={sort}
							onSortChange={setSort}
							period={period}
							accountIds={accountIds}
						/>
					</div>
				</>
			)}
		</section>
	);
}
