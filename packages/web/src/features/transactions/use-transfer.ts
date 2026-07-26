import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The **Transfer** grouping mutations behind the transaction detail page's
 * Transfer block (PRD #48). Two dedicated endpoints — the "no leg already
 * grouped" and "sum to zero" invariants are multi-row and validated atomically
 * server-side, so neither rides the generic single-row `update` path.
 *
 * `link` groups a set of legs into one internal transfer (the server computes
 * `min(ids)` as the group id and stamps every leg); `unlink` dissolves a group
 * back into normal transactions. A `TransferInvalid` (422) — too few legs, an
 * unbalanced sum, an already-grouped or refund leg — surfaces as a `sonner`
 * toast. Both invalidate the whole transactions key family, so every affected
 * leg's row and the recap re-read.
 */
export function useTransfer() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: transactionKeys.all });
	};
	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	const link = useMutation({
		mutationFn: (ids: ReadonlyArray<TransactionId>) =>
			transactionMutations.linkTransfer(ids),
		onSuccess: invalidate,
		onError,
	});

	const unlink = useMutation({
		mutationFn: (transferGroupId: TransactionId) =>
			transactionMutations.unlinkTransfer(transferGroupId),
		onSuccess: invalidate,
		onError,
	});

	return { link, unlink };
}
