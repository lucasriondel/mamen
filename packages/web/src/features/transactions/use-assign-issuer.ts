import type { IssuerId, TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	issuerKeys,
	issuerMutations,
	transactionKeys,
	transactionMutations,
} from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The issuer-assignment mutations behind the transactions assignment picker
 * (PRD). Assignment is single-transaction in v1 (bulk is deferred to Rules).
 *
 * Two paths, both ending in a transaction `update({ issuerId })` so the row
 * immediately reflects the resolved issuer:
 * - `assignExisting` — assign an issuer the user already has.
 * - `createAndAssign` — mint a new issuer from the raw counterparty string
 *   (`create`), then assign it (`update`). `firstSeen` is stamped now (the
 *   contract requires it on create).
 *
 * Both own their invalidation: on success the transactions **and** issuers key
 * families are invalidated (a new issuer changes the grid; the assignment
 * changes the table). Failures raise a `sonner` toast.
 */
export function useAssignIssuer() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: transactionKeys.all });
		queryClient.invalidateQueries({ queryKey: issuerKeys.all });
	};

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	const assignExisting = useMutation({
		mutationFn: ({
			transactionId,
			issuerId,
		}: {
			transactionId: TransactionId;
			issuerId: IssuerId;
		}) => transactionMutations.update(transactionId, { issuerId }),
		onSuccess: invalidate,
		onError,
	});

	const createAndAssign = useMutation({
		mutationFn: async ({
			transactionId,
			name,
		}: {
			transactionId: TransactionId;
			name: string;
		}) => {
			const issuer = await issuerMutations.create({
				name,
				firstSeen: new Date(),
			});
			return transactionMutations.update(transactionId, {
				issuerId: issuer.id,
			});
		},
		onSuccess: invalidate,
		onError,
	});

	return { assignExisting, createAndAssign };
}
