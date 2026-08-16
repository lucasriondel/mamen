import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { DatabaseTest } from "../db/test";
import { DEFAULT_AI_CHOICE } from "./kernel";
import { AiTaskRepo } from "./repository";

/**
 * The AI-task settings store (issue #119) — driven directly, which is where the
 * two things the wire cannot see are cheapest to state: **what an absent row
 * reads as**, and **what a save actually wrote**.
 *
 * The doors above it are what refuse an unrunnable choice; this layer only
 * stores. So a row nothing put there through the door — a hand-edited database,
 * a provider dropped from the catalogue — is this suite's subject, because the
 * door never sees it.
 */

const TestLive = AiTaskRepo.Default.pipe(Layer.provideMerge(DatabaseTest));

describe("reading a task's choice", () => {
	it.effect("reads the catalogue default when nothing is stored", () =>
		Effect.gen(function* () {
			const repo = yield* AiTaskRepo;
			const choices = yield* repo.readChoices();

			// A fresh install has no row and still runs somewhere: the local CLI on
			// its cheap model, which is a fact of the catalogue and not of the table.
			assert.deepStrictEqual(choices["extract-pdf"], DEFAULT_AI_CHOICE);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("reads a stored choice back exactly", () =>
		Effect.gen(function* () {
			const repo = yield* AiTaskRepo;
			yield* repo.writeAll([
				["extract-pdf", { provider: "google", model: "gemini-2.5-pro" }],
			]);

			assert.deepStrictEqual((yield* repo.readChoices())["extract-pdf"], {
				provider: "google",
				model: "gemini-2.5-pro",
			});
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("falls back to the default for a provider it cannot decode", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			// A vendor mamen no longer carries — a hand-edited row, or a provider
			// dropped from the catalogue under a stored choice.
			yield* sql`INSERT INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', 'mistral', 'mistral-large', '2026-08-16T00:00:00.000Z')`;

			const repo = yield* AiTaskRepo;
			// The local provider, not the unreadable one: a name nothing can run is
			// answered with the one choice that sends a statement nowhere.
			assert.deepStrictEqual(
				(yield* repo.readChoices())["extract-pdf"],
				DEFAULT_AI_CHOICE,
			);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("ignores a row for a task the catalogue does not carry", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`INSERT INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('categorise', 'openai', 'gpt-5', '2026-08-16T00:00:00.000Z')`;

			const repo = yield* AiTaskRepo;
			const choices = yield* repo.readChoices();

			assert.deepStrictEqual(Object.keys(choices), ["extract-pdf"]);
		}).pipe(Effect.provide(TestLive)),
	);
});

describe("writing a task's choice", () => {
	it.effect("replaces the stored row rather than adding a second", () =>
		Effect.gen(function* () {
			const repo = yield* AiTaskRepo;
			const sql = yield* SqlClient.SqlClient;

			yield* repo.writeAll([
				["extract-pdf", { provider: "openai", model: "gpt-5-mini" }],
			]);
			yield* repo.writeAll([
				["extract-pdf", { provider: "openai", model: "gpt-5" }],
			]);

			const rows = yield* sql<{
				task: string;
				provider: string;
				model: string;
			}>`SELECT task, provider, model FROM ai_task_settings`;
			assert.deepStrictEqual(
				rows.map((row) => [row.task, row.provider, row.model]),
				[["extract-pdf", "openai", "gpt-5"]],
			);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("stamps when the choice was last saved", () =>
		Effect.gen(function* () {
			const repo = yield* AiTaskRepo;
			const sql = yield* SqlClient.SqlClient;
			yield* repo.writeAll([["extract-pdf", DEFAULT_AI_CHOICE]]);

			const rows = yield* sql<{
				updatedAt: string;
			}>`SELECT updatedAt FROM ai_task_settings`;
			assert.match(
				rows[0]?.updatedAt ?? "",
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		}).pipe(Effect.provide(TestLive)),
	);

	it.effect("writes nothing at all when given nothing", () =>
		Effect.gen(function* () {
			const repo = yield* AiTaskRepo;
			const sql = yield* SqlClient.SqlClient;
			yield* repo.writeAll([]);

			assert.deepStrictEqual(
				[...(yield* sql`SELECT * FROM ai_task_settings`)],
				[],
			);
		}).pipe(Effect.provide(TestLive)),
	);
});
