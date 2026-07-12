import type { AccountCreate, AccountId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { accountKeys, accountMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

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

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: accountKeys.all });

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	const create = useMutation({
		mutationFn: (payload: AccountCreate) => accountMutations.create(payload),
		onSuccess: invalidate,
		onError,
	});

	const rename = useMutation({
		mutationFn: ({ id, name }: { id: AccountId; name: string }) =>
			accountMutations.update(id, { name }),
		onSuccess: invalidate,
		onError,
	});

	const remove = useMutation({
		mutationFn: (id: AccountId) => accountMutations.remove(id),
		onSuccess: invalidate,
		onError,
	});

	return { create, rename, remove };
}
