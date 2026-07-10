import type {
	MerchantCreate,
	MerchantId,
	MerchantUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `orderBy` optional, mirroring the contract. */
export type MerchantListParams = {
	limit?: number;
	offset?: number;
	orderBy?: "name";
};

/** Query-key factory for the merchants resource. */
export const merchantKeys = {
	all: ["merchants"] as const,
	lists: () => [...merchantKeys.all, "list"] as const,
	list: (params: MerchantListParams) =>
		[...merchantKeys.lists(), params] as const,
	details: () => [...merchantKeys.all, "detail"] as const,
	detail: (id: MerchantId) => [...merchantKeys.details(), id] as const,
	byName: (name: string) => [...merchantKeys.all, "by-name", name] as const,
	byNameCi: (name: string) =>
		[...merchantKeys.all, "by-name-ci", name] as const,
};

/** tanstack-query read options for the merchants resource. */
export const merchantQueries = {
	list: (params: MerchantListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: merchantKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.merchants.list({ urlParams }),
					),
					signal,
				),
		});
	},

	getById: (id: MerchantId) =>
		queryOptions({
			queryKey: merchantKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.merchants.getById({ path: { id } }),
					),
					signal,
				),
		}),

	getByName: (name: string) =>
		queryOptions({
			queryKey: merchantKeys.byName(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.merchants.getByName({ path: { name } }),
					),
					signal,
				),
		}),

	getByNameCi: (name: string) =>
		queryOptions({
			queryKey: merchantKeys.byNameCi(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.merchants.getByNameCi({ path: { name } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the merchants resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation.
 * Invalidate `merchantKeys.all` after a write.
 *
 * `uploadImage` builds the `FormData` internally so web callers pass just a
 * `File` (mirroring the old hand-rolled `uploadImage(id, file)` — the contract
 * types the payload as `FormData` under the field key `file`).
 */
export const merchantMutations = {
	create: (payload: MerchantCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.merchants.create({ payload })),
		),

	update: (id: MerchantId, payload: MerchantUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.merchants.update({ path: { id }, payload }),
			),
		),

	remove: (id: MerchantId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.merchants.remove({ path: { id } }),
			),
		),

	uploadImage: (id: MerchantId, file: File) => {
		const payload = new FormData();
		payload.append("file", file);
		return runQuery(
			Effect.flatMap(Client, (client) =>
				client.merchants.uploadImage({ path: { id }, payload }),
			),
		);
	},

	deleteImage: (id: MerchantId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.merchants.deleteImage({ path: { id } }),
			),
		),
};
