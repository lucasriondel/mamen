import type { RuleCreate, RuleId, RuleUpdate, TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  issuerKeys,
  ruleKeys,
  ruleMutations,
  transactionKeys,
  transactionMutations,
} from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * Every write in this file fails the same way: the tagged error's own copy, as a
 * toast. Module scope rather than inside the hook — it closes over nothing, so a
 * copy per render would be one closure per render for one constant behaviour.
 */
const onError = (error: unknown) => {
  toast.error(toErrorMessage(error));
};

/**
 * The Matching Rule write mutations behind the rules-management UI, wired to
 * invalidation + failure toasts (as with issuers/accounts, the SDK stays
 * invalidation-agnostic so each mutation owns its side effects).
 *
 * Every rule write applies retroactively — creating, editing, or deleting a
 * rule re-derives which transactions belong to which issuer (the Issuer
 * invariant; PRD #8). So on success we invalidate the rules **and** transactions
 * **and** issuers key families: the rule list, the transactions table (resolved
 * issuer names), and the issuer cards (counts / nets) all refetch. `remove` and
 * `removeManualIssuer` share the same fan-out for the same reason. Failures
 * raise a `sonner` toast whose copy comes from the tagged error `_tag`.
 */
export function useRuleMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ruleKeys.all });
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    queryClient.invalidateQueries({ queryKey: issuerKeys.all });
  };

  const create = useMutation({
    mutationFn: (payload: RuleCreate) => ruleMutations.create(payload),
    onSuccess: invalidate,
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: RuleId; patch: RuleUpdate }) =>
      ruleMutations.update(id, patch),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: RuleId) => ruleMutations.remove(id),
    onSuccess: invalidate,
    onError,
  });

  const removeManualIssuer = useMutation({
    mutationFn: (id: TransactionId) => transactionMutations.removeManualIssuer(id),
    onSuccess: invalidate,
    onError,
  });

  return { create, update, remove, removeManualIssuer };
}
