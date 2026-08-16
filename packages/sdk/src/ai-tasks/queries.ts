import type { AiTask, AiTaskChange } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Query-key factory for **which provider and model runs each AI task**
 * (issue #120, PRD #115).
 *
 * As with the secrets list, the read takes no params: the task list is a closed
 * literal and `GET /ai/tasks` answers exhaustively, one entry per task.
 */
export const aiTaskKeys = {
	all: ["ai-tasks"] as const,
	list: () => [...aiTaskKeys.all, "list"] as const,
	resolution: (task: AiTask) =>
		[...aiTaskKeys.all, "resolution", task] as const,
};

/** tanstack-query read options for the per-task provider/model choice. */
export const aiTaskQueries = {
	list: () =>
		queryOptions({
			queryKey: aiTaskKeys.list(),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.aiTasks.list()),
					signal,
				),
		}),

	resolution: (task: AiTask) =>
		queryOptions({
			queryKey: aiTaskKeys.resolution(task),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.aiTasks.resolve({ path: { task } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation function for the per-task choice — the **checked write door**. It
 * answers with every task's choice as stored *after* the write, so a caller that
 * sent `{ task, provider }` alone learns which model the server landed on
 * (that provider's cheap default) rather than guessing it.
 *
 * A refusal is the contract's `TaskProviderRejected`, which names the task and
 * the provider it would have run on. Nothing is written when it raises, so a
 * caller has nothing to unwind — a refetch of `aiTaskKeys.all` restores the
 * picker to what is actually stored.
 */
export const aiTaskMutations = {
	patch: (tasks: ReadonlyArray<AiTaskChange>) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.aiTasks.patch({ payload: { tasks } }),
			),
		),
};
