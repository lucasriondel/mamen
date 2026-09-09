import { HttpApiBuilder, HttpApiClient, HttpBody, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { SqlClient } from "@effect/sql";
import { afterEach, assert, describe, it } from "@effect/vitest";
import { Api, defaultModelFor, TaskProviderRejected } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

/**
 * Choosing what runs an AI task, end to end (issue #119, PRD #115) — the two
 * **checked write doors** and the **resolver**, through the real HTTP client
 * over the full API against a fresh `:memory:` database per test.
 *
 * The kernel's decision matrix is next door in `kernel.test.ts`, as a pure
 * function; nothing is repeated here. What this suite is for is the half a pure
 * function cannot state: that a refusal **wrote nothing** — re-read, and assert
 * the prior value survived — and that the door is actually in the request path
 * rather than beside it.
 */

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(ClaudeCodeStub),
  Layer.provide(OutboundStub),
  // Merged, not provided: two of these tests plant a row the doors would never
  // let through, which is the only way to reach the resolver's failure side —
  // the same in-memory database the server is reading, by layer memoisation.
  Layer.provideMerge(DatabaseTest),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

const KEY = "a".repeat(64);

/** A plausible vendor credential. */
const secretFor = (provider: string) => `sk-${provider}-api03-Kj28fnQ2xLmPqR7v-3f9`;

/** The encryption key is read by the *server's* fiber, so it goes in the env. */
const useKey = (key: string) => {
  process.env.TOKEN_ENCRYPTION_KEY = key;
};

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("reading what runs each task", () => {
  it.effect("answers for every task, defaulting to the local CLI", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const settings = yield* client.aiTasks.list();

      assert.deepStrictEqual(
        settings.map((_) => [_.task, _.provider, _.model]),
        [["extract-pdf", "claude-code", defaultModelFor("claude-code")]],
      );
    }).pipe(Effect.provide(HttpLive));
  });
});

describe("saving a task's provider and model", () => {
  it.effect("round-trips a full choice", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });

      const saved = yield* client.aiTasks.patch({
        payload: {
          tasks: [
            {
              task: "extract-pdf",
              provider: "anthropic",
              model: "claude-opus-5",
            },
          ],
        },
      });
      assert.deepStrictEqual(
        saved.map((_) => [_.provider, _.model]),
        [["anthropic", "claude-opus-5"]],
      );

      // And it is what a fresh read answers, not just what the write echoed.
      const read = yield* client.aiTasks.list();
      assert.deepStrictEqual(
        read.map((_) => [_.provider, _.model]),
        [["anthropic", "claude-opus-5"]],
      );
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("lands on the new provider's default when no model is named", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "google" },
        payload: { value: secretFor("google") },
      });

      const saved = yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "google" }] },
      });

      assert.deepStrictEqual(
        saved.map((_) => [_.provider, _.model]),
        [["google", defaultModelFor("google")]],
      );
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("accepts claude-code with no token stored", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "openai" },
        payload: { value: secretFor("openai") },
      });
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "openai" }] },
      });

      // Nothing is stored for claude-code, and switching back to it is exactly
      // the save that must not be refused for the lack.
      const saved = yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "claude-code" }] },
      });

      assert.strictEqual(saved[0]?.provider, "claude-code");
      const secrets = yield* client.secrets.status({
        path: { name: "claude-code" },
      });
      assert.isFalse(secrets.configured);
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("checks a model-only edit against the stored provider", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "google" },
        payload: { value: secretFor("google") },
      });
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "google" }] },
      });

      // Served by google — accepted, and the provider is untouched.
      const saved = yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", model: "gemini-2.5-pro" }] },
      });
      assert.deepStrictEqual(
        saved.map((_) => [_.provider, _.model]),
        [["google", "gemini-2.5-pro"]],
      );

      // A model somebody serves, but not the vendor this task is on — the same
      // impossible pairing, reached through the front door.
      const error = yield* client.aiTasks
        .patch({
          payload: { tasks: [{ task: "extract-pdf", model: "gpt-5" }] },
        })
        .pipe(Effect.flip);
      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "model-not-served");
      assert.strictEqual(error.provider, "google");

      // And the prior value survived.
      const read = yield* client.aiTasks.list();
      assert.strictEqual(read[0]?.model, "gemini-2.5-pro");
    }).pipe(Effect.provide(HttpLive));
  });
});

