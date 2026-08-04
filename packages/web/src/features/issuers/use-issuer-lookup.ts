import type { Issuer, IssuerId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { issuerQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";

/** What {@link useIssuerLookup} hands back: the map, plus the read's state. */
export type IssuerLookup = {
	/** The issuers asked for, indexed by id — the map a row resolves through. */
	issuersById: ReadonlyMap<number, Issuer>;
	/** True while the ids on screen are still being resolved. */
	isPending: boolean;
	isError: boolean;
};

/**
 * Resolve **the issuers a surface is showing**, by the ids it is showing.
 *
 * Every list of transactions has to turn `issuerId` into a name, and the obvious
 * way to do that — read the issuer table, index it, look each row up — is wrong
 * in a way that only appears once the table grows: `list` pages by id, so an
 * issuer created moments ago sorts last and falls off the page that was read.
 * The row pointing at it then renders *unresolved* — raw counterparty text and a
 * picker offering to assign the issuer it already has — and a rule that matched
 * perfectly looks broken (#62).
 *
 * So the question is turned around. A caller passes the `issuerId`s of the rows
 * it is rendering (nulls and duplicates welcome — a page of fifty rows names at
 * most fifty issuers and usually far fewer) and gets back exactly those, however
 * many issuers exist and wherever their ids sort. An empty set costs no request.
 *
 * The trade is one dependent read: the ids come from the rows, so this resolves
 * a beat after them. Callers hold their skeleton until `isPending` clears rather
 * than flashing a page of rows as unresolved — which is the very state this
 * exists to prevent.
 */
export function useIssuerLookup(
	issuerIds: Iterable<IssuerId | null | undefined>,
): IssuerLookup {
	const ids: IssuerId[] = [];
	for (const id of issuerIds) {
		if (id != null) ids.push(id);
	}

	// A fresh-but-equal id array hits the same cache entry: `byIds` normalises the
	// set into the query key, which react-query hashes structurally.
	const query = useQuery(issuerQueries.byIds(ids));

	const issuersById = useMemo(
		() => indexById((query.data?.items ?? []) as readonly Issuer[]),
		[query.data],
	);

	return {
		issuersById,
		isPending: query.isPending,
		isError: query.isError,
	};
}
