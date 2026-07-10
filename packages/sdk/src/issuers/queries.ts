import type {
	IssuerCreate,
	IssuerId,
	IssuerUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `orderBy` optional, mirroring the contract. */
export type IssuerListParams = {
	limit?: number;
	offset?: number;
	orderBy?: "name";
};

/** Query-key factory for the issuers resource. */
export const issuerKeys = {
	all: ["issuers"] as const,
	lists: () => [...issuerKeys.all, "list"] as const,
	list: (params: IssuerListParams) =>
		[...issuerKeys.lists(), params] as const,
	details: () => [...issuerKeys.all, "detail"] as const,
	detail: (id: IssuerId) => [...issuerKeys.details(), id] as const,
	byName: (name: string) => [...issuerKeys.all, "by-name", name] as const,
	byNameCi: (name: string) =>
		[...issuerKeys.all, "by-name-ci", name] as const,
};

/** tanstack-query read options for the issuers resource. */
export const issuerQueries = {
	list: (params: IssuerListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: issuerKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.list({ urlParams }),
					),
					signal,
				),
		});
	},

	getById: (id: IssuerId) =>
		queryOptions({
			queryKey: issuerKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getById({ path: { id } }),
					),
					signal,
				),
		}),

	getByName: (name: string) =>
		queryOptions({
			queryKey: issuerKeys.byName(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getByName({ path: { name } }),
					),
					signal,
				),
		}),

	getByNameCi: (name: string) =>
		queryOptions({
			queryKey: issuerKeys.byNameCi(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.issuers.getByNameCi({ path: { name } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the issuers resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation.
 * Invalidate `issuerKeys.all` after a write.
 *
 * `uploadImage` builds the `FormData` internally so web callers pass just a
 * `File` (mirroring the old hand-rolled `uploadImage(id, file)` — the contract
 * types the payload as `FormData` under the field key `file`).
 */
export const issuerMutations = {
	create: (payload: IssuerCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.issuers.create({ payload })),
		),

	update: (id: IssuerId, payload: IssuerUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.update({ path: { id }, payload }),
			),
		),

	remove: (id: IssuerId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.remove({ path: { id } }),
			),
		),

	uploadImage: (id: IssuerId, file: File) => {
		const payload = new FormData();
		payload.append("file", file);
		return runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.uploadImage({ path: { id }, payload }),
			),
		);
	},

	deleteImage: (id: IssuerId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.issuers.deleteImage({ path: { id } }),
			),
		),
};
