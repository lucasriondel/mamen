import type { Transaction, TransactionId } from "@mamen/shared/contract";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	BUNDLE_REFUSED_REASON,
	isBundleEligible,
} from "./grouping-eligibility";
import { useBundle } from "./use-bundle";

/** A bundle stands for **several** rows; one row is already its own account. */
const MIN_BUNDLE_MEMBERS = 2;

export type BundleActionBarProps = {
	/**
	 * The rows currently ticked in the table — the rows themselves, not just
	 * their ids: the selection is page-scoped, so they are already on screen, and
	 * whether one of them is a transfer leg is what decides if this bar can do
	 * anything at all (issue #75).
	 */
	selected: ReadonlyArray<Transaction>;
	/** Drop the selection (after a successful bundle, or on demand). */
	onClear: () => void;
};

/**
 * The selection action bar (issue #68) — what the transactions table offers once
 * rows are ticked. Today it offers exactly one thing: turning the selection into
 * a **bundle**, several transactions treated as one for the recap.
 *
 * The label is asked for **inline**, not behind a dialog: it is a single short
 * string, and a modal between "I picked these rows" and "here they are as one"
 * would put a wall in the middle of one gesture. It is required — the parent's
 * `rawIssuerString` is its only human-readable identity, and a row named nothing
 * is a row nobody can find again.
 *
 * A selection holding a **transfer leg** is refused outright (issue #75), with
 * the reason where the count and the button already are: the server validates
 * the set atomically, so one ineligible row refuses all of them — and dropping
 * it silently would build a bundle other than the one the user picked.
 *
 * The bar renders nothing at all when nothing is selected: a permanently visible
 * strip explaining what you could do with a selection you don't have is noise on
 * the app's landing surface.
 */
export function BundleActionBar({ selected, onClear }: BundleActionBarProps) {
	const [label, setLabel] = useState("");
	const { createBundle } = useBundle();

	if (selected.length === 0) return null;

	const selectedIds = selected.map((txn) => txn.id as TransactionId);
	const trimmed = label.trim();
	// ONE transfer leg refuses the whole set (issue #75), because the server
	// validates the set atomically: a bundle that quietly dropped the leg would
	// not be the bundle the user selected.
	const legs = selected.filter((txn) => !isBundleEligible(txn));
	// Every half of the server's own refusal, checked here so the button explains
	// itself before it is pressed rather than after (the 422 remains the truth).
	const canBundle =
		selectedIds.length >= MIN_BUNDLE_MEMBERS &&
		trimmed.length > 0 &&
		legs.length === 0;

	const submit = () => {
		if (!canBundle) return;
		createBundle.mutate(
			{ ids: selectedIds, label: trimmed },
			{
				onSuccess: () => {
					setLabel("");
					onClear();
				},
			},
		);
	};

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-gousse-line bg-gousse-panel px-3 py-2">
			<span className="flex items-center gap-2 text-sm text-gousse-ink">
				<Layers size={16} aria-hidden className="text-gousse-muted" />
				{selectedIds.length} selected
			</span>

			<form
				className="flex flex-1 flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<Input
					className="h-9 min-w-48 flex-1 bg-gousse-bg"
					aria-label="Bundle label"
					placeholder="Name this bundle (e.g. Weekend away)"
					value={label}
					onChange={(event) => setLabel(event.target.value)}
				/>
				<Button
					type="submit"
					size="sm"
					disabled={!canBundle || createBundle.isPending}
					title={
						selectedIds.length < MIN_BUNDLE_MEMBERS
							? "Select at least two transactions"
							: legs.length > 0
								? BUNDLE_REFUSED_REASON
								: undefined
					}
				>
					Create bundle
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onClear}>
					Clear selection
				</Button>
			</form>

			<p className="w-full text-xs text-gousse-muted">
				{selectedIds.length < MIN_BUNDLE_MEMBERS
					? "A bundle needs at least two transactions — one row already stands for itself."
					: legs.length > 0
						? BUNDLE_REFUSED_REASON
						: "These rows will be replaced in the list by one row totalling them; each stays reachable, and none is counted twice."}
			</p>
		</div>
	);
}
