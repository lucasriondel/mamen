import type { Account, Category, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { formatCurrency } from "@/lib/format";
import { accountQueries, categoryQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { BundleDateForm } from "./bundle-date-form";
import { BundleDissolveBlock } from "./bundle-dissolve-block";
import { BundleMemberActions } from "./bundle-member-actions";
import { TransactionsTable } from "./transactions-table";
import { TransactionsTableSkeleton } from "./transactions-table-skeleton";
import { useAssignIssuer } from "./use-assign-issuer";
import { useBundle } from "./use-bundle";
import { useCategoryOverride } from "./use-category-override";

/** How many members of one bundle to fetch. A bundle is a handful of rows. */
const MEMBER_SCAN_LIMIT = 50;

/** The whole (small) category tree, for the member's category name. */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * The members read oldest first — the order the money moved in, which is how a
 * bundle reads: the charge, then the paybacks. Fixed rather than a control: this
 * is a handful of rows on a detail page, not a list to be surveyed, and the
 * table's sort is server-driven so a toggle here would mean re-querying the
 * bundle to reorder five rows.
 */
const MEMBER_ORDER = "asc";

/** The inert sort toggle — see {@link MEMBER_ORDER}. */
function noop() {}

/**
 * The **Bundle** block on a bundle parent's detail page (issue #72, epic #66) —
 * everything about the row that is *not* already a transaction field.
 *
 * The parent is a real transaction row, so its issuer, category and notes are
 * edited through the page's ordinary controls, above; what lives here is what
 * only a bundle has, one named child per concern:
 *
 * - **The members it stands for**, in the app's own {@link TransactionsTable} —
 *   the same grid, the same columns, the same curation cells as the list they
 *   were bundled out of, so a bundle's contents read the way transactions read
 *   everywhere else and nothing about them has to be re-learned. What the table
 *   does not have is a place to act on a *member as a member*, so it takes one
 *   extra column: **Actions** ({@link BundleMemberActions}) — copy this member's
 *   issuer or category onto the parent, or take it out of the bundle (#74).
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

	// The members. Asking by `bundleId` is the only way `list` reaches a member at
	// all (issue #68).
	const membersQuery = useQuery(
		transactionQueries.list({
			bundleId: txn.id,
			limit: MEMBER_SCAN_LIMIT,
			orderBy: "date",
			direction: MEMBER_ORDER,
		}),
	);
	const members = (membersQuery.data?.items ?? []) as readonly Transaction[];

	// The issuers of the rows on screen, by their ids (#62) — never the issuer
	// table, whose first page may not hold the one a member points at.
	const {
		issuersById,
		isPending: issuersPending,
		isError: issuersError,
	} = useIssuerLookup(members.map((m) => m.issuerId));
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }),
	);
	// Memoised — the table rebuilds its column set on any lookup's identity, so a
	// fresh map every render would rebuild it on every render.
	const categoriesById = useMemo(
		() => indexById((categoriesQuery.data?.items ?? []) as readonly Category[]),
		[categoriesQuery.data],
	);
	// The accounts the table's Account column reads. A bundle's members are
	// ordinary bank rows and may well span two accounts — the charge on one card,
	// the payback into the current account — so the column earns its place here.
	const accountsQuery = useQuery(accountQueries.list());
	const accountsById = useMemo(
		() => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
		[accountsQuery.data],
	);

	const pending =
		assignExisting.isPending ||
		setOverride.isPending ||
		setBundleDate.isPending ||
		removeFromBundle.isPending ||
		dissolveBundle.isPending;

	// The **Actions** column's contents, per member. Stable across renders: the
	// table rebuilds its whole column set whenever this identity changes, and a
	// fresh closure every render would do that on every keystroke elsewhere on the
	// page. This component is the one that knows what each control writes.
	const renderMemberActions = useCallback(
		(member: Transaction) => (
			<BundleMemberActions
				member={member}
				parent={txn}
				issuer={
					member.issuerId != null ? issuersById.get(member.issuerId) : undefined
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
				onRemove={() => removeFromBundle.mutate({ transactionId: member.id })}
			/>
		),
		[
			txn,
			issuersById,
			categoriesById,
			pending,
			assignExisting,
			setOverride,
			removeFromBundle,
		],
	);

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

			{membersQuery.isError || issuersError ? (
				<p className="text-sm text-gousse-high italic">
					Couldn't load this bundle's members. Retry in a moment.
				</p>
			) : /* Held until the issuer lookup lands too: it reads the ids of the
			      rows, so it resolves a beat after them, and a member rendered
			      before its issuer arrives is a member rendered as *unresolved*. */
			membersQuery.isPending || issuersPending ? (
				<TransactionsTableSkeleton rows={3} />
			) : members.length === 0 ? (
				<p className="text-sm text-gousse-muted italic">
					This bundle has no members left.
				</p>
			) : (
				<TransactionsTable
					transactions={members}
					accountsById={accountsById}
					issuersById={issuersById}
					categoriesById={categoriesById}
					direction={MEMBER_ORDER}
					// The order is fixed (see `MEMBER_ORDER`), so the Date header's
					// toggle has nothing to do — it stays inert rather than re-querying
					// the bundle to reorder a handful of rows.
					onToggleSort={noop}
					renderActions={renderMemberActions}
				/>
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
