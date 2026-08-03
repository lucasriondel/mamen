import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The **bundle** creation mutation (issue #68): turn the selected rows into one
 * **bundle parent** carrying their summed amount and the label the user typed.
 *
 * Everything about the parent is the server's to derive — the amount, the date,
 * the account — so nothing is computed here and nothing is sent optimistically:
 * a client that guessed the sum would be a second definition of what a bundle
 * totals, and the two would drift the first time a member changed.
 *
 * Invalidates the whole transactions key family, which is exactly the blast
 * radius: every member has just left the top level of the list, a new row has
 * joined it, and the signed total under both has moved.
 */
export function useBundle() {
	const queryClient = useQueryClient();

	const createBundle = useMutation({
		mutationFn: ({
			ids,
			label,
		}: {
			ids: ReadonlyArray<TransactionId>;
			label: string;
		}) => transactionMutations.createBundle(ids, label.trim()),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: transactionKeys.all });
		},
		onError: (error: unknown) => {
			toast.error(toErrorMessage(error));
		},
	});

	/**
	 * Override a **bundle parent**'s date (issue #72). The parent's date defaults
	 * to its earliest member's — the cost belongs to when the money was spent, not
	 * to when the last person settled up — but that default is a *starting point*:
	 * a weekend away is dated the Friday even when a refund lands three weeks on.
	 *
	 * `manualDate` rides along, and that is the whole write: it is what tells the
	 * derivation that this date is the user's, so the recompute every later
	 * membership change runs (#74) keeps it instead of taking the members' date
	 * back. Exactly the shape `manualExcluded` and `manualCategory` already have.
	 *
	 * The amount is deliberately absent from this surface — a bundle's cost is
	 * what its members sum to, and nothing here may say otherwise.
	 */
	const setBundleDate = useMutation({
		mutationFn: ({
			transactionId,
			date,
		}: {
			transactionId: TransactionId;
			date: Date;
		}) =>
			transactionMutations.update(transactionId, { date, manualDate: true }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: transactionKeys.all });
		},
		onError: (error: unknown) => {
			toast.error(toErrorMessage(error));
		},
	});

	return { createBundle, setBundleDate };
}
