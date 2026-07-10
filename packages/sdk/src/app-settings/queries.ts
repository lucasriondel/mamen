import type { AppSettings } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Query-key factory for the app-settings singleton. A single key — there is only
 * one row (`id: "app"`), so no per-id variants.
 */
export const appSettingsKeys = {
	all: ["app-settings"] as const,
};

/** tanstack-query read options for the app-settings singleton. */
export const appSettingsQueries = {
	get: () =>
		queryOptions({
			queryKey: appSettingsKeys.all,
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.appSettings.get()),
					signal,
				),
		}),
};

/**
 * Mutation functions for the app-settings singleton. Returned as plain
 * `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation — the SDK stays invalidation-agnostic. `put` is a whole-object
 * upsert; invalidate `appSettingsKeys.all` after a write.
 */
export const appSettingsMutations = {
	put: (settings: AppSettings) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.appSettings.put({ payload: settings }),
			),
		),
};
