import type { Issuer, IssuerId, TransactionId } from "@mamen/shared/contract";
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
 * (PRD; issue #18). Assignment is single-transaction in v1 (bulk is deferred to
 * Rules).
 *
 * The picker offers three actions; two of them live here:
 * - `assignExisting` — **match**: assign an issuer the user already has,
 *   stamping `manualIssuer: true`. A hand pick is sticky, so Matching Rules
 *   never silently overwrite it (the Issuer invariant; PRD #8, issue #10).
 * - `createIssuer` — mint a new issuer from the raw counterparty string
 *   (`firstSeen` stamped now, as the contract requires). Returns the created
 *   issuer so the picker can navigate to its rule-create page. It does **not**
 *   assign the transaction — that's the rule's job once written.
 *
 * (The third action — "add a rule to an existing issuer" — is pure navigation,
 * no mutation.) Both mutations own their invalidation: the transactions **and**
 * issuers key families (a new issuer changes the grid; an assignment changes
 * the table). Failures raise a `sonner` toast.
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
		}) =>
			transactionMutations.update(transactionId, {
				issuerId,
				manualIssuer: true,
			}),
		onSuccess: invalidate,
		onError,
	});

	const createIssuer = useMutation({
		mutationFn: ({ name }: { name: string }): Promise<Issuer> =>
			issuerMutations.create({ name, firstSeen: new Date() }),
		onSuccess: invalidate,
		onError,
	});

	return { assignExisting, createIssuer };
}
