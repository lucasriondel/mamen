import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ruleKeys, transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * **Bulk delete** (issue #86) — removing the rows ticked in the transactions
 * table, by id. The endpoint has been there since the contract was written and
 * had no caller; this is it.
 *
 * The write is an id list and nothing else: the server deletes exactly those
 * rows and runs the one cleanup every delete path shares, so a deleted **bundle
 * parent** releases its members (they survive as ordinary rows) and a deleted
 * transfer leg clears a group left with one side. None of that is restated
 * here — a client that predicted the fallout would be a second definition of
 * what a delete does.
 *
 * Two key families are invalidated, the pair every row-moving mutation names:
 * - transactions, because the deleted rows were in it, and a released member has
 *   just returned to the top level of the list;
 * - rules, because a rule's `ownedCount` is derived from the live transactions
 *   table on every read (issue #63) and deleting rows takes rows away from it —
 *   a **bundle parent** included, being an ordinary row carrying the user's
 *   label as the `rawIssuerString` the matcher reads (issue #78).
 *
 * There is no optimistic update and no undo. The delete is not recoverable —
 * there is no soft-delete column, and reinserting the rows would mint new ids,
 * so bundle membership and transfer links could not be restored. Offering an
 * undo would be a lie; the confirmation dialog is what stands in its place.
 * Failures raise a `sonner` toast.
 */
export function useBulkDelete() {
  const queryClient = useQueryClient();

  const bulkDelete = useMutation({
    mutationFn: ({ ids }: { ids: ReadonlyArray<TransactionId> }) =>
      transactionMutations.bulkDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      queryClient.invalidateQueries({ queryKey: ruleKeys.all });
    },
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error));
    },
  });

  return { bulkDelete };
}
