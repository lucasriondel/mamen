import type { SecretName } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Query-key factory for the encrypted-credential store (issue #120, PRD #115).
 *
 * There is no paged `list` here and no params in the key: the provider set is a
 * closed literal, so `GET /secrets` answers with one entry per provider and the
 * list has exactly one shape.
 */
export const secretKeys = {
	all: ["secrets"] as const,
	list: () => [...secretKeys.all, "list"] as const,
	byName: (name: SecretName) => [...secretKeys.all, "by-name", name] as const,
};

/**
 * tanstack-query read options for credential **status** — a boolean and a masked
 * hint per provider. There is no read that returns a stored value, here or
 * anywhere: the outward surface is `SecretStatus` and nothing else (ADR 0011).
 */
export const secretQueries = {
	list: () =>
		queryOptions({
			queryKey: secretKeys.list(),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.secrets.list()),
					signal,
				),
		}),

	status: (name: SecretName) =>
		queryOptions({
			queryKey: secretKeys.byName(name),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.secrets.status({ path: { name } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the credential store. Plain `mutationFn`s, as
 * everywhere in this SDK — the caller owns invalidation.
 *
 * Invalidate `secretKeys.all` **and** the AI-task keys after either write: a
 * credential appearing or disappearing changes which providers a task may be
 * pointed at, so the picker's options are stale the moment this resolves.
 *
 * `put` is an upsert (pasting over a stored credential rotates it); `clear` is
 * idempotent, except that it is also the deletion door and refuses with
 * `TaskProviderRejected` when a task is running on that provider today.
 */
export const secretMutations = {
	put: (name: SecretName, value: string) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.secrets.put({ path: { name }, payload: { value } }),
			),
		),

	clear: (name: SecretName) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.secrets.clear({ path: { name } }),
			),
		),
};
