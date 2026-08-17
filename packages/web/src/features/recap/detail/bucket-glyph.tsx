import { CategoryIcon } from "@/components/category-icon";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import type { RecapDetailAxis } from "./search";
import type { BucketIdentity } from "./use-bucket-identity";

/**
 * The bucket's leading glyph — the same branch the recap row makes: a category's
 * Lucide icon in its **Resolved colour**, or an issuer avatar painting the
 * **Avatar fallback chain** from the issuer's default category (issue #59). The
 * *Unassigned* bucket carries neither, so it renders no glyph at all.
 *
 * It used to be one part of a hand-composed `RecapDetailHeader`; since issue
 * #129 the title row is the shared `PageLayout`'s, and this is the mark the page
 * puts *in* it.
 */
export function BucketGlyph({
	axis,
	identity,
}: {
	axis: RecapDetailAxis;
	identity: BucketIdentity;
}) {
	if (axis === "category") {
		if (identity.icon === undefined) return null;
		return (
			<CategoryIcon name={identity.icon} color={identity.color} size={22} />
		);
	}
	if (
		identity.imageUrl === undefined &&
		identity.defaultCategoryId === undefined
	)
		return null;
	return (
		<IssuerAvatar
			imageUrl={identity.imageUrl}
			defaultCategoryId={identity.defaultCategoryId}
			size="sm"
		/>
	);
}
