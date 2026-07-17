import type { Issuer } from "@mamen/shared/contract";

/**
 * Does any already-loaded issuer already carry this name (trimmed,
 * case-insensitive)? The single guard both issuer-create surfaces share — the
 * transactions assignment picker and the standalone create form — so "create"
 * is offered only when the name is genuinely new to the loaded set.
 *
 * This is a UX nicety, not an invariant: the contract enforces no name
 * uniqueness (migration `0003` uses a non-unique index), so this only guards the
 * names the client has in hand. It never blocks the server.
 */
export function hasExactIssuerName(
	issuers: readonly Issuer[],
	name: string,
): boolean {
	const trimmed = name.trim().toLowerCase();
	return issuers.some((issuer) => issuer.name.trim().toLowerCase() === trimmed);
}
