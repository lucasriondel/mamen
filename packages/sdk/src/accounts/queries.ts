import type { AccountCreate, AccountId, AccountUpdate } from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** Query-key factory for the accounts resource. */
export const accountKeys = {
  all: ["accounts"] as const,
  lists: () => [...accountKeys.all, "list"] as const,
  list: (params: { limit?: number; offset?: number }) => [...accountKeys.lists(), params] as const,
  details: () => [...accountKeys.all, "detail"] as const,
  detail: (id: AccountId) => [...accountKeys.details(), id] as const,
  byName: (name: string) => [...accountKeys.all, "by-name", name] as const,
};

/** tanstack-query read options for the accounts resource. */
export const accountQueries = {
  list: (params: { limit?: number; offset?: number } = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: accountKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.accounts.list({ urlParams })),
          signal,
        ),
    });
  },

  getById: (id: AccountId) =>
    queryOptions({
      queryKey: accountKeys.detail(id),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.accounts.getById({ path: { id } })),
          signal,
        ),
    }),

  getByName: (name: string) =>
    queryOptions({
      queryKey: accountKeys.byName(name),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.accounts.getByName({ path: { name } })),
          signal,
        ),
    }),
};

/**
 * Mutation functions for the accounts resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation — the
 * SDK stays invalidation-agnostic. Invalidate `accountKeys.all` after a write.
 */
export const accountMutations = {
  create: (payload: AccountCreate) =>
    runQuery(Effect.flatMap(Client, (client) => client.accounts.create({ payload }))),

  update: (id: AccountId, payload: AccountUpdate) =>
    runQuery(Effect.flatMap(Client, (client) => client.accounts.update({ path: { id }, payload }))),

  remove: (id: AccountId) =>
    runQuery(Effect.flatMap(Client, (client) => client.accounts.remove({ path: { id } }))),
};
