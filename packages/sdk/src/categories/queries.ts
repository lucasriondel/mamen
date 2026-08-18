import type {
  CategoryBulkCreate,
  CategoryCreate,
  CategoryId,
  CategorySpill,
  CategoryUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The composable `list` filter — both optional, mirroring the contract. */
export type CategoryListParams = {
  limit?: number;
  offset?: number;
  parentId?: CategoryId;
  orderBy?: "sortOrder";
};

/** Query-key factory for the categories resource. */
export const categoryKeys = {
  all: ["categories"] as const,
  lists: () => [...categoryKeys.all, "list"] as const,
  list: (params: CategoryListParams) => [...categoryKeys.lists(), params] as const,
  details: () => [...categoryKeys.all, "detail"] as const,
  detail: (id: CategoryId) => [...categoryKeys.details(), id] as const,
  bySlug: (slug: string) => [...categoryKeys.all, "by-slug", slug] as const,
};

/** tanstack-query read options for the categories resource. */
export const categoryQueries = {
  list: (params: CategoryListParams = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: categoryKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.categories.list({ urlParams })),
          signal,
        ),
    });
  },

  getById: (id: CategoryId) =>
    queryOptions({
      queryKey: categoryKeys.detail(id),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.categories.getById({ path: { id } })),
          signal,
        ),
    }),

  getBySlug: (slug: string) =>
    queryOptions({
      queryKey: categoryKeys.bySlug(slug),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.categories.getBySlug({ path: { slug } })),
          signal,
        ),
    }),
};

/**
 * Mutation functions for the categories resource. Returned as plain
 * `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation — the SDK stays invalidation-agnostic. Invalidate
 * `categoryKeys.all` after a write.
 */
export const categoryMutations = {
  create: (payload: CategoryCreate) =>
    runQuery(Effect.flatMap(Client, (client) => client.categories.create({ payload }))),

  bulkCreate: (records: CategoryBulkCreate["records"]) =>
    runQuery(
      Effect.flatMap(Client, (client) => client.categories.bulkCreate({ payload: { records } })),
    ),

  update: (id: CategoryId, payload: CategoryUpdate) =>
    runQuery(
      Effect.flatMap(Client, (client) => client.categories.update({ path: { id }, payload })),
    ),

  /**
   * **Spill** the money-holding node's transactions into a new child leaf the
   * user named — the atomic answer to a refused Kind flip. Returns the new leaf.
   */
  spill: (id: CategoryId, payload: CategorySpill) =>
    runQuery(
      Effect.flatMap(Client, (client) => client.categories.spill({ path: { id }, payload })),
    ),

  remove: (id: CategoryId) =>
    runQuery(Effect.flatMap(Client, (client) => client.categories.remove({ path: { id } }))),
};
