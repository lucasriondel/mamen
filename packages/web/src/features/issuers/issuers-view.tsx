import type { Issuer } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Empty } from "@/components/ui/empty";
import { issuerQueries } from "@/lib/sdk";
import { IssuerCard } from "./issuer-card";

/**
 * Issuers view (PRD) — a card grid of the entities the user has created, each
 * showing avatar, name, transaction count, and net € total. Clicking a card
 * opens the edit dialog (rename + avatar), owned by {@link IssuerCard}.
 *
 * The view reads only the issuers `list`; each card owns its own transaction
 * query for the count/net (the contract has no per-issuer sum endpoint). Per the
 * PRD, a read failure shows an inline error state; write failures surface via
 * toast from the mutation hooks.
 */
export function IssuersView() {
	const issuersQuery = useQuery(issuerQueries.list({ orderBy: "name" }));
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	return (
		<section className="flex flex-col gap-6">
			<header>
				<h1 className="text-2xl font-semibold text-ink">Issuers</h1>
				<p className="mt-1 text-muted">
					The places your money comes from and goes to.
				</p>
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
					{issuers.map((issuer) => (
						<IssuerCard key={issuer.id} issuer={issuer} />
					))}
				</div>
			)}
		</section>
	);
}
