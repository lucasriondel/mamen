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

	return { createBundle };
}
