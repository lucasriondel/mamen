import type { AccountCreate, AccountId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountKeys, accountMutations } from "@/lib/sdk";
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
 * Account write mutations, wired to invalidation + failure toasts.
 *
 * The SDK stays invalidation-agnostic (its mutation fns are plain
 * `Promise`-returning calls), so each mutation here owns its side effects per the
 * PRD: on success invalidate the whole accounts key family so the list refetches;
 * on failure raise a `sonner` toast whose copy comes from the tagged error
 * `_tag` ({@link toErrorMessage}). Read failures are handled inline by the view,
 * not here.
 */
export function useAccountMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: accountKeys.all });

  const create = useMutation({
    mutationFn: (payload: AccountCreate) => accountMutations.create(payload),
    onSuccess: invalidate,
    onError,
  });

  // The card's edit form submits name and IBAN together, so they travel as one
  // write: two mutations would mean two invalidations and a window where the
  // card shows the new name beside the old IBAN. `iban: null` is meaningful —
  // it clears a stored IBAN — so it is sent explicitly, like `color` below.
  const edit = useMutation({
    mutationFn: ({ id, name, iban }: { id: AccountId; name: string; iban: string | null }) =>
      accountMutations.update(id, { name, iban }),
    onSuccess: invalidate,
    onError,
  });

  // `color: null` is a meaningful value here, not an omission — it clears the
  // stored colour and returns the account to the auto palette — so it is sent
  // explicitly rather than stripped from the payload.
  const recolor = useMutation({
    mutationFn: ({ id, color }: { id: AccountId; color: string | null }) =>
      accountMutations.update(id, { color }),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: AccountId) => accountMutations.remove(id),
    onSuccess: invalidate,
    onError,
  });

  return { create, edit, recolor, remove };
}
