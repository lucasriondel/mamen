import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api, AppSettings } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
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
        payload: new AppSettings({ id: "app" }),
      });
      assert.strictEqual(saved.id, "app");

      const fetched = yield* client.appSettings.get();
      assert.deepStrictEqual(fetched, saved);
    }).pipe(Effect.provide(HttpLive)),
  );

  it.effect("put is a whole-object upsert on the single fixed row", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.appSettings.put({
        payload: new AppSettings({ id: "app" }),
      });
      yield* client.appSettings.put({
        payload: new AppSettings({ id: "app" }),
      });

      // Two puts, one row — the dump is the only place the row count shows.
      const dump = yield* client.database.export();
      assert.strictEqual(dump.appSettings.length, 1);
    }).pipe(Effect.provide(HttpLive)),
  );

  /**
   * The singleton held an `LlmSettings` block with a plain-string `apiKey` until
   * issue #116 deleted it, so `GET /app-settings` was the one endpoint that would
   * hand a stored credential back to any client that asked. Asserted on the raw
   * bytes, not on the decoded entity: a field the schema drops on decode would
   * still have been on the wire.
   */
  it.effect("get answers with the id alone — no credential-bearing field", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.appSettings.put({
        payload: new AppSettings({ id: "app" }),
      });

      const http = yield* HttpClient.HttpClient;
      const res = yield* http.get("/api/app-settings");
      const body = yield* res.text;
      assert.deepStrictEqual(JSON.parse(body), { id: "app" });
    }).pipe(Effect.provide(HttpLive)),
  );
});
