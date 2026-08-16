import { SqlClient } from "@effect/sql";
import { AI_TASKS, AiProvider, type AiTask } from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";
import {
	type AiTaskChoice,
	type AiTaskChoices,
	DEFAULT_AI_CHOICE,
} from "./kernel";

/**
 * The **AI-task settings store** (issue #119) — which provider and model each
 * task runs on, one row per task, and nothing else. It stores; it does not
 * decide. Every rule about what may be stored lives in `kernel.ts` and is
 * applied by the **checked write doors** in `task-provider.ts`, which is the
 * only caller of `writeAll`.
 *
 * Two properties are this module's own, and both are about reading rather than
 * writing:
 *
 * - **an absent row reads as the catalogue default.** Nothing is seeded, so a
 *   fresh install has an empty table and still runs somewhere, and moving the
 *   default is an edit to `contract/ai.ts` rather than a data migration.
 * - **a row the catalogue cannot make sense of is not obeyed.** The columns are
 *   free text (a CHECK listing the providers would be the catalogue written
 *   twice), so a hand-edited row, or one left behind by a provider that has
 *   since been dropped, reads as the default — the one choice that sends a bank
 *   statement nowhere.
 */

/** The stored row: free-text columns, decoded against the catalogue on read. */
type AiTaskRow = {
	readonly task: string;
	readonly provider: string;
	readonly model: string;
};

const decodeProvider = Schema.decodeUnknownOption(AiProvider);

export class AiTaskRepo extends Effect.Service<AiTaskRepo>()("api/AiTaskRepo", {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;

		const nowIso = Clock.currentTimeMillis.pipe(
			Effect.map((millis) => new Date(millis).toISOString()),
		);

		/**
		 * Every task's choice, **total over the catalogue** — the shape the kernel
		 * takes, so there is no absent case for it to have an opinion about. One
		 * query however many tasks there are; the catalogue drives the result, so a
		 * row for a task mamen does not carry is simply not reported, exactly as
		 * `GET /secrets` treats a row under an unknown provider.
		 */
		const readChoices = (): Effect.Effect<AiTaskChoices> =>
			sql<AiTaskRow>`SELECT task, provider, model FROM ai_task_settings`.pipe(
				orDieSql,
				Effect.map((rows) => {
					const stored = new Map(rows.map((row) => [row.task, row]));
					return Object.fromEntries(
						AI_TASKS.map((task) => [
							task,
							Option.match(
								Option.flatMap(Option.fromNullable(stored.get(task)), (row) =>
									decodeProvider(row.provider).pipe(
										Option.map(
											(provider): AiTaskChoice => ({
												provider,
												model: row.model,
											}),
										),
									),
								),
								{
									onNone: () => DEFAULT_AI_CHOICE,
									onSome: (choice) => choice,
								},
							),
						]),
					) as AiTaskChoices;
				}),
			);

		/**
		 * Store some tasks' choices. One transaction, so a multi-task patch that
		 * the door accepted lands whole — the door refuses a bad patch before this
		 * is ever called, and this is what keeps an infrastructure failure halfway
		 * through from leaving half of an accepted one applied.
		 */
		const writeAll = (
			entries: ReadonlyArray<readonly [AiTask, AiTaskChoice]>,
		): Effect.Effect<void> =>
			Effect.gen(function* () {
				const updatedAt = yield* nowIso;
				yield* sql.withTransaction(
					Effect.forEach(
						entries,
						([task, choice]) =>
							sql`INSERT OR REPLACE INTO ai_task_settings ${sql.insert({
								task,
								provider: choice.provider,
								model: choice.model,
								updatedAt,
							})}`,
					),
				);
			}).pipe(orDieSql, Effect.asVoid);

		return { readChoices, writeAll } as const;
	}),
}) {}
