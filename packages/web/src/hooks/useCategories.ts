import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { categoriesApi, queryKeys } from "@/lib/api";
import type { Category, CategoryWithSubcategories } from "@/types";

export type UseCategoriesReturn = {
	categories: Category[];
	parentCategories: Category[];
	categoriesWithSubs: CategoryWithSubcategories[];
	getSubcategories: (parentId: number) => Category[];
	getCategoryById: (id: number) => Category | undefined;
	isLoading: boolean;
};

export const useCategories = (): UseCategoriesReturn => {
	const { data: categories = [], isLoading } = useQuery({
		queryKey: queryKeys.categories.list({ orderBy: "sortOrder" }),
		queryFn: () => categoriesApi.getAll({ orderBy: "sortOrder" }),
	});

	const parentCategories = useMemo(
		() => categories.filter((c) => c.parentId === null),
		[categories],
	);

	const categoriesWithSubs = useMemo(
		() =>
			parentCategories.map((parent) => ({
				...parent,
				subcategories: categories.filter((c) => c.parentId === parent.id),
			})),
		[parentCategories, categories],
	);

	const getSubcategories = useCallback(
		(parentId: number): Category[] =>
			categories.filter((c) => c.parentId === parentId),
		[categories],
	);

	const getCategoryById = useCallback(
		(id: number): Category | undefined => categories.find((c) => c.id === id),
		[categories],
	);

	return {
		categories,
		parentCategories,
		categoriesWithSubs,
		getSubcategories,
		getCategoryById,
		isLoading,
	};
};
