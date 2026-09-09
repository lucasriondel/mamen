import type { TransactionId, TransferPair } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
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
 * The **Transfer** mutations behind every transfer surface (PRD #48, issue #91):
 * the detail page's Transfer block, the transactions table's suggestion panel
 * and the Transfers page. Dedicated endpoints — the "no leg already grouped" and
 * "sum to zero" invariants are multi-row and validated atomically server-side,
 * so none of them rides the generic single-row `update` path.
 *
 * `link` groups a set of legs into one internal transfer (the server computes
 * `min(ids)` as the group id and stamps every leg); `unlink` dissolves a group
 * back into normal transactions; `dismiss` refuses a set of **dismissed pairs**
 * so detection stops offering them. A `TransferInvalid` (422) — too few legs, an
 * unbalanced sum, an already-grouped or refund leg — surfaces as a `sonner`
 * toast, so a refusal says why rather than failing silently. All three
 * invalidate the whole transactions key family, which already covers the
 * candidates query, the list and the recap: confirming a transfer has to move
 * the spend figure as well as the row.
 *
 * No optimistic update in either direction. The panel closes on the click, which
 * hides most of the latency, and an optimistic dismissal would have to
 * re-derive the candidate list the server owns.
 */
export function useTransfer() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  };
  const link = useMutation({
    mutationFn: (ids: ReadonlyArray<TransactionId>) => transactionMutations.linkTransfer(ids),
    onSuccess: invalidate,
    onError,
  });

  const unlink = useMutation({
    mutationFn: (transferGroupId: TransactionId) =>
      transactionMutations.unlinkTransfer(transferGroupId),
    onSuccess: invalidate,
    onError,
  });

  /**
   * Refuse the pairs a panel displayed. Group-level: one call carries every
   * pair that was on screen, so the action's blast radius is exactly what the
   * user could see. Currently irreversible — there is no undismiss — which is
   * why the surfaces say so rather than presenting it as a tidy-up.
   */
  const dismiss = useMutation({
    mutationFn: (pairs: ReadonlyArray<TransferPair>) =>
      transactionMutations.dismissTransferPairs(pairs),
    onSuccess: invalidate,
    onError,
  });

  return { link, unlink, dismiss };
}
