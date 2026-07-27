import type {
	CategoryId,
	IssuerCreate,
	IssuerId,
	IssuerUpdate,
} from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { issuerKeys, issuerMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";

/**
 * Issuer write mutations for the edit dialog, wired to invalidation + failure
 * toasts.
 *
 * As with accounts, the SDK stays invalidation-agnostic, so each mutation owns
 * its side effects (PRD): on success invalidate the whole issuers key family so
 * the grid (names, avatars) refetches; on failure raise a `sonner` toast whose
 * copy comes from the tagged error `_tag` ({@link toErrorMessage}). The 2 MiB
 * image cap is enforced by the contract's multipart parser — an oversize upload
 * rejects and surfaces here as a toast; the dialog also pre-checks the file so
 * the user gets an instant, specific message.
 */
export function useIssuerMutations() {
	const queryClient = useQueryClient();

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: issuerKeys.all });

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	// Hand-create an issuer (issue: standalone "Create issuer" page). Unlike the
	// assignment picker's create — which mints a bare name to hang a rule on — this
	// pre-seeds a `defaultCategoryId` so the issuer auto-files its future matching
	// transactions before it has any. `firstSeen` is caller-provided by contract;
	// there's no first transaction yet, so we stamp "now" (as the assignment picker
	// does). Returns the new Issuer (with id) so the caller can navigate to it.
	const create = useMutation({
		mutationFn: (payload: Omit<IssuerCreate, "firstSeen">) =>
			issuerMutations.create({ ...payload, firstSeen: new Date() }),
		onSuccess: invalidate,
		onError,
	});

	const rename = useMutation({
		mutationFn: ({ id, patch }: { id: IssuerId; patch: IssuerUpdate }) =>
			issuerMutations.update(id, patch),
		onSuccess: invalidate,
		onError,
	});

	const uploadImage = useMutation({
		mutationFn: ({ id, file }: { id: IssuerId; file: File }) =>
			issuerMutations.uploadImage(id, file),
		onSuccess: invalidate,
		onError,
	});

	const deleteImage = useMutation({
		mutationFn: (id: IssuerId) => issuerMutations.deleteImage(id),
		onSuccess: invalidate,
		onError,
	});

	// Store a picked **Logo search** result (issue #61). Invalidates exactly like
	// the upload — the avatar is a read of the issuer, so one invalidation
	// repaints every render site without a reload. No `onError` toast: the only
	// failure is a refused fetch, and the answer to it is "pick another of the
	// results still on screen", so that message belongs *in* the popover beside
	// them rather than in a toast that outlives the surface it refers to.
	const setImageFromUrl = useMutation({
		mutationFn: ({ id, url }: { id: IssuerId; url: string }) =>
			issuerMutations.setImageFromUrl(id, url),
		onSuccess: invalidate,
	});

	const remove = useMutation({
		mutationFn: (id: IssuerId) => issuerMutations.remove(id),
		onSuccess: invalidate,
		onError,
	});

	// The bulk lever (PRD #19): set — or clear (`null`) — an issuer's default
	// category, reclassifying its whole non-overridden history at once (the
	// category is derived through the issuer at query time, never copied). A
	// folder is rejected by the API (`CategoryNotLeaf`) and surfaces as a toast.
	const setDefaultCategory = useMutation({
		mutationFn: ({
			id,
			categoryId,
		}: {
			id: IssuerId;
			categoryId: CategoryId | null;
		}) => issuerMutations.update(id, { defaultCategoryId: categoryId }),
		onSuccess: invalidate,
		onError,
	});

	return {
		create,
		rename,
		uploadImage,
		deleteImage,
		setImageFromUrl,
		remove,
		setDefaultCategory,
	};
}
