import type { Category, CategoryId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { categoryKeys, categoryMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { slugify } from "@/lib/utils";

/** Neutral colour/icon defaults a new category gets; refined later if wanted. */
const NEW_COLOR = "#94a3b8";
const NEW_FOLDER_ICON = "📁";
const NEW_LEAF_ICON = "🏷️";

/**
 * The taxonomy-curation write mutations for the categories page (PRD #19, issue
 * #26): create a **Category folder** or a **Category leaf**, rename any node,
 * move a leaf to a different folder, and delete — the last one **guarded** by the
 * API, which refuses while anything still depends on the category.
 *
 * As elsewhere the SDK stays invalidation-agnostic, so each mutation owns its
 * side effects: on success invalidate the whole categories key family so the tree
 * (and every folder total) refetches; on failure raise a `sonner` toast whose
 * copy comes from the tagged error `_tag` ({@link toErrorMessage}). The guarded
 * delete's `CategoryInUse` carries dependent counts, so its toast *names* what to
 * re-assign first — more useful than a confirm dialog, because it says what would
 * break. The re-parent guard (`CategoryHasChildren`) and the leaf-only guard
 * surface the same way.
 */
export function useCategoryMutations() {
	const queryClient = useQueryClient();

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: categoryKeys.all });

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	// A **Category folder**: no parent, never assignable — the grouping node.
	const createFolder = useMutation({
		mutationFn: (name: string): Promise<Category> =>
			categoryMutations.create({
				name,
				slug: slugify(name),
				color: NEW_COLOR,
				icon: NEW_FOLDER_ICON,
				parentId: null,
				sortOrder: 0,
			}),
		onSuccess: invalidate,
		onError,
	});

	// A **Category leaf** inside a chosen folder — the only assignable kind.
	const createLeaf = useMutation({
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
				color: NEW_COLOR,
				icon: NEW_LEAF_ICON,
				parentId,
				sortOrder: 0,
			}),
		onSuccess: invalidate,
		onError,
	});

	// Rename any node without losing history — only the display name changes.
	const rename = useMutation({
		mutationFn: ({ id, name }: { id: CategoryId; name: string }) =>
			categoryMutations.update(id, { name }),
		onSuccess: invalidate,
		onError,
	});

	// Move a leaf to a different folder; its id is unchanged, so its transactions
	// follow for free. Any node is a legal parent now (ADR 0003).
	const move = useMutation({
		mutationFn: ({ id, parentId }: { id: CategoryId; parentId: CategoryId }) =>
			categoryMutations.update(id, { parentId }),
		onSuccess: invalidate,
		onError,
	});

	// The guarded delete: the API refuses (`CategoryInUse`) while anything depends
	// on the category, and the toast names the dependents.
	const remove = useMutation({
		mutationFn: (id: CategoryId) => categoryMutations.remove(id),
		onSuccess: invalidate,
		onError,
	});

	return { createFolder, createLeaf, rename, move, remove };
}
