import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The **Excluded from recap** mutation behind the transaction detail page's
 * Recap block (issue #67, ADR 0008). One gesture in two directions: holding a
 * row out of the spend totals, and pulling it back in.
 *
 * Both directions write `manualExcluded: true` alongside the flag. That is not
 * bookkeeping — it is the whole point of the second column: once an issuer can
 * carry its own exclusion default (#69), `manualExcluded` is what tells a row
 * the *user* decided about from one that merely inherited, so neither decision
 * is clobbered when the issuer's default later changes. Writing it only when
 * excluding would lose exactly half of that (a deliberate *re-inclusion* would
 * be indistinguishable from a row that was never touched).
 *
 * Invalidates the transactions key family, so the row's colour in the table and
 * every recap total re-read.
 */
export function useRecapExclusion() {
	const queryClient = useQueryClient();

	const setExcluded = useMutation({
		mutationFn: ({
			transactionId,
			excluded,
		}: {
			transactionId: TransactionId;
			excluded: boolean;
		}) =>
			transactionMutations.update(transactionId, {
				excludedFromRecap: excluded,
				manualExcluded: true,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: transactionKeys.all });
		},
		onError: (error: unknown) => {
			toast.error(toErrorMessage(error));
		},
	});

	return { setExcluded };
}
