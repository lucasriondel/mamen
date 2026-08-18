import type { TransactionId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionKeys, transactionMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * The **Notes** mutation behind the transaction notes cell editor (issue #38).
 * A note is a free-text annotation on a single transaction — no derivation, no
 * bulk lever, just this one row's `notes` field.
 *
 * `setNotes` writes the (trimmed) text through the same partial `update` every
 * other cell uses. Clearing a note sends an empty string rather than a separate
 * "remove" gesture: an empty note and no note read identically in the cell, so
 * one path covers both. Over-long text (>1000 chars) is rejected server-side as
 * a decode error and surfaced as a `sonner` toast.
 *
 * Invalidates the transactions key family so the Notes column re-reads.
 */
export function useTransactionNotes() {
  const queryClient = useQueryClient();

  const setNotes = useMutation({
    mutationFn: ({ transactionId, notes }: { transactionId: TransactionId; notes: string }) =>
      transactionMutations.update(transactionId, { notes: notes.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
    },
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error));
    },
  });

  return { setNotes };
}
