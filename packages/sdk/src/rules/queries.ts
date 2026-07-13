import type {
	IssuerId,
	RuleCreate,
	RuleId,
	RulePreviewInput,
	RuleUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `issuerId` optional, mirroring the contract. */
export type RuleListParams = {
	limit?: number;
	offset?: number;
	issuerId?: IssuerId;
};

/** The `count` filter — the same `issuerId?` scope, no pagination. */
export type RuleCountParams = {
	issuerId?: IssuerId;
};

/** Query-key factory for the rules resource. */
export const ruleKeys = {
	all: ["rules"] as const,
	lists: () => [...ruleKeys.all, "list"] as const,
	list: (params: RuleListParams) => [...ruleKeys.lists(), params] as const,
	counts: () => [...ruleKeys.all, "count"] as const,
	count: (params: RuleCountParams) => [...ruleKeys.counts(), params] as const,
	details: () => [...ruleKeys.all, "detail"] as const,
	detail: (id: RuleId) => [...ruleKeys.details(), id] as const,
	byIssuerPattern: (issuerId: IssuerId, pattern: string) =>
		[...ruleKeys.all, "by-issuer-pattern", issuerId, pattern] as const,
	deletePreviews: () => [...ruleKeys.all, "delete-preview"] as const,
	deletePreview: (id: RuleId) => [...ruleKeys.deletePreviews(), id] as const,
	previews: () => [...ruleKeys.all, "preview"] as const,
	preview: (input: RulePreviewInput) =>
		[...ruleKeys.previews(), input] as const,
};

/** tanstack-query read options for the rules resource. */
export const ruleQueries = {
	list: (params: RuleListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: ruleKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.rules.list({ urlParams })),
					signal,
				),
		});
	},

	count: (params: RuleCountParams = {}) =>
		queryOptions({
			queryKey: ruleKeys.count(params),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.count({ urlParams: params }),
					),
					signal,
				),
		}),

	getById: (id: RuleId) =>
		queryOptions({
			queryKey: ruleKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.getById({ path: { id } }),
					),
					signal,
				),
		}),

	getByIssuerPattern: (issuerId: IssuerId, pattern: string) =>
		queryOptions({
			queryKey: ruleKeys.byIssuerPattern(issuerId, pattern),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.getByIssuerPattern({
							path: { issuerId, pattern },
						}),
					),
					signal,
				),
		}),

	/**
	 * Delete dry-run for a rule (PRD #8 stories 17–18) — the rows that will change
	 * issuer (`willReassign`) or become unmatched (`willUnmatch`) if this rule is
	 * removed, re-homed against the remaining rules. Read-only; the delete itself
	 * recomputes from current state, so this is advisory. Powers the delete
	 * confirmation dialog.
	 */
	deletePreview: (id: RuleId) =>
		queryOptions({
			queryKey: ruleKeys.deletePreview(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.previewDelete({ path: { id } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the rules resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation — the
 * SDK stays invalidation-agnostic. Invalidate `ruleKeys.all` after a write.
 */
export const ruleMutations = {
	/**
	 * Create/update dry-run (PRD #8 stories 7–12) — the three affected-transaction
	 * lists (`willMatch` / `willReassign` / `manualCollisions`) for the scoped
	 * pattern, without writing. A `POST` because the prospective rule state rides
	 * in the body; used as a `mutationFn` so the create/edit form can re-run it as
	 * the pattern changes.
	 */
	preview: (payload: RulePreviewInput) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.rules.preview({ payload })),
		),

	create: (payload: RuleCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.rules.create({ payload })),
		),

	update: (id: RuleId, payload: RuleUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.rules.update({ path: { id }, payload }),
			),
		),

	remove: (id: RuleId) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.rules.remove({ path: { id } })),
		),
};
