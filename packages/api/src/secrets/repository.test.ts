import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Logger, Option, Redacted } from "effect";
import { DatabaseTest } from "../db/test";
import { readSecret, SecretsRepo } from "./repository";

/**
 * The secrets repository — the **one module that decrypts** (issue #117, ADR
 * 0011) — driven directly, which is where the two things the wire cannot see are
 * cheapest to state: what was actually written to the database, and what the
 * inward plaintext reader hands an in-process caller.
 *
 * The wire suite (`handlers.test.ts`) covers the outward status/refusal
 * behaviour over the real HTTP client; nothing is duplicated here.
 */

const KEY = "a".repeat(64);
const OTHER_KEY = `${"b".repeat(63)}c`;

const SECRET = "sk-ant-api03-real-credential-3f9";

/**
 * Config from a map rather than `process.env`: the repository is called on the
 * test's own fiber here, and the rotated-key case is half of what this suite
 * asserts — reading the ambient environment for it would make the most important
 * test depend on the machine it runs on.
 */
const withKey = (key: string) =>
  Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["TOKEN_ENCRYPTION_KEY", key]])));

/**
 * The repository over a fresh `:memory:` database, with the sql client merged
 * into the output so the test can look at what was actually written. Provided
 * per test, like every other DB-backed suite.
 */
const TestLive = SecretsRepo.Default.pipe(Layer.provideMerge(DatabaseTest));

/** Every `ciphertext` currently in the table, as stored. */
const storedBlobs = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) =>
    sql<{
      ciphertext: string;
    }>`SELECT ciphertext FROM encrypted_secrets`,
).pipe(Effect.map((rows) => rows.map((row) => row.ciphertext)));

describe("SecretsRepo storage", () => {
  it.effect("stores the credential as ciphertext, never as itself", () =>
    Effect.gen(function* () {
      const repo = yield* SecretsRepo;
      yield* repo.put("anthropic", SECRET).pipe(withKey(KEY));

      const blobs = yield* storedBlobs;
      assert.strictEqual(blobs.length, 1);
      assert.notInclude(blobs[0], SECRET);
      // Not a prefix, not a suffix, not a fragment: nothing of the value.
      assert.notInclude(blobs[0], SECRET.slice(0, 12));
      assert.notInclude(Buffer.from(blobs[0], "base64").toString("latin1"), SECRET);
    }).pipe(Effect.provide(TestLive)),
  );

  it.effect("trims the paste before storing it", () =>
    Effect.gen(function* () {
      const repo = yield* SecretsRepo;
      // A copy off a vendor dashboard routinely carries a trailing newline;
      // stored as-is it becomes part of the credential and every call 401s.
      yield* repo.put("anthropic", `  ${SECRET}\n`).pipe(withKey(KEY));

      const read = yield* readSecret("anthropic").pipe(withKey(KEY));
      assert.deepStrictEqual(read.pipe(Option.map(Redacted.value)), Option.some(SECRET));
    }).pipe(Effect.provide(TestLive)),
  );
});

describe("the inward plaintext reader", () => {
  it.effect("hands an in-process caller the stored credential", () =>
    Effect.gen(function* () {
      const repo = yield* SecretsRepo;
      yield* repo.put("anthropic", SECRET).pipe(withKey(KEY));

      const read = yield* readSecret("anthropic").pipe(withKey(KEY));
      assert.deepStrictEqual(read.pipe(Option.map(Redacted.value)), Option.some(SECRET));
    }).pipe(Effect.provide(TestLive)),
  );

  it.effect("wraps it in Redacted, so printing it prints nothing", () =>
    Effect.gen(function* () {
      const repo = yield* SecretsRepo;
      yield* repo.put("anthropic", SECRET).pipe(withKey(KEY));

      const read = yield* readSecret("anthropic").pipe(withKey(KEY));
      assert.notInclude(String(read), SECRET);
      assert.notInclude(JSON.stringify(read), SECRET);
    }).pipe(Effect.provide(TestLive)),
  );

  it.effect("has nothing to hand back when nothing is stored", () =>
    Effect.gen(function* () {
      const read = yield* readSecret("anthropic").pipe(withKey(KEY));
      assert.isTrue(Option.isNone(read));
    }).pipe(Effect.provide(TestLive)),
  );

  it.effect("has nothing to hand back under a rotated key", () =>
    Effect.gen(function* () {
      const repo = yield* SecretsRepo;
      yield* repo.put("anthropic", SECRET).pipe(withKey(KEY));

      const read = yield* readSecret("anthropic").pipe(withKey(OTHER_KEY));
      // Unreadable, not "some other value" — the auth tag refuses rather
      // than yielding garbage a caller might spend at a vendor.
      assert.isTrue(Option.isNone(read));
    }).pipe(Effect.provide(TestLive)),
  );
});

describe("no secret reaches a log line", () => {
  it.effect("across store, read, status and clear", () =>
    Effect.gen(function* () {
      const lines: string[] = [];
      const capture = Logger.replace(
        Logger.defaultLogger,
        Logger.make(({ message, annotations, cause }) =>
          lines.push(`${JSON.stringify(message)} ${JSON.stringify(annotations)} ${cause}`),
        ),
      );

      const repo = yield* SecretsRepo;
      yield* Effect.gen(function* () {
        yield* repo.put("anthropic", SECRET);
        yield* repo.status("anthropic");
        yield* readSecret("anthropic");
        yield* repo.clear("anthropic");
      }).pipe(withKey(KEY), Effect.provide(capture));

      for (const line of lines) {
        assert.notInclude(line, SECRET);
      }
    }).pipe(Effect.provide(TestLive)),
  );
});
