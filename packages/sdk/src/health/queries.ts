import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** Query-key factory for the health resource. */
export const healthKeys = {
	all: ["health"] as const,
	check: () => [...healthKeys.all, "check"] as const,
};

/** tanstack-query options for the health resource. */
export const healthQueries = {
	check: () =>
		queryOptions({
			queryKey: healthKeys.check(),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.health.check()),
					signal,
				),
		}),
};
