import type { Category } from "@mamen/shared";
import { categoriesApi } from "../categories";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const categoryQueries = defineQueries({
	list: {
		queryKey: (params?: { parentId?: number; orderBy?: "sortOrder" }) =>
			queryKeys.categories.list(params),
		queryFn: (params?: { parentId?: number; orderBy?: "sortOrder" }) =>
			categoriesApi.getAll(params),
	},
	detail: {
		queryKey: (id: number) => queryKeys.categories.detail(id),
		queryFn: (id: number) => categoriesApi.get(id),
	},
	root: {
		queryKey: () => ["categories", "root"] as const,
		queryFn: () => categoriesApi.getRoot(),
	},
	bySlug: {
		queryKey: (slug: string) => ["categories", "by-slug", slug] as const,
		queryFn: (slug: string) => categoriesApi.getBySlug(slug),
	},
});

export const categoryMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Category, "id">) => categoriesApi.create(data),
		invalidates: ["categories"],
	},
	bulkAdd: {
		mutationFn: (records: Omit<Category, "id">[]) =>
			categoriesApi.bulkAdd(records),
		invalidates: ["categories"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Category> }) =>
			categoriesApi.update(vars.id, vars.changes),
		invalidates: ["categories"],
	},
	bulkPut: {
		mutationFn: (records: Category[]) => categoriesApi.bulkPut(records),
		invalidates: ["categories"],
	},
	remove: {
		mutationFn: (id: number) => categoriesApi.delete(id),
		invalidates: ["categories"],
	},
	clear: {
		mutationFn: () => categoriesApi.clear(),
		invalidates: ["categories"],
	},
});