describe("refusing a save that could not run", () => {
  it.effect("refuses a vendor with no credential, and writes nothing", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
      });

      const error = yield* client.aiTasks
        .patch({
          payload: { tasks: [{ task: "extract-pdf", provider: "openai" }] },
        })
        .pipe(Effect.flip);

      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "no-credential");
      assert.strictEqual(error.provider, "openai");
      assert.strictEqual(error.task, "extract-pdf");

      // The whole point of checking at save time: the task is still pointing
      // where it was, not half-moved to a vendor that cannot run it.
      const read = yield* client.aiTasks.list();
      assert.deepStrictEqual(
        read.map((_) => [_.provider, _.model]),
        [["anthropic", defaultModelFor("anthropic")]],
      );
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("refuses a model the selected vendor does not serve", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });

      const error = yield* client.aiTasks
        .patch({
          payload: {
            tasks: [{ task: "extract-pdf", provider: "anthropic", model: "gpt-5" }],
          },
        })
        .pipe(Effect.flip);

      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "model-not-served");
      const read = yield* client.aiTasks.list();
      assert.strictEqual(read[0]?.provider, "claude-code");
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("refuses the whole patch when one entry is bad", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });

      // The first entry is perfectly good and would have been written on its
      // own; the second names a vendor with no credential.
      const error = yield* client.aiTasks
        .patch({
          payload: {
            tasks: [
              { task: "extract-pdf", provider: "anthropic" },
              { task: "extract-pdf", provider: "openai" },
            ],
          },
        })
        .pipe(Effect.flip);

      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "no-credential");
      const read = yield* client.aiTasks.list();
      assert.strictEqual(read[0]?.provider, "claude-code");
    }).pipe(Effect.provide(HttpLive));
  });

  /**
   * The one invariant that spans the kernel and the door rather than sitting in
   * either: **what is stored is what was checked**. Every entry is checked
   * against the *stored* state, and `writeAll` replaces per task in order — so
   * for a task named twice, the entry that survives is the last one, and it is
   * one the kernel passed. Folding the changes on the way to the write without
   * folding them on the way to the check would store a pairing nothing ever
   * looked at, which is the whole feature failing quietly.
   */
  it.effect("stores the last entry when one task is named twice", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      for (const provider of ["anthropic", "openai"] as const) {
        yield* client.secrets.put({
          path: { name: provider },
          payload: { value: secretFor(provider) },
        });
      }

      // Both entries are individually runnable, so nothing is refused.
      const saved = yield* client.aiTasks.patch({
        payload: {
          tasks: [
            { task: "extract-pdf", provider: "anthropic" },
            { task: "extract-pdf", provider: "openai" },
          ],
        },
      });

      assert.deepStrictEqual(
        saved.map((_) => [_.provider, _.model]),
        [["openai", defaultModelFor("openai")]],
      );
      // And it resolves — the stored pairing is one the kernel accepted, not a
      // fold of two of them that no check ever saw.
      const resolved = yield* client.aiTasks.resolve({
        path: { task: "extract-pdf" },
      });
      assert.strictEqual(resolved.provider, "openai");
      assert.strictEqual(resolved.model, defaultModelFor("openai"));
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("answers 422, and names no credential of any kind", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      yield* http.put("/api/secrets/anthropic", {
        body: HttpBody.unsafeJson({ value: secretFor("anthropic") }),
      });

      const response = yield* http.patch("/api/ai/tasks", {
        body: HttpBody.unsafeJson({
          tasks: [{ task: "extract-pdf", provider: "openai" }],
        }),
      });
      const body = yield* response.text;

      // A refusal of a well-formed request whose value this server will not
      // store — the same 422 a refused paste gets, and the same rule about
      // what may be in its body: a reason, a task, a vendor, no secret.
      assert.strictEqual(response.status, 422);
      assert.include(body, '"reason":"no-credential"');
      assert.notInclude(body, secretFor("anthropic"));
    }).pipe(Effect.provide(HttpLive));
  });
});

