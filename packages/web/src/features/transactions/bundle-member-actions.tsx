import type {
	Category,
	CategoryId,
	Issuer,
	IssuerId,
	Transaction,
} from "@mamen/shared/contract";
import { Button } from "@/components/ui/button";

export type BundleMemberActionsProps = {
	/** The member these controls act on (or act *from*). */
	member: Transaction;
	/** The **bundle parent** the shortcuts write onto — read for what it already carries. */
	parent: Transaction;
	/** The member's issuer, resolved by the caller (issue #62). */
	issuer?: Issuer;
	/** The member's **derived category**, resolved by the caller. */
	category?: Category;
	onCopyIssuer: (issuerId: IssuerId) => void;
	onCopyCategory: (categoryId: CategoryId) => void;
	onRemove: () => void;
	/** True while any write on the bundle is in flight — every control waits. */
	disabled: boolean;
};

/**
 * The **Actions** cell of one **bundle member** — the shortcuts that copy its
 * identity onto the parent, and the way out of the bundle. Everything the member
 * *is* (its date, account, issuer, category, amount) is the table's business:
 * the member list is the ordinary {@link TransactionsTable}, so a bundle's
 * contents read exactly like the transactions list they came from, and this
 * fills the one column that list does not have.
 *
 * Most bundles are one merchant plus refunds — three charges at the same
 * supermarket, then two people paying you back — so the issuer and the category
 * the parent wants are usually already sitting on a member, and retyping them
 * is busywork.
 *
 * Copying is a plain curation write on the parent (`manualIssuer` /
 * `manualCategory`, the same mutations the table's pickers use), so nothing new
 * happens to the row: it is a hand pick that happens to have been *chosen* by
 * pointing at a member. The category offered is the member's **derived** one
 * (through its own issuer, ADR 0002) — what the user sees on that row is what
 * lands on the parent, rather than a stored column they were never shown. The
 * label is untouched by either — a bundle can be named "Weekend Bretagne" and
 * still carry the issuer Carrefour.
 *
 * A member with neither offers neither: an absent button says "nothing to copy"
 * more plainly than a disabled one. A member whose issuer/category the parent
 * *already* carries keeps its button, disabled — the row is not missing
 * anything, and hiding it would read as "this member has no issuer".
 *
 * Removal (issue #74) sits here for the same reason: the wrong row gets swept
 * in, and the place to notice it is the list of what the bundle stands for.
 * Leaving is not deleting — the row returns to the list as it was.
 *
 * Presentational: it decides what to offer, {@link BundleSection} decides what
 * each offer writes.
 */
export function BundleMemberActions({
	member,
	parent,
	issuer,
	category,
	onCopyIssuer,
	onCopyCategory,
	onRemove,
	disabled,
}: BundleMemberActionsProps) {
	const hasIssuer = member.issuerId != null;
	const hasCategory = member.categoryId != null;
	const sameIssuer = hasIssuer && parent.issuerId === member.issuerId;
	const sameCategory = hasCategory && parent.categoryId === member.categoryId;

	return (
		<>
			{hasIssuer ? (
				<Button
					variant="secondary"
					size="sm"
					disabled={disabled || sameIssuer}
					aria-label={`Use ${issuer?.name ?? member.rawIssuerString} as this bundle's issuer`}
					title={
						sameIssuer ? "This bundle already carries this issuer" : undefined
					}
					onClick={() => onCopyIssuer(member.issuerId as IssuerId)}
				>
					Use issuer
				</Button>
			) : null}
			{hasCategory ? (
				<Button
					variant="secondary"
					size="sm"
					disabled={disabled || sameCategory}
					aria-label={`Use ${category?.name ?? "this member's category"} as this bundle's category`}
					title={
						sameCategory
							? "This bundle already carries this category"
							: undefined
					}
					onClick={() => onCopyCategory(member.categoryId as CategoryId)}
				>
					Use category
				</Button>
			) : null}
			<Button
				variant="ghost"
				size="sm"
				disabled={disabled}
				aria-label={`Remove ${member.rawIssuerString} from this bundle`}
				onClick={onRemove}
			>
				Remove
			</Button>
		</>
	);
}
