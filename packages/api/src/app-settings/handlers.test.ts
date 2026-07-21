import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api, AppSettings, LlmSettings } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

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

describe("app-settings endpoints", () => {
	it.effect("get 404s before the singleton is written", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.appSettings.get().pipe(Effect.flip);
			assert.strictEqual(error._tag, "NotFound");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("put stores the singleton; get round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const saved = yield* client.appSettings.put({
				payload: make({ modelName: "mistral", provider: "lm-studio" }),
			});
			assert.strictEqual(saved.id, "app");
			assert.strictEqual(saved.llm.modelName, "mistral");
			assert.strictEqual(saved.llm.provider, "lm-studio");

			const fetched = yield* client.appSettings.get();
			assert.deepStrictEqual(fetched, saved);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("put upserts the whole object over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.appSettings.put({ payload: make({ provider: "ollama" }) });
			const second = yield* client.appSettings.put({
				payload: make({ provider: "openai", modelName: "gpt-4", apiKey: "sk-x" }),
			});
			assert.strictEqual(second.llm.provider, "openai");
			assert.strictEqual(second.llm.apiKey, "sk-x");

			const fetched = yield* client.appSettings.get();
			assert.strictEqual(fetched.llm.provider, "openai");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("put round-trips the optional lastTestedAt Date over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const when = new Date("2026-07-01T12:00:00.000Z");
			yield* client.appSettings.put({
				payload: make({ lastTestedAt: when, lastTestSuccess: true }),
			});
			const fetched = yield* client.appSettings.get();
			assert.deepStrictEqual(fetched.llm.lastTestedAt, when);
			assert.strictEqual(fetched.llm.lastTestSuccess, true);
		}).pipe(Effect.provide(HttpLive)),
	);
});
