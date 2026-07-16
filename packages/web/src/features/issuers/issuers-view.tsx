import type { Issuer, Transaction } from "@mamen/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { Empty } from "@/components/ui/empty";
import { cardEntrance } from "@/lib/motion";
import { issuerQueries, transactionQueries } from "@/lib/sdk";
import { IssuerCard } from "./issuer-card";
import {
	type IssuerMetrics,
	type IssuerSort,
	issuerMetrics,
	sortIssuers,
} from "./issuer-sort";
import { IssuerSortControl } from "./issuer-sort-control";
import { type IssuersSearch, toIssuerSort } from "./search";

const routeApi = getRouteApi("/issuers/");

/**
 * How many of an issuer's transactions to scan when deriving its € totals. Per-
 * issuer counts are small (PRD), so one wide page covers them; the `count`
 * itself comes from the server total, not this page's length.
 */
const ISSUER_TXN_SCAN_LIMIT = 1000;

/**
 * Issuers view (PRD) — a card grid of the entities the user has created, each
 * showing avatar, name, transaction count, and net € total. Clicking a card
 * navigates to the issuer detail page (`/issuers/$issuerId`), owned by
 * {@link IssuerCard}.
 *
 * The grid can be sorted by name, transaction count, or total value moved (issue
 * #41); the chosen sort lives in the route's URL search params so it is
 * bookmarkable and survives a refresh. Because count and value are derived
 * client-side, the view fetches every issuer's transactions here (one query
 * each, via `useQueries`), computes the metrics once, sorts, and hands the
 * count/net down to each presentational card. Per the PRD, a read failure shows
 * an inline error state.
 */
export function IssuersView() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	const sort = toIssuerSort(search);
	const reducedMotion = useReducedMotion() ?? false;

	// Always fetch the issuers alphabetically; the client re-sorts to the chosen
	// key/direction so switching sorts never triggers a list refetch.
	const issuersQuery = useQuery(issuerQueries.list({ orderBy: "name" }));
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const txnQueries = useQueries({
		queries: issuers.map((issuer) => ({
			...transactionQueries.list({
				issuerId: issuer.id,
				limit: ISSUER_TXN_SCAN_LIMIT,
			}),
		})),
	});

	const metrics = useMemo<IssuerMetrics[]>(
		() =>
			sortIssuers(
				issuers.map((issuer, i) => {
					const q = txnQueries[i];
					const items = (q?.data?.items ?? []) as readonly Transaction[];
					return issuerMetrics(issuer, items, q?.data?.total ?? 0);
				}),
				sort,
			),
		[issuers, txnQueries, sort],
	);

	const onSortChange = (next: IssuerSort) =>
		navigate({
			search: (prev: IssuersSearch) => ({
				...prev,
				sort: next.key,
				direction: next.direction,
			}),
			replace: true,
		});

	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold text-ink">Issuers</h1>
					<p className="mt-1 text-muted">
						The places your money comes from and goes to.
					</p>
				</div>
				{issuers.length > 0 ? (
					<IssuerSortControl sort={sort} onChange={onSortChange} />
				) : null}
			</header>

			{issuersQuery.isError ? (
				<Empty
					title="Couldn't load issuers"
					description="Something went wrong reading your issuers. Try again in a moment."
				/>
			) : issuersQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading issuers…</p>
			) : issuers.length === 0 ? (
				<Empty
					title="No issuers yet"
					description="Resolve a transaction's counterparty to create your first issuer."
				/>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
					{metrics.map(({ issuer, count, net }, index) => (
						<motion.div key={issuer.id} {...cardEntrance(index, reducedMotion)}>
							<IssuerCard issuer={issuer} count={count} net={net} />
						</motion.div>
					))}
				</div>
			)}
		</section>
	);
}
