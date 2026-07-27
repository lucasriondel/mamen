import type { Category, CategoryId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { categoryKeys, categoryMutations } from "@/lib/sdk";
import { categoryHoldsMoney, toErrorMessage } from "@/lib/sdk-error";
import { slugify } from "@/lib/utils";

/**
 * A new category **inherits** its colour: `null`, not a colour of its own (ADR
 * 0006 / issue #55). This replaces a hardcoded `#94a3b8`, which was a live bug —
 * every user-created category came out grey regardless of the folder it was
 * created in, and a later folder recolour could never reach it. A category that
 * genuinely wants its own colour stores one and stops inheriting; a root, with no
 * ancestor to inherit from, resolves to the neutral constant, which is the grey
 * this used to hardcode.
 */
const NEW_COLOR = null;
// One icon for every new node: under ADR 0003 a category is born childless (a
// leaf) and *becomes* a folder only if something is later nested beneath it, so
// there is no folder-vs-leaf variant to pre-decide at creation (issue #32). An
// **Icon name** now — the Lucide id whose glyph the emoji `🏷️` used to stand for.
const NEW_CATEGORY_ICON = "tag";

/**
 * The taxonomy-curation write mutations for the categories page (PRD #19, issues
 * #26/#32): **create** a category — one gesture, optionally under a parent, its
 * kind decided by what ends up beneath it — rename any node, **move** any node to
 * a different parent (a whole subtree follows), spill, and delete — the last one
 * **guarded** by the API, which refuses while anything still depends on the
 * category.
 *
 * As elsewhere the SDK stays invalidation-agnostic, so each mutation owns its
 * side effects: on success invalidate the whole categories key family so the tree
 * (and every folder total) refetches; on failure raise a `sonner` toast whose
 * copy comes from the tagged error `_tag` ({@link toErrorMessage}). The guarded
 * delete's `CategoryInUse` carries dependent counts, so its toast *names* what to
 * re-assign first — more useful than a confirm dialog, because it says what would
 * break. The re-parent cycle guard (`CategoryWouldCycle`) surfaces the same way.
 */
export function useCategoryMutations() {
	const queryClient = useQueryClient();

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: categoryKeys.all });

	const onError = (error: unknown) => {
		toast.error(toErrorMessage(error));
	};

	// **Create** a category, optionally under a parent (`parentId: null` = a new
	// root). One gesture, no folder-vs-leaf variant: the node is born a leaf and
	// becomes a folder iff something is later nested beneath it (ADR 0003 / issue
	// #32). Nesting under an existing leaf is a **Kind flip**; if that leaf still
	// holds money the API refuses (`CategoryHoldsMoney`) and the view answers with
	// the spill dialog, so the toast is suppressed for that one case to avoid
	// double-signalling.
	const create = useMutation({
		mutationFn: ({
			name,
			parentId,
		}: {
			name: string;
			parentId: CategoryId | null;
		}): Promise<Category> =>
			categoryMutations.create({
				name,
				slug: slugify(name),
				color: NEW_COLOR,
				icon: NEW_CATEGORY_ICON,
				parentId,
				sortOrder: 0,
			}),
		onSuccess: invalidate,
		onError: (error) => {
			if (!categoryHoldsMoney(error)) onError(error);
		},
	});

	// Rename any node without losing history — only the display name changes.
	const rename = useMutation({
		mutationFn: ({ id, name }: { id: CategoryId; name: string }) =>
			categoryMutations.update(id, { name }),
		onSuccess: invalidate,
		onError,
	});

	// Set a node's **Icon name** — the Lucide id the picker chose (ADR 0006 /
	// issue #58). A single-field patch, deliberately: it rides the same update
	// endpoint as rename and move but never sends the other fields, so two people
	// editing different facets of one category can't clobber each other.
	const setIcon = useMutation({
		mutationFn: ({ id, icon }: { id: CategoryId; icon: string }) =>
			categoryMutations.update(id, { icon }),
		onSuccess: invalidate,
		onError,
	});

	// Set — or **clear** — a node's colour. `null` is the whole point: it stores a
	// *reference* to the nearest coloured ancestor rather than a colour, so the
	// node resumes inheriting and a later folder recolour reaches it again (ADR
	// 0006). Invalidating refetches the tree, which is what repaints every
	// descendant that never opted out — the propagation is a re-resolve, not a
	// cascade of writes.
	const setColor = useMutation({
		mutationFn: ({ id, color }: { id: CategoryId; color: string | null }) =>
			categoryMutations.update(id, { color }),
		onSuccess: invalidate,
		onError,
	});

	// Move any node to a different parent (`parentId: null` promotes it to a
	// root); its id is unchanged, so its transactions and its whole subtree follow
	// for free. Any node is a legal parent now (ADR 0003); the API refuses a move
	// that would form a cycle (`CategoryWouldCycle`) or strand money under a
	// money-holding target (`CategoryHoldsMoney`), both surfaced as a toast.
	const move = useMutation({
		mutationFn: ({
			id,
			parentId,
		}: {
			id: CategoryId;
			parentId: CategoryId | null;
		}) => categoryMutations.update(id, { parentId }),
		onSuccess: invalidate,
		onError,
	});

	// **Spill** (issue #30): the answer to a refused Kind flip. Create a new child
	// leaf under the money-holding node and move its money into it atomically
	// (server-side), so the node becomes a folder and nothing is stranded. The
	// user always names the destination — never auto-named.
	const spill = useMutation({
		mutationFn: ({
			id,
			name,
		}: {
			id: CategoryId;
			name: string;
		}): Promise<Category> =>
			categoryMutations.spill(id, {
				name,
				slug: slugify(name),
				color: NEW_COLOR,
				icon: NEW_CATEGORY_ICON,
				sortOrder: 0,
			}),
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

	return { create, rename, setIcon, setColor, move, spill, remove };
}
