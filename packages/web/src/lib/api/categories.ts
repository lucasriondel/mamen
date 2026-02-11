import type { Category } from "@mamen/shared";
import { api } from "./client";

export const categoriesApi = {
	getAll: (params: { parentId?: number; orderBy?: "sortOrder" } = {}) => {
		const search = new URLSearchParams();
		if (params.parentId !== undefined)
			search.set("parentId", String(params.parentId));
		if (params.orderBy) search.set("orderBy", params.orderBy);
		const qs = search.toString();
		return api.get<Category[]>(`/categories${qs ? `?${qs}` : ""}`);
	},

	getRoot: () => api.get<Category[]>("/categories/root"),

	get: (id: number) => api.get<Category>(`/categories/${id}`),

	getBySlug: (slug: string) =>
		api.get<Category>(`/categories/by-slug/${encodeURIComponent(slug)}`),

	create: async (data: Omit<Category, "id">) => {
		const result = await api.post<{ id: number }>("/categories", data);
		return result.id;
	},

	bulkAdd: async (records: Omit<Category, "id">[]) => {
		const result = await api.post<{ ids: number[] }>("/categories/bulk-add", {
			records,
		});
		return result.ids;
	},

	update: async (id: number, changes: Partial<Category>) => {
		await api.put(`/categories/${id}`, changes);
	},

	bulkPut: async (records: Category[]) => {
		await api.put("/categories/bulk-put", { records });
	},

	delete: async (id: number) => {
		await api.delete(`/categories/${id}`);
	},

	clear: async () => {
		await api.post("/categories/clear");
	},
};
