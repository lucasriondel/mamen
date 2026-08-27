import type { StatementFormatId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { statementFormatKeys, statementFormatMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * Both writes fail the same way: the tagged error's own copy, as a toast. Module
 * scope rather than inside the hook, as in {@link useAccountMutations} — it
 * closes over nothing, so a copy per render would be one closure per render for
 * one constant behaviour.
 */
const onError = (error: unknown) => {
  toast.error(toErrorMessage(error));
};

/**
 * The two writes the formats dialog makes: a rename and a delete.
 *
 * Only these two, because they are the only two the API offers — a format's
 * mapping is fixed at authoring time, so what is left to change is its label and
 * whether it exists at all.
 *
 * Both invalidate the whole statement-formats key family rather than the one
 * account's list. The family is small, and a narrower invalidation would have to
 * name the exact params key the dialog's list was read under — which is the sort
 * of coupling that goes stale the day the list grows a second caller.
 *
 * There is no optimistic update and no undo, per the app's stance elsewhere
 * (`use-bulk-delete.ts`): the confirmation dialog is what stands in place of an
 * undo, and a rename is cheap enough to redo.
 */
export function useStatementFormatMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: statementFormatKeys.all });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: StatementFormatId; name: string }) =>
      statementFormatMutations.update(id, { name }),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: StatementFormatId) => statementFormatMutations.remove(id),
    onSuccess: invalidate,
    onError,
  });

  return { rename, remove };
}
