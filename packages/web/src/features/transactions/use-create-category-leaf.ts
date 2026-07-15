import type { Category, CategoryId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { categoryKeys, categoryMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { slugify } from "@/lib/utils";

/**
 * Create a **Category leaf** from the transaction picker (PRD #19, issue #24).
 * The cell can only ever mint a *leaf* — every assignable category needs a
 * parent, so the caller supplies the folder it belongs under; folders are
 * structural and created deliberately on the categories page, never while
 * triaging. The name is pre-filled from the picker's search query, so the search
 * already done is not wasted, and a slug is derived from it. Colour/icon get
 * neutral defaults the user can refine later on the categories page.
 *
 * On a rejected write — a `parentId` pointing at a leaf surfaces as
 * `CategoryParentNotFolder` server-side — a `sonner` toast reports it. Success
 * invalidates the categories key family so the new leaf shows in the picker.
 */
export function useCreateCategoryLeaf() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			name,
			parentId,
		}: {
			name: string;
			parentId: CategoryId;
		}): Promise<Category> =>
			categoryMutations.create({
				name,
				slug: slugify(name),
				color: "#94a3b8",
				icon: "🏷️",
				parentId,
				sortOrder: 0,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: categoryKeys.all });
		},
		onError: (error: unknown) => {
			toast.error(toErrorMessage(error));
		},
	});
}
