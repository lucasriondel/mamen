import { assert, describe, it } from "@effect/vitest";
import { AppSettings, LlmSettings } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { AppSettingsFromRow, AppSettingsRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `AppSettingsRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = AppSettingsRepo.Default.pipe(Layer.provide(DatabaseTest));

/** A valid AppSettings entity; override the llm block per test. */
const make = (over: Partial<LlmSettings> = {}): AppSettings =>
	new AppSettings({
		id: "app",
		llm: new LlmSettings({
			endpoint: "http://localhost:11434",
			modelName: "llama3",
			provider: "ollama",
			...over,
		}),
	});

describe("AppSettingsFromRow storage codec", () => {
	const encode = Schema.encodeSync(AppSettingsFromRow);
	const decode = Schema.decodeSync(AppSettingsFromRow);

	it("round-trips the llm block through the JSON TEXT column", () => {
		const full = new AppSettings({
			id: "app",
			llm: new LlmSettings({
				endpoint: "https://api.anthropic.com",
				apiKey: "sk-secret",
				modelName: "claude-3",
				provider: "anthropic",
				lastTestedAt: new Date("2026-06-01T00:00:00.000Z"),
				lastTestSuccess: true,
			}),
		});
		const row = encode(full);
		assert.strictEqual(row.id, "app");
		// The llm block is a JSON string; lastTestedAt is serialized as ISO.
		assert.ok(row.llm.includes("claude-3"));
		assert.deepStrictEqual(decode(row), full);
	});

	it("round-trips the optional fields when absent", () => {
		const bare = make();
		const row = encode(bare);
		assert.deepStrictEqual(decode(row), bare);
	});
});

describe("AppSettingsRepo", () => {
	it.effect("get fails NotFound before any put", () =>
		Effect.gen(function* () {
			const repo = yield* AppSettingsRepo;
			const error = yield* repo.get().pipe(Effect.flip);
			assert.strictEqual(error._tag, "NotFound");
			assert.strictEqual(error.resource, "appSettings");
			assert.strictEqual(error.id, "app");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("put stores the singleton; get returns it", () =>
		Effect.gen(function* () {
			const repo = yield* AppSettingsRepo;
			const saved = yield* repo.put(make({ modelName: "mistral" }));
			assert.strictEqual(saved.id, "app");
			assert.strictEqual(saved.llm.modelName, "mistral");

			const fetched = yield* repo.get();
			assert.deepStrictEqual(fetched, saved);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("put is a whole-object upsert (second put replaces the first)", () =>
		Effect.gen(function* () {
			const repo = yield* AppSettingsRepo;
			yield* repo.put(make({ provider: "ollama", modelName: "llama3" }));
			const second = yield* repo.put(
				make({ provider: "openai", modelName: "gpt-4" }),
			);
			assert.strictEqual(second.llm.provider, "openai");

			const fetched = yield* repo.get();
			assert.strictEqual(fetched.llm.provider, "openai");
			assert.strictEqual(fetched.llm.modelName, "gpt-4");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("put round-trips the optional lastTestedAt Date", () =>
		Effect.gen(function* () {
			const repo = yield* AppSettingsRepo;
			const when = new Date("2026-07-01T12:00:00.000Z");
			yield* repo.put(make({ lastTestedAt: when, lastTestSuccess: false }));
			const fetched = yield* repo.get();
			assert.deepStrictEqual(fetched.llm.lastTestedAt, when);
			assert.strictEqual(fetched.llm.lastTestSuccess, false);
		}).pipe(Effect.provide(RepoTest)),
	);
});
