import type { CategoryId, TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The **Category override** mutations behind the transaction category cell
 * picker (PRD #19, issue #23). An override is an *exception* to the issuer's
 * default on a single transaction — never a bulk lever (that is the issuer
 * default, set on the issuer detail page). The two gestures are deliberately
 * split so the one that touches a row and the one that touches a history can
 * never be confused.
 *
 * - `setOverride` — apply a leaf to this one transaction, stamping
 *   `manualCategory: true` so the derivation reads the stored `categoryId`
 *   instead of the issuer's default. Writes the override to this row only; the
 *   issuer's default is untouched.
 * - `removeOverride` — clear `manualCategory`, reverting the row to its issuer's
 *   default. It never nulls the category: removing an *exception* restores the
 *   rule rather than creating a hole (a row that genuinely carries no category
 *   is the seeded *Uncategorised* leaf, assigned explicitly).
 *
 * Both invalidate the transactions key family so the (derived) Category column
 * re-reads. Failures — a folder rejected server-side as `CategoryNotLeaf`, say —
 * raise a `sonner` toast.
 */
export function useCategoryOverride() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: transactionKeys.all });
	};

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	const setOverride = useMutation({
		mutationFn: ({
			transactionId,
			categoryId,
		}: {
			transactionId: TransactionId;
			categoryId: CategoryId;
		}) =>
			transactionMutations.update(transactionId, {
				categoryId,
				manualCategory: true,
			}),
		onSuccess: invalidate,
		onError,
	});

	const removeOverride = useMutation({
		mutationFn: ({ transactionId }: { transactionId: TransactionId }) =>
			transactionMutations.update(transactionId, { manualCategory: false }),
		onSuccess: invalidate,
		onError,
	});

	return { setOverride, removeOverride };
}
