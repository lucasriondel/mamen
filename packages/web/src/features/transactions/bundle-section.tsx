import type { Category, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { formatCurrency } from "@/lib/format";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { BundleDateForm } from "./bundle-date-form";
import { BundleDissolveBlock } from "./bundle-dissolve-block";
import { BundleMemberRow } from "./bundle-member-row";
import { TransferLegsSkeleton } from "./transfer-legs-skeleton";
import { useAssignIssuer } from "./use-assign-issuer";
import { useBundle } from "./use-bundle";
import { useCategoryOverride } from "./use-category-override";

/** How many members of one bundle to fetch. A bundle is a handful of rows. */
const MEMBER_SCAN_LIMIT = 50;

/** The whole (small) category tree, for the member's category name. */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * The **Bundle** block on a bundle parent's detail page (issue #72, epic #66) —
 * everything about the row that is *not* already a transaction field.
 *
 * The parent is a real transaction row, so its issuer, category and notes are
 * edited through the page's ordinary controls, above; what lives here is what
 * only a bundle has, one named child per concern:
 *
 * - **The members it stands for**, each linking to its own page, each offering
 *   to copy its issuer or its category onto the parent
 *   ({@link BundleMemberRow}), and each offering the way out of the bundle
 *   (#74).
 * - **The date** ({@link BundleDateForm}), which defaults to the earliest
 *   member's and may be overridden. The override is flagged `manualDate` so the
 *   recompute that every later membership change runs (#74) keeps it: the
 *   derived date is a starting point, not a constraint.
 * - **Dissolving** the bundle ({@link BundleDissolveBlock}, #74) — the parent
 *   row goes and every member comes back to the list. The members are real bank
 *   rows, so this is never a delete; the same thing happens by itself when a
 *   bundle would be left standing for a single transaction.
 *
 * This component is the one that knows what each of those writes: the children
 * are presentational, and every mutation on the parent is fired from here, so
 * the `pending` that disables them all is read in one place.
 *
 * The **amount** is shown and never edited — not here, not anywhere. A bundle's
 * cost is what its members sum to; an editable total could drift from the very
 * bank rows the app exists to reconcile against, and the number on screen would
 * stop being evidence of anything.
 *
 * Rendered only for `kind === "bundle"`: on a bank row there is no membership to
 * list and the date is the bank's.
 */
export function BundleSection({
	transaction: txn,
}: {
	transaction: Transaction;
}) {
	const { setBundleDate, removeFromBundle, dissolveBundle } = useBundle();
	const { assignExisting } = useAssignIssuer();
	const { setOverride } = useCategoryOverride();

	// The members, oldest first — the order the money moved in, which is how a
	// bundle reads: the charge, then the paybacks. Asking by `bundleId` is the
	// only way `list` reaches a member at all (issue #68).
	const membersQuery = useQuery(
		transactionQueries.list({
			bundleId: txn.id,
			limit: MEMBER_SCAN_LIMIT,
			orderBy: "date",
			direction: "asc",
		}),
	);
	const members = (membersQuery.data?.items ?? []) as readonly Transaction[];

	// The issuers of the rows on screen, by their ids (#62) — never the issuer
	// table, whose first page may not hold the one a member points at.
	const { issuersById } = useIssuerLookup(members.map((m) => m.issuerId));
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }),
	);
	const categoriesById = indexById(
		(categoriesQuery.data?.items ?? []) as readonly Category[],
	);

	const pending =
		assignExisting.isPending ||
		setOverride.isPending ||
		setBundleDate.isPending ||
		removeFromBundle.isPending ||
		dissolveBundle.isPending;

	return (
		<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-gousse-ink">
				<Layers size={18} aria-hidden className="text-gousse-muted" />
				Bundle
			</h2>

			<p className="text-sm text-gousse-muted">
				This row stands for the transactions below, totalling{" "}
				<span className="font-medium tabular-nums text-gousse-ink">
					{formatCurrency(txn.amount)}
				</span>
				. The total is always what they sum to, so it isn't editable — change
				the members and it follows.
			</p>

			{membersQuery.isPending ? (
				<TransferLegsSkeleton label="Loading this bundle's members…" action />
			) : membersQuery.isError ? (
				<p className="text-sm text-gousse-high italic">
					Couldn't load this bundle's members. Retry in a moment.
				</p>
			) : members.length === 0 ? (
				<p className="text-sm text-gousse-muted italic">
					This bundle has no members left.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{members.map((member) => (
						<BundleMemberRow
							key={member.id}
							member={member}
							parent={txn}
							issuer={
								member.issuerId != null
									? issuersById.get(member.issuerId)
									: undefined
							}
							category={
								member.categoryId != null
									? categoriesById.get(member.categoryId)
									: undefined
							}
							disabled={pending}
							onCopyIssuer={(issuerId) =>
								assignExisting.mutate({ transactionId: txn.id, issuerId })
							}
							onCopyCategory={(categoryId) =>
								setOverride.mutate({ transactionId: txn.id, categoryId })
							}
							onRemove={() =>
								removeFromBundle.mutate({ transactionId: member.id })
							}
						/>
					))}
				</ul>
			)}

			<BundleDateForm
				date={txn.date}
				manualDate={txn.manualDate === true}
				disabled={pending}
				onSave={(date) => setBundleDate.mutate({ transactionId: txn.id, date })}
			/>

			<BundleDissolveBlock
				disabled={pending}
				isDissolving={dissolveBundle.isPending}
				onDissolve={() => dissolveBundle.mutate({ bundleId: txn.id })}
			/>
		</div>
	);
}
