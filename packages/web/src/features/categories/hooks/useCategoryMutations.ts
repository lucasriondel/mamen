import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { categoriesApi, invalidateEntity } from "@/lib/api";
import type { UpdateCategoryInput } from "@/lib/schemas";
import type { Category } from "@/types";
import { DEFAULT_COLOR, DEFAULT_ICON } from "../lib/constants";

type UndoState = {
	deletedCategories: Category[];
	timeoutId: number;
};

const toSlug = (name: string): string =>
	name.toLowerCase().replace(/\s+/g, "-");

function collectDescendantIds(
	allCategories: Category[],
	rootId: number,
): number[] {
	const ids: number[] = [];
	const childrenMap = new Map<number, Category[]>();

	for (const cat of allCategories) {
		if (cat.parentId !== null) {
			const list = childrenMap.get(cat.parentId);
			if (list) {
				list.push(cat);
			} else {
				childrenMap.set(cat.parentId, [cat]);
			}
		}
	}

	const queue = [rootId];
	while (queue.length > 0) {
		const id = queue.pop()!;
		const children = childrenMap.get(id) ?? [];
		for (const child of children) {
			ids.push(child.id!);
			queue.push(child.id!);
		}
	}

	return ids;
}

export type UseCategoryMutationsReturn = {
	createCategory: (params: {
		name: string;
		parentId: number | null;
		color?: string;
		icon?: string;
	}) => Promise<number>;
	updateCategory: (id: number, updates: UpdateCategoryInput) => Promise<void>;
	deleteCategory: (id: number) => Promise<void>;
	reorder: (id: number, direction: "up" | "down") => Promise<void>;
};

export const useCategoryMutations = (): UseCategoryMutationsReturn => {
	const undoRef = useRef<UndoState | null>(null);

	const createCategory = useCallback(
		async (params: {
			name: string;
			parentId: number | null;
			color?: string;
			icon?: string;
		}): Promise<number> => {
			const { name, parentId, color, icon } = params;

			// Build slug: prefix with parent slug if nested
			let slug = toSlug(name);
			if (parentId !== null) {
				const parent = await categoriesApi.get(parentId);
				if (parent) {
					slug = `${parent.slug}-${slug}`;
				}
			}

			// Compute sortOrder as max(siblings) + 1
			const allCategories = await categoriesApi.getAll();
			const actualSiblings = allCategories.filter(
				(c) => c.parentId === parentId,
			);

			const maxSort =
				actualSiblings.length > 0
					? Math.max(...actualSiblings.map((c) => c.sortOrder))
					: -1;

			const id = await categoriesApi.create({
				name,
				slug,
				color: color ?? DEFAULT_COLOR,
				icon: icon ?? DEFAULT_ICON,
				parentId,
				sortOrder: maxSort + 1,
				createdAt: new Date(),
			});
			invalidateEntity("categories");

			return id;
		},
		[],
	);

	const updateCategory = useCallback(
		async (id: number, updates: UpdateCategoryInput): Promise<void> => {
			await categoriesApi.update(id, updates);
			invalidateEntity("categories");
		},
		[],
	);

	const deleteCategory = useCallback(async (id: number): Promise<void> => {
		// Clear any previous undo timeout
		if (undoRef.current) {
			clearTimeout(undoRef.current.timeoutId);
		}

		const allCategories = await categoriesApi.getAll();
		const target = allCategories.find((c) => c.id === id);
		if (!target) return;

		const descendantIds = collectDescendantIds(allCategories, id);
		const idsToDelete = [id, ...descendantIds];

		// Snapshot all categories to be deleted
		const snapshot = allCategories.filter((c) => idsToDelete.includes(c.id!));

		// Delete all categories (API handles the transaction)
		for (const idToDelete of idsToDelete) {
			await categoriesApi.delete(idToDelete);
		}
		invalidateEntity("categories");

		const descendantCount = descendantIds.length;

		const handleUndo = async (): Promise<void> => {
			if (!undoRef.current) return;
			clearTimeout(undoRef.current.timeoutId);
			await categoriesApi.bulkAdd(undoRef.current.deletedCategories);
			invalidateEntity("categories");
			undoRef.current = null;
			toast.success("Category restored");
		};

		const timeoutId = window.setTimeout(() => {
			undoRef.current = null;
		}, 10000);

		undoRef.current = {
			deletedCategories: snapshot,
			timeoutId,
		};

		const description =
			descendantCount > 0
				? `"${target.name}" and ${descendantCount} ${descendantCount === 1 ? "subcategory" : "subcategories"} removed.`
				: `"${target.name}" removed.`;

		toast("Category deleted", {
			description,
			action: {
				label: "Undo",
				onClick: handleUndo,
			},
			duration: 10000,
		});
	}, []);

	const reorder = useCallback(
		async (id: number, direction: "up" | "down"): Promise<void> => {
			const category = await categoriesApi.get(id);
			if (!category) return;

			// Get siblings sorted by sortOrder
			const allCategories = await categoriesApi.getAll();
			const siblings = allCategories
				.filter((c) => c.parentId === category.parentId)
				.sort((a, b) => a.sortOrder - b.sortOrder);

			const currentIndex = siblings.findIndex((c) => c.id === id);
			const swapIndex =
				direction === "up" ? currentIndex - 1 : currentIndex + 1;

			if (swapIndex < 0 || swapIndex >= siblings.length) return;

			const sibling = siblings[swapIndex];

			// Swap sortOrder values
			await categoriesApi.update(id, { sortOrder: sibling.sortOrder });
			await categoriesApi.update(sibling.id!, {
				sortOrder: category.sortOrder,
			});
			invalidateEntity("categories");
		},
		[],
	);

	return { createCategory, updateCategory, deleteCategory, reorder };
};
