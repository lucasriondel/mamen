import type { Category, IssuerId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { resolveCategoryColors } from "@/lib/category-tree";
import { categoryQueries } from "@/lib/sdk";
import { EXCLUDED_LABEL, UNASSIGNED_LABEL } from "../spend-rows";
import type { RecapDetailTarget } from "./search";

/**
 * How a **recap detail** page names the bucket it is about — the same identity the
 * recap row carried, resolved again here because the detail page is reachable
 * directly by URL (a bookmark, a shared link) and cannot be handed the row's
 * already-resolved name.
 *
 * Deliberately the same shape as a recap `SpendRow`'s visual fields, so the header
 * paints the bucket exactly as the row the user clicked did: an issuer avatar
 * (with its **issuer default category** for the **Avatar fallback chain**) or a
 * category's icon in its **Resolved colour**.
 */
export type BucketIdentity = {
	/** The bucket's display name, or the *Unassigned* label. */
	name: string;
	/** Issuer image URL, for the by-issuer header. */
	imageUrl?: string;
	/** The issuer's default category id — the avatar resolves the chain from it. */
	defaultCategoryId?: number;
	/** The category's **Icon name** (a Lucide id), for the by-category header. */
	icon?: string;
	/** The category's **Resolved colour** (ADR 0006), resolved over the whole tree. */
	color?: string;
	isPending: boolean;
	isError: boolean;
};

/**
 * Resolve the target bucket's name and glyph (issue #86).
 *
 * Both reads are the ones the rest of the app already uses — the issuer lookup
 * asks for *this one id* rather than a page of the issuer table (#62), and the
 * category read is the whole (small) tree, because a nested category's colour is
 * inherited from an ancestor and can only be resolved with the tree in hand
 * (ADR 0006). The **Unassigned** bucket needs neither, and asks for neither: it
 * is named by {@link UNASSIGNED_LABEL} and carries no glyph, exactly as its recap
 * row does.
 */
export function useBucketIdentity(
	target: RecapDetailTarget | undefined,
): BucketIdentity {
	const bucket = target?.kind === "bucket" ? target : undefined;
	const isIssuer = bucket?.axis === "issuer";
	const isCategory = bucket?.axis === "category";
	const id = bucket?.bucket ?? null;

	const {
		issuersById,
		isPending: issuerPending,
		isError: issuerError,
	} = useIssuerLookup(isIssuer && id !== null ? [id as IssuerId] : []);

	// The whole tree, not just this leaf: the **Resolved colour** walk needs the
	// ancestors. Wide limit — a single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery({
		...categoryQueries.list({ limit: 200 }),
		enabled: isCategory && id !== null,
	});

	return useMemo(() => {
		if (target === undefined) {
			return { name: UNASSIGNED_LABEL, isPending: false, isError: false };
		}
		// The **excluded** target names itself (issue #87) — it is not an entity, so
		// there is nothing to resolve and no glyph to paint.
		if (target.kind === "excluded") {
			return { name: EXCLUDED_LABEL, isPending: false, isError: false };
		}
		if (target.bucket === null) {
			return { name: UNASSIGNED_LABEL, isPending: false, isError: false };
		}
		if (target.axis === "issuer") {
			const issuer = issuersById.get(target.bucket);
			return {
				name: issuer?.name ?? UNASSIGNED_LABEL,
				imageUrl: issuer?.imageUrl,
				defaultCategoryId: issuer?.defaultCategoryId,
				isPending: issuerPending,
				isError: issuerError,
			};
		}
		const categories = (categoriesQuery.data?.items ??
			[]) as readonly Category[];
		const category = categories.find((c) => c.id === target.bucket);
		return {
			name: category?.name ?? UNASSIGNED_LABEL,
			icon: category?.icon,
			color:
				category === undefined
					? undefined
					: resolveCategoryColors(categories).get(category.id),
			isPending: categoriesQuery.isPending,
			isError: categoriesQuery.isError,
		};
	}, [
		target,
		issuersById,
		issuerPending,
		issuerError,
		categoriesQuery.data,
		categoriesQuery.isPending,
		categoriesQuery.isError,
	]);
}
