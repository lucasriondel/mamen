import type { Setting, SettingKey } from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** Query-key factory for the settings key/value store. */
export const settingKeys = {
  all: ["settings"] as const,
  lists: () => [...settingKeys.all, "list"] as const,
  list: (params: { limit?: number; offset?: number }) => [...settingKeys.lists(), params] as const,
  byKey: (key: SettingKey) => [...settingKeys.all, "by-key", key] as const,
};

/** tanstack-query read options for the settings resource. */
export const settingQueries = {
  list: (params: { limit?: number; offset?: number } = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: settingKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.settings.list({ urlParams })),
          signal,
        ),
    });
  },

  getByKey: (key: SettingKey) =>
    queryOptions({
      queryKey: settingKeys.byKey(key),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.settings.getByKey({ path: { key } })),
          signal,
        ),
    }),
};

/**
 * Mutation functions for the settings resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation — the
 * SDK stays invalidation-agnostic. `putByKey` is an upsert on `key`; invalidate
 * `settingKeys.all` after a write.
 */
export const settingMutations = {
  putByKey: (setting: Setting) =>
    runQuery(Effect.flatMap(Client, (client) => client.settings.putByKey({ payload: setting }))),
};
