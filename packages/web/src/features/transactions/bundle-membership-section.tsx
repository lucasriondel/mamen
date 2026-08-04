import type { Transaction, TransactionId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import {
	BUNDLE_REFUSED_REASON,
	isBundleEligible,
} from "./grouping-eligibility";
import { useBundle } from "./use-bundle";

/**
 * How many **bundle parents** to offer. A bundle is a handful of rows and a
 * household makes a handful of bundles; the picker is a short list by nature.
 */
const BUNDLE_SCAN_LIMIT = 100;

const selectClass = cn(
	"h-9 rounded-md border border-gousse-line bg-gousse-panel px-2 text-sm text-gousse-ink",
	"focus:outline-none focus:ring-2 focus:ring-gousse-accent",
);

/**
 * The **Bundle** block on an ordinary transaction's detail page (issue #74, epic
 * #66) — the membership half of a bundle, from the member's side. Two states:
 *
 * - **In a bundle** → a link to the **bundle parent** that stands for this row,
 *   and the way out. Leaving returns the row to the list exactly as it was:
 *   bundling never touched its issuer, category or notes.
 * - **In none** → the bundles it may join, and the action to join one — offered
 *   *disabled, with the reason*, when the row is a **transfer leg** (issue #75):
 *   the two groupings are mutually exclusive, and a refusal a user only meets
 *   after pressing the button is a refusal explained too late.
 *
 * This is also the escape hatch for the table's page-scoped selection (#68):
 * the refund that lands a week later, or the instalment sitting hundreds of rows
 * away, is added from its own page rather than by scrolling two rows into the
 * same page of the list.
 *
 * Nothing here computes what the bundle will total. The server recomputes the
 * parent through its one derivation routine and the invalidated queries bring
 * the new number back — a total guessed here would be a second definition of
 * what a bundle sums to, and the two would drift on the first membership change.
 *
 * Rendered only for a row that is **not** a parent: a bundle inside a bundle
 * would put a total in two places, and only the inner one would ever be
 * recomputed.
 */
export function BundleMembershipSection({
	transaction: txn,
}: {
	transaction: Transaction;
}) {
	const { addToBundle, removeFromBundle } = useBundle();
	const [choice, setChoice] = useState("");
	const isParent = txn.kind === "bundle";

	// The bundles on offer — the parents, newest first. The same read serves both
	// states: a member's own parent is one of these, so naming the bundle this row
	// belongs to costs no second request.
	const bundlesQuery = useQuery({
		...transactionQueries.list({
			kind: "bundle",
			limit: BUNDLE_SCAN_LIMIT,
			orderBy: "date",
			direction: "desc",
		}),
		enabled: !isParent,
	});
	const bundles = (bundlesQuery.data?.items ?? []) as readonly Transaction[];

	if (isParent) return null;

	const pending = addToBundle.isPending || removeFromBundle.isPending;
	// A transfer leg cannot also be a member (issue #75) — its group already nets
	// it out of the recap, so a bundle counting it again would count the same
	// money twice, two different ways. The control is offered *disabled*, with the
	// reason beside it: the server's 422 stays the truth, but a refusal a user
	// meets after pressing the button is a refusal explained too late.
	const canJoin = isBundleEligible(txn);
	const parent =
		txn.bundleId != null
			? bundles.find((b) => b.id === txn.bundleId)
			: undefined;

	// One form, rendered in the ordinary case and — disabled — in the refused one,
	// so the refusal is stated *on the control it refuses* rather than in place of
	// it. A row that can't join is never told to go find some bundles first.
	const joinForm = (
		<form
			className="flex flex-wrap items-end gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (pending || choice === "" || !canJoin) return;
				addToBundle.mutate({
					bundleId: Number(choice) as TransactionId,
					transactionId: txn.id,
				});
			}}
		>
			<label className="flex flex-col gap-1 text-gousse-muted text-xs">
				Bundle to join
				<select
					aria-label="Bundle to join"
					className={selectClass}
					value={choice}
					disabled={!canJoin}
					onChange={(event) => setChoice(event.target.value)}
				>
					<option value="">Pick a bundle…</option>
					{bundles.map((bundle) => (
						<option key={bundle.id} value={bundle.id}>
							{bundle.rawIssuerString} · {formatCurrency(bundle.amount)} ·{" "}
							{formatShortDate(bundle.date)}
						</option>
					))}
				</select>
			</label>
			<Button
				type="submit"
				size="sm"
				disabled={!canJoin || pending || choice === ""}
			>
				{addToBundle.isPending ? "Adding…" : "Add to bundle"}
			</Button>
		</form>
	);

	return (
		<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-gousse-ink">
				<Layers size={18} aria-hidden className="text-gousse-muted" />
				Bundle
			</h2>

			{txn.bundleId != null ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-gousse-muted">
						This transaction is part of a bundle, so it is counted through the
						row that stands for it rather than on its own.
					</p>
					<Link
						to="/transactions/$transactionId"
						params={{ transactionId: String(txn.bundleId) }}
						className="self-start text-gousse-accent text-sm hover:underline"
					>
						{parent
							? `${parent.rawIssuerString} · ${formatCurrency(parent.amount)}`
							: `Bundle #${txn.bundleId}`}
					</Link>
					<Button
						variant="danger"
						size="sm"
						className="self-start"
						disabled={pending}
						onClick={() => removeFromBundle.mutate({ transactionId: txn.id })}
					>
						{removeFromBundle.isPending ? "Removing…" : "Remove from bundle"}
					</Button>
					{/*
					 * Said plainly, because the row leaving may take the whole bundle
					 * with it: a parent standing for a single transaction is that
					 * transaction with extra steps, so it dissolves instead.
					 */}
					<p className="text-xs text-gousse-muted">
						Removing the second-to-last member dissolves the bundle — the rows
						come back exactly as they are.
					</p>
				</div>
			) : !canJoin ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-gousse-muted italic">
						{BUNDLE_REFUSED_REASON}
					</p>
					{joinForm}
				</div>
			) : bundlesQuery.isPending ? (
				<p className="text-sm text-gousse-muted italic">Loading bundles…</p>
			) : bundlesQuery.isError ? (
				<p className="text-sm text-gousse-high italic">
					Couldn't load your bundles. Retry in a moment.
				</p>
			) : bundles.length === 0 ? (
				<p className="text-sm text-gousse-muted italic">
					No bundles yet. Select this row and the ones it belongs with in the
					transactions list to make one.
				</p>
			) : (
				joinForm
			)}
		</div>
	);
}
