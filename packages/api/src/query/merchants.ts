import type { Merchant } from "@mamen/shared";
import { merchantsApi } from "../merchants";
import { queryKeys } from "../queryKeys";
import { defineMutations, defineQueries } from "./factory";

export const merchantQueries = defineQueries({
	list: {
		queryKey: (params?: { orderBy?: "name" }) =>
			queryKeys.merchants.list(params),
		queryFn: (params?: { orderBy?: "name" }) => merchantsApi.getAll(params),
	},
	detail: {
		queryKey: (id: number) => queryKeys.merchants.detail(id),
		queryFn: (id: number) => merchantsApi.get(id),
	},
	byName: {
		queryKey: (name: string) => ["merchants", "by-name", name] as const,
		queryFn: (name: string) => merchantsApi.getByName(name),
	},
	byNameCaseInsensitive: {
		queryKey: (name: string) => ["merchants", "by-name-ci", name] as const,
		queryFn: (name: string) => merchantsApi.getByNameCaseInsensitive(name),
	},
});

export const merchantMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Merchant, "id">) => merchantsApi.create(data),
		invalidates: ["merchants"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Merchant> }) =>
			merchantsApi.update(vars.id, vars.changes),
		invalidates: ["merchants"],
	},
	remove: {
		mutationFn: (id: number) => merchantsApi.delete(id),
		invalidates: ["merchants"],
	},
	bulkPut: {
		mutationFn: (records: Merchant[]) => merchantsApi.bulkPut(records),
		invalidates: ["merchants"],
	},
	uploadImage: {
		mutationFn: (vars: { id: number; file: File }) =>
			merchantsApi.uploadImage(vars.id, vars.file),
		invalidates: ["merchants"],
	},
	deleteImage: {
		mutationFn: (id: number) => merchantsApi.deleteImage(id),
		invalidates: ["merchants"],
	},
});
