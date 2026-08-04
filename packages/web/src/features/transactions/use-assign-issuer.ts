import type { Issuer, IssuerId, TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	issuerKeys,
	issuerMutations,
	ruleKeys,
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
 * - `removeManualIssuer` — drop a *hand pick* from a row, re-deriving its issuer
 *   from the current rules server-side (the row falls back to whichever rule
 *   claims it, or to unmatched when none does). Deliberately **not** a plain
 *   `issuerId: undefined` update: the contract's partial update cannot express a
 *   null, and an absent key is a silent no-op on the server's merge — so the
 *   dedicated endpoint is the only way to actually clear the column.
 *
 * ("Add a rule to an existing issuer" is pure navigation, no mutation.) Each
 * mutation owns its invalidation: the transactions, issuers **and** rules key
 * families (a new issuer changes the grid; an assignment changes the table).
 * Rules are in that list because a rule's `ownedCount` is derived from the live
 * transactions table on every read (issue #63) — hand-assigning a row takes it
 * away from whichever rule held it, and dropping a hand pick gives it back — so
 * a cached rules list would otherwise keep rendering a count that no longer
 * matches what the server would say. Failures raise a `sonner` toast.
 */
export function useAssignIssuer() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: transactionKeys.all });
		queryClient.invalidateQueries({ queryKey: issuerKeys.all });
		queryClient.invalidateQueries({ queryKey: ruleKeys.all });
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

	const removeManualIssuer = useMutation({
		mutationFn: ({ transactionId }: { transactionId: TransactionId }) =>
			transactionMutations.removeManualIssuer(transactionId),
		onSuccess: invalidate,
		onError,
	});

	return { assignExisting, createIssuer, removeManualIssuer };
}
