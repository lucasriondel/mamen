import type {
  IssuerId,
  SubscriptionCreate,
  SubscriptionFrequency,
  SubscriptionId,
  SubscriptionStatus,
  SubscriptionUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * The `list` filter — `issuerId?` + `status?`, both optional and composable
 * (AND-combined), mirroring the contract.
 */
export type SubscriptionListParams = {
  limit?: number;
  offset?: number;
  issuerId?: IssuerId;
  status?: SubscriptionStatus;
};

/** Query-key factory for the subscriptions resource. */
export const subscriptionKeys = {
  all: ["subscriptions"] as const,
  lists: () => [...subscriptionKeys.all, "list"] as const,
  list: (params: SubscriptionListParams) => [...subscriptionKeys.lists(), params] as const,
  firstByIssuer: (issuerId: IssuerId) =>
    [...subscriptionKeys.all, "first-by-issuer", issuerId] as const,
  byIssuerFrequency: (issuerId: IssuerId, frequency: SubscriptionFrequency) =>
    [...subscriptionKeys.all, "by-issuer-frequency", issuerId, frequency] as const,
};

/** tanstack-query read options for the subscriptions resource. */
export const subscriptionQueries = {
  list: (params: SubscriptionListParams = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: subscriptionKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.subscriptions.list({ urlParams })),
          signal,
        ),
    });
  },

  getFirstByIssuer: (issuerId: IssuerId) =>
    queryOptions({
      queryKey: subscriptionKeys.firstByIssuer(issuerId),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) =>
            client.subscriptions.getFirstByIssuer({ path: { issuerId } }),
          ),
          signal,
        ),
    }),

  getByIssuerFrequency: (issuerId: IssuerId, frequency: SubscriptionFrequency) =>
    queryOptions({
      queryKey: subscriptionKeys.byIssuerFrequency(issuerId, frequency),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) =>
            client.subscriptions.getByIssuerFrequency({
              path: { issuerId, frequency },
            }),
          ),
          signal,
        ),
    }),
};

/**
 * Mutation functions for the subscriptions resource. Returned as plain
 * `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation — the SDK stays invalidation-agnostic. Invalidate
 * `subscriptionKeys.all` after a write.
 */
export const subscriptionMutations = {
  create: (payload: SubscriptionCreate) =>
    runQuery(Effect.flatMap(Client, (client) => client.subscriptions.create({ payload }))),

  update: (id: SubscriptionId, payload: SubscriptionUpdate) =>
    runQuery(
      Effect.flatMap(Client, (client) => client.subscriptions.update({ path: { id }, payload })),
    ),
};
