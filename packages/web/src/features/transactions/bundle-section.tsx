import type {
	Category,
	CategoryId,
	Issuer,
	IssuerId,
	Transaction,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { categoryQueries, transactionQueries } from "@/lib/sdk";
import { cn, indexById } from "@/lib/utils";
import { TransferLegsSkeleton } from "./transfer-legs-skeleton";
import { useAssignIssuer } from "./use-assign-issuer";
import { useBundle } from "./use-bundle";
import { useCategoryOverride } from "./use-category-override";

/** How many members of one bundle to fetch. A bundle is a handful of rows. */
const MEMBER_SCAN_LIMIT = 50;

/** The whole (small) category tree, for the member's category name. */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * The `<input type="date">` value for a stored date, and back.
 *
 * Both go through **UTC**, deliberately: the app stores `date` as an ISO string
 * and compares it lexicographically, and a bundle parent's date is copied
 * verbatim from a member's. Reading the local calendar day instead would shift
 * a row a day either side of midnight depending on where the reader sits, and
 * saving would then write a date nobody typed.
 */
const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);
const fromDateInputValue = (value: string) =>
	new Date(`${value}T00:00:00.000Z`);

/**
 * One **bundle member**, with the shortcuts that copy its identity onto the
 * parent. Most bundles are one merchant plus refunds — three charges at the same
 * supermarket, then two people paying you back — so the issuer and the category
 * the parent wants are usually already sitting on a member, and retyping them
 * is busywork.
 *
 * Copying is a plain curation write on the parent (`manualIssuer` /
 * `manualCategory`, the same mutations the table's pickers use), so nothing new
 * happens to the row: it is a hand pick that happens to have been *chosen* by
 * pointing at a member. The category offered is the member's **derived** one
 * (through its own issuer, ADR 0002) — what the user sees on that row is what
 * lands on the parent, rather than a stored column they were never shown. The label is untouched by either — a bundle can be named
 * "Weekend Bretagne" and still carry the issuer Carrefour.
 *
 * A member with neither offers neither: an absent button says "nothing to copy"
 * more plainly than a disabled one. A member whose issuer/category the parent
 * *already* carries keeps its button, disabled — the row is not missing
 * anything, and hiding it would read as "this member has no issuer".
 */
function MemberRow({
	member,
	parent,
	issuer,
	category,
	onCopyIssuer,
	onCopyCategory,
	disabled,
}: {
	member: Transaction;
	parent: Transaction;
	issuer?: Issuer;
	category?: Category;
	onCopyIssuer: (issuerId: IssuerId) => void;
	onCopyCategory: (categoryId: CategoryId) => void;
	disabled: boolean;
}) {
	const hasIssuer = member.issuerId != null;
	const hasCategory = member.categoryId != null;
	const sameIssuer = hasIssuer && parent.issuerId === member.issuerId;
	const sameCategory = hasCategory && parent.categoryId === member.categoryId;

	return (
		<li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gousse-line px-3 py-2">
			<Link
				to="/transactions/$transactionId"
				params={{ transactionId: String(member.id) }}
				className="flex min-w-0 flex-col text-sm hover:underline"
			>
				<span
					className={cn(
						"font-medium tabular-nums",
						member.amount < 0 && "text-gousse-high",
						member.amount > 0 && "text-gousse-low",
					)}
				>
					{formatCurrency(member.amount)}
				</span>
				<span className="truncate text-gousse-muted text-xs">
					{formatShortDate(member.date)} · {member.rawIssuerString}
				</span>
			</Link>

			<div className="flex shrink-0 items-center gap-2">
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
			</div>
		</li>
	);
}

/**
 * The **Bundle** block on a bundle parent's detail page (issue #72, epic #66) —
 * everything about the row that is *not* already a transaction field.
 *
 * The parent is a real transaction row, so its issuer, category and notes are
 * edited through the page's ordinary controls, above; what lives here is what
 * only a bundle has:
 *
 * - **The members it stands for**, each linking to its own page, each offering
 *   to copy its issuer or its category onto the parent ({@link MemberRow}).
 * - **The date**, which defaults to the earliest member's and may be overridden.
 *   The override is flagged `manualDate` so the recompute that every later
 *   membership change runs (#74) keeps it: the derived date is a starting point,
 *   not a constraint.
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
	const { setBundleDate } = useBundle();
	const { assignExisting } = useAssignIssuer();
	const { setOverride } = useCategoryOverride();

	// The date field is a draft over the stored value, re-seeded *during render*
	// whenever the stored date changes — after the user's own save, and after a
	// recompute moves the derived date (#74). Without the re-seed the field would
	// keep showing a date the row no longer has, and "Save" would read as a no-op
	// while actually writing the stale one back.
	const storedDate = toDateInputValue(txn.date);
	const [draftDate, setDraftDate] = useState(storedDate);
	const [seededFrom, setSeededFrom] = useState(storedDate);
	if (seededFrom !== storedDate) {
		setSeededFrom(storedDate);
		setDraftDate(storedDate);
	}

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
		setBundleDate.isPending;

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
						<MemberRow
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
						/>
					))}
				</ul>
			)}

			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (pending || draftDate === "" || draftDate === storedDate) return;
					setBundleDate.mutate({
						transactionId: txn.id,
						date: fromDateInputValue(draftDate),
					});
				}}
			>
				<label className="flex flex-col gap-1 text-gousse-muted text-xs">
					Bundle date
					<Input
						type="date"
						aria-label="Bundle date"
						className="h-9 w-44 bg-gousse-bg"
						value={draftDate}
						onChange={(event) => setDraftDate(event.target.value)}
					/>
				</label>
				<Button
					type="submit"
					size="sm"
					disabled={pending || draftDate === "" || draftDate === storedDate}
				>
					Save date
				</Button>
			</form>

			<p className="text-xs text-gousse-muted">
				{txn.manualDate === true
					? "This date was set by hand, and stays put when members are added or removed."
					: "This date follows its earliest member. Set one here to pin it instead."}
			</p>
		</div>
	);
}
