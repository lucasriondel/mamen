import type { Transaction, TransactionId } from "@mamen/shared/contract";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useBulkDelete } from "./use-bulk-delete";

export type DeleteSelectionDialogProps = {
	/**
	 * The rows the selection action bar is about to delete — the rows themselves,
	 * not just their ids: the dialog counts the **bundle parents** among them to
	 * say what deleting them does, and the selection is page-scoped so they are
	 * already on screen.
	 */
	selected: ReadonlyArray<Transaction>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The rows are gone — the bar drops the selection that named them. */
	onDeleted: () => void;
};

/**
 * The confirmation step of **bulk delete** (issue #86). Deleting is confirmed
 * rather than performed outright because it is not recoverable: there is no
 * soft-delete column, and reinserting the rows would mint new ids, so bundle
 * membership and transfer links could not be restored. That is also why no undo
 * is offered anywhere — this dialog is what stands in its place, and it says as
 * much rather than implying a way back.
 *
 * It states two numbers. The first is how many rows go. The second is how many
 * of them are **bundle parents**, because that is the one row here whose delete
 * doesn't mean "this row goes": a parent stands for its members, it does not own
 * them, so deleting it *ungroups* them and they survive as ordinary rows. Both
 * are read off the selection already on screen — no extra query. The
 * repository's `bundleImpact` is deliberately not used: it answers the same
 * question for a whole account-month scope, which is not what an id-list delete
 * does.
 *
 * Bundle **members** carry no checkbox, so they cannot be in this set while
 * bundled; nothing here has to account for one.
 */
export function DeleteSelectionDialog({
	selected,
	open,
	onOpenChange,
	onDeleted,
}: DeleteSelectionDialogProps) {
	const { bulkDelete } = useBulkDelete();

	const count = selected.length;
	const bundles = selected.filter((txn) => txn.kind === "bundle").length;
	const rows = `${count} transaction${count === 1 ? "" : "s"}`;

	const confirm = () => {
		bulkDelete.mutate(
			{ ids: selected.map((txn) => txn.id as TransactionId) },
			{
				onSuccess: () => {
					onOpenChange(false);
					onDeleted();
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete {rows}?</DialogTitle>
					<DialogDescription>
						This can't be undone — deleted transactions are gone for good, and
						re-importing them creates new rows rather than these ones.
					</DialogDescription>
				</DialogHeader>

				{bundles > 0 && (
					<p className="text-sm text-gousse-high">
						{bundles} of them {bundles === 1 ? "is a bundle" : "are bundles"}:
						deleting a bundle ungroups it rather than deleting the transactions
						it stands for — those stay in the list.
					</p>
				)}

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={bulkDelete.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="danger"
						onClick={confirm}
						disabled={bulkDelete.isPending}
					>
						Delete {rows}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