describe("deleting a credential a task is using", () => {
  it.effect("refuses it, and the credential is still there", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
      });

      const error = yield* client.secrets.clear({ path: { name: "anthropic" } }).pipe(Effect.flip);

      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "credential-in-use");
      assert.strictEqual(error.provider, "anthropic");
      assert.strictEqual(error.task, "extract-pdf");

      // A refused delete deletes nothing — the task still runs.
      const status = yield* client.secrets.status({
        path: { name: "anthropic" },
      });
      assert.isTrue(status.configured);
      const resolved = yield* client.aiTasks.resolve({
        path: { task: "extract-pdf" },
      });
      assert.strictEqual(resolved.provider, "anthropic");
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("clears one no task is using", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      for (const provider of ["anthropic", "openai"] as const) {
        yield* client.secrets.put({
          path: { name: provider },
          payload: { value: secretFor(provider) },
        });
      }
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
      });

      const cleared = yield* client.secrets.clear({
        path: { name: "openai" },
      });

      assert.isFalse(cleared.configured);
      // The one in use is untouched by clearing the one that is not.
      const anthropic = yield* client.secrets.status({
        path: { name: "anthropic" },
      });
      assert.isTrue(anthropic.configured);
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("still clears the claude-code token a task is running on", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "claude-code" },
        payload: { value: secretFor("claude-code") },
      });

      // extract-pdf is on claude-code (the default), and a save onto it with
      // no token is accepted — so the deletion door cannot refuse to produce
      // the state the patch door would accept. The two doors agree.
      const cleared = yield* client.secrets.clear({
        path: { name: "claude-code" },
      });

      assert.isFalse(cleared.configured);
    }).pipe(Effect.provide(HttpLive));
  });
});

describe("resolving what a task runs on", () => {
  it.effect("answers the provider and model, and nothing else", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const http = yield* HttpClient.HttpClient;
      yield* client.secrets.put({
        path: { name: "openai" },
        payload: { value: secretFor("openai") },
      });
      yield* client.aiTasks.patch({
        payload: {
          tasks: [{ task: "extract-pdf", provider: "openai", model: "gpt-5" }],
        },
      });

      const resolved = yield* client.aiTasks.resolve({
        path: { task: "extract-pdf" },
      });
      assert.deepStrictEqual(
        { ...resolved },
        { task: "extract-pdf", provider: "openai", model: "gpt-5" },
      );

      // On the wire too: resolution answers *whether and where*, so there is
      // no field on it for a key to travel in — and the stored key is not in
      // the bytes under any name.
      const response = yield* http.get("/api/ai/tasks/extract-pdf/resolution");
      const body = yield* response.text;
      assert.deepStrictEqual(Object.keys(JSON.parse(body) as object).sort(), [
        "model",
        "provider",
        "task",
      ]);
      assert.notInclude(body, secretFor("openai"));
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("resolves a fresh install to the local CLI", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const resolved = yield* client.aiTasks.resolve({
        path: { task: "extract-pdf" },
      });

      assert.strictEqual(resolved.provider, "claude-code");
      assert.strictEqual(resolved.model, defaultModelFor("claude-code"));
    }).pipe(Effect.provide(HttpLive));
  });

  /**
   * The two doors mean this state is unreachable through the API — which is the
   * whole point of them, and also why these two plant the row directly. They are
   * the runner's side of the feature: what it is told when a stored choice went
   * bad behind the doors' back (a hand-edited database, a model dropped from the
   * catalogue under a stored row).
   */
  it.effect("says a stored model its vendor does not serve cannot run", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: secretFor("anthropic") },
      });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT OR REPLACE INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', 'anthropic', 'claude-2', '2026-08-16T00:00:00.000Z')`;

      const error = yield* client.aiTasks
        .resolve({ path: { task: "extract-pdf" } })
        .pipe(Effect.flip);

      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "model-not-served");
      assert.strictEqual(error.provider, "anthropic");
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("says a task whose credential is gone cannot run", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT OR REPLACE INTO ai_task_settings (task, provider, model, updatedAt) VALUES ('extract-pdf', 'openai', 'gpt-5', '2026-08-16T00:00:00.000Z')`;

      const error = yield* client.aiTasks
        .resolve({ path: { task: "extract-pdf" } })
        .pipe(Effect.flip);

      // The exact state the deletion door exists to prevent, and the answer
      // the runner gets if it is ever reached anyway: not a vendor call that
      // fails, a refusal that names the missing credential's owner.
      assert.ok(error instanceof TaskProviderRejected);
      assert.strictEqual(error.reason, "no-credential");
      assert.strictEqual(error.provider, "openai");
    }).pipe(Effect.provide(HttpLive));
  });

  it.effect("refuses an unknown task id rather than inventing an answer", () => {
    useKey(KEY);
    return Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const response = yield* http.get("/api/ai/tasks/categorise/resolution");

      assert.strictEqual(response.status, 400);
    }).pipe(Effect.provide(HttpLive));
  });
});
