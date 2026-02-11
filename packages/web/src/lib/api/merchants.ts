import type { Merchant } from "@mamen/shared";
import { ApiError, api } from "./client";

export const merchantsApi = {
	getAll: (params: { orderBy?: "name" } = {}) =>
		api.get<Merchant[]>(`/merchants${params.orderBy ? "?orderBy=name" : ""}`),

	get: (id: number) => api.get<Merchant>(`/merchants/${id}`),

	getByName: (name: string) =>
		api.get<Merchant>(`/merchants/by-name/${encodeURIComponent(name)}`),

	getByNameCaseInsensitive: (name: string) =>
		api.get<Merchant>(`/merchants/by-name-ci/${encodeURIComponent(name)}`),

	create: async (data: Omit<Merchant, "id">) => {
		const result = await api.post<{ id: number }>("/merchants", data);
		return result.id;
	},

	update: async (id: number, changes: Partial<Merchant>) => {
		await api.put(`/merchants/${id}`, changes);
	},

	bulkPut: async (records: Merchant[]) => {
		await api.put("/merchants/bulk-put", { records });
	},

	delete: async (id: number) => {
		await api.delete(`/merchants/${id}`);
	},

	uploadImage: async (
		id: number,
		file: File,
	): Promise<{ imageUrl: string }> => {
		const formData = new FormData();
		formData.append("image", file);

		const response = await fetch(`/api/merchants/${id}/image`, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			let message = `HTTP ${response.status}`;
			try {
				const parsed = JSON.parse(body);
				if (parsed.error) message = parsed.error;
			} catch {
				if (body) message = body;
			}
			throw new ApiError(response.status, message);
		}

		return response.json();
	},

	deleteImage: async (id: number): Promise<void> => {
		await api.delete(`/merchants/${id}/image`);
	},
};
