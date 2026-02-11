import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { categoriesApi, queryKeys } from "@/lib/api";
import type { Category, CategoryTreeNode } from "@/types";

export type UseCategoryTreeReturn = {
	tree: CategoryTreeNode[];
	allCategories: Category[];
	isLoading: boolean;
};

function buildTree(categories: Category[]): CategoryTreeNode[] {
	const childrenMap = new Map<number | null, Category[]>();

	for (const cat of categories) {
		const key = cat.parentId;
		const list = childrenMap.get(key);
		if (list) {
			list.push(cat);
		} else {
			childrenMap.set(key, [cat]);
		}
	}

	function buildNodes(parentId: number | null): CategoryTreeNode[] {
		const children = childrenMap.get(parentId) ?? [];
		return children.map((cat) => ({
			...cat,
			children: buildNodes(cat.id!),
		}));
	}

	return buildNodes(null);
}

export const useCategoryTree = (): UseCategoryTreeReturn => {
	const { data: allCategories = [], isLoading } = useQuery({
		queryKey: queryKeys.categories.list({ orderBy: "sortOrder" }),
		queryFn: () => categoriesApi.getAll({ orderBy: "sortOrder" }),
	});

	const tree = useMemo(() => buildTree(allCategories), [allCategories]);

	return { tree, allCategories, isLoading };
};
