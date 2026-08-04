import type { Issuer } from "@mamen/shared/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { issuerQueries } from "@/lib/sdk";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * How long typing settles before a term is sent. Short enough that the list
 * feels typed-into rather than fetched, long enough that a word costs one
 * request instead of one per letter.
 */
export const ISSUER_SEARCH_DEBOUNCE_MS = 150;

export interface IssuerSearchOptions {
	/** What the user has typed. A blank term asks for a page to browse. */
	query: string;
	/** False while the surface is closed — a shut picker costs no request. */
	enabled: boolean;
	/**
	 * Issuers **already on screen** — offered whatever the search page holds.
	 * The picker's own row issuer is the case this exists for: the caller has
	 * the whole entity in hand, so nothing needs fetching to show it.
	 */
	pinned?: readonly Issuer[];
}

/**
 * The issuers a picker can offer: **the ones already on screen, plus the ones
 * whose name matches what was typed** (#79).
 *
 * The counterpart of {@link useIssuerLookup}, which names the rows a surface is
 * showing. A picker asks the other question — *which issuer could this be?* —
 * and used to answer it by reading the issuer table and filtering the page it
 * got back. That put a cliff under the choice at the page size: past it an
 * issuer that plainly existed could not be picked, however precisely its name
 * was typed, and every open of the picker paid for the whole table to offer a
 * list the user narrows to one row anyway.
 *
 * So the matching moves to the server and the pinned issuers come from the
 * screen. Neither half has a ceiling: the search sees every issuer there is and
 * returns a page of *matches*, and the row's own issuer is already in hand.
 *
 * Typing is debounced, and the previous term's matches stay on screen while the
 * next term is in flight (`keepPreviousData`). What bridges the two is the
 * *live* query, applied here over both halves: the list narrows on the keystroke
 * and can only ever hide a row the next response would drop anyway, so it never
 * blinks empty and never offers a name that doesn't match what is typed. That
 * also means a caller renders what it is given — a picker holding its own copy
 * of the rule is a second answer to the question this hook exists to answer.
 */
export function useIssuerSearch({
	query,
	enabled,
	pinned = [],
}: IssuerSearchOptions): readonly Issuer[] {
	const term = useDebouncedValue(query, ISSUER_SEARCH_DEBOUNCE_MS);
	const search = useQuery({
		...issuerQueries.searchByName(term),
		enabled,
		placeholderData: keepPreviousData,
	});

	const matches = (search.data?.items ?? []) as readonly Issuer[];
	const onScreen = new Set(pinned.map((issuer) => issuer.id));
	// Pinned first, and never twice: a pinned issuer usually matches the search
	// too, and the same issuer listed under two rows is two answers to one
	// question. A pinned issuer is held to the query like any other — the row's
	// own issuer is a candidate, not a fixture.
	return [
		...pinned.filter((issuer) => matchesQuery(issuer, query)),
		...matches.filter(
			(issuer) => !onScreen.has(issuer.id) && matchesQuery(issuer, query),
		),
	];
}

/** Case-insensitive substring match of an issuer name against the query. */
function matchesQuery(issuer: Issuer, query: string): boolean {
	return issuer.name.toLowerCase().includes(query.trim().toLowerCase());
}
