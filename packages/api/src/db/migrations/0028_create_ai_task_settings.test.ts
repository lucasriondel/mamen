import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * `ai_task_settings` (issue #119) — one row per **AI task**, holding the
 * provider and model that task runs on.
 *
 * Two properties earn a test rather than a reading of the DDL:
 *
 * - the key is the *task*, so saving a task's choice twice replaces it. A
 *   surrogate id would let two rows claim the same task and make "what runs the
 *   extraction" a question with two answers.
 * - **the table starts empty**, and that is the feature: an absent row means
 *   *the default* (`claude-code` on its cheap model), read from the catalogue. A
 *   migration that seeded the defaults would freeze today's default into a row,
 *   and moving it later would be a data migration instead of a one-line edit.
 */
describe("0028 ai_task_settings", () => {
	it.effect("keys a choice by task — a second write replaces the first", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`INSERT OR REPLACE INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', 'anthropic', 'claude-haiku-4-5', '2026-08-16T00:00:00.000Z')`;
			yield* sql`INSERT OR REPLACE INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', 'openai', 'gpt-5', '2026-08-16T00:01:00.000Z')`;

			const rows = yield* sql<{
				task: string;
				provider: string;
				model: string;
			}>`SELECT task, provider, model FROM ai_task_settings`;

			assert.deepStrictEqual(
				rows.map((row) => [row.task, row.provider, row.model]),
				[["extract-pdf", "openai", "gpt-5"]],
			);
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("starts empty, so the default lives in the catalogue", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const rows = yield* sql`SELECT * FROM ai_task_settings`;

			assert.deepStrictEqual([...rows], []);
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("refuses a row that names no provider or model", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			// A row asserts "this task runs on *that*". A row holding half of that
			// is a choice nothing can act on, so the column, not the reader, refuses
			// it.
			const error =
				yield* sql`INSERT INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', NULL, NULL, '2026-08-16T00:00:00.000Z')`.pipe(
					Effect.flip,
				);

			assert.include(String(error.cause ?? error.message), "NOT NULL");
		}).pipe(Effect.provide(DatabaseTest)),
	);
});
