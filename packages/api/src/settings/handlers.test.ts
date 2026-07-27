import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api, type Setting, SettingId } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(OutboundStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asSetting = Schema.decodeSync(SettingId);

/** A `Setting` payload with a placeholder id (upsert keys off `key`). */
const make = (key: Setting["key"], value: string): Setting =>
	({ id: asSetting(1), key, value }) as Setting;

describe("settings endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.settings.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("putByKey stores a setting; getByKey round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const saved = yield* client.settings.putByKey({
				payload: make("currency_symbol", "$"),
			});
			assert.strictEqual(saved.key, "currency_symbol");
			assert.strictEqual(saved.value, "$");
			assert.ok(saved.id > 0);

			const fetched = yield* client.settings.getByKey({
				path: { key: "currency_symbol" },
			});
			assert.deepStrictEqual(fetched, saved);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("putByKey upserts an existing key (value updated, id kept)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const first = yield* client.settings.putByKey({
				payload: make("llm_model", "gpt-4"),
			});
			const second = yield* client.settings.putByKey({
				payload: make("llm_model", "claude-3"),
			});
			assert.strictEqual(second.id, first.id);
			assert.strictEqual(second.value, "claude-3");

			const page = yield* client.settings.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.strictEqual(page.total, 1);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("putByKey accepts displayPreferences (the un-dropped key)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const saved = yield* client.settings.putByKey({
				payload: make("displayPreferences", '{"density":"compact"}'),
			});
			assert.strictEqual(saved.key, "displayPreferences");
			assert.strictEqual(saved.value, '{"density":"compact"}');
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.settings.putByKey({
				payload: make("currency_symbol", "$"),
			});
			yield* client.settings.putByKey({ payload: make("date_format", "x") });
			yield* client.settings.putByKey({ payload: make("llm_model", "y") });

			const page = yield* client.settings.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByKey 404s on an absent (but valid) key", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.settings
				.getByKey({ path: { key: "anomaly_threshold" } })
				.pipe(Effect.flip);
			assert.strictEqual(error._tag, "NotFound");
		}).pipe(Effect.provide(HttpLive)),
	);

	// A key outside the `SettingKey` literal union fails the path-param decode →
	// 400 (the ticket's "validated SettingKey literal" AC). The typed client won't
	// let us send an off-union value, so hit the raw route with the underlying
	// HttpClient bound to the test server.
	it.effect("getByKey rejects an unknown key with 400", () =>
		Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const res = yield* http.get("/api/settings/by-key/not_a_real_key");
			assert.strictEqual(res.status, 400);
		}).pipe(Effect.provide(HttpLive)),
	);
});
