import { assert, describe, it } from "@effect/vitest";
import { AppSettings } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { DatabaseTest } from "../db/test";
import { AppSettingsRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `AppSettingsRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = AppSettingsRepo.Default.pipe(Layer.provide(DatabaseTest));

const singleton = new AppSettings({ id: "app" });

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
			const saved = yield* repo.put(singleton);
			assert.deepStrictEqual(saved, singleton);

			const fetched = yield* repo.get();
			assert.deepStrictEqual(fetched, saved);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("put is a whole-object upsert (a second put keeps one row)", () =>
		Effect.gen(function* () {
			const repo = yield* AppSettingsRepo;
			yield* repo.put(singleton);
			const second = yield* repo.put(singleton);
			assert.deepStrictEqual(second, singleton);
			assert.deepStrictEqual(yield* repo.get(), singleton);
		}).pipe(Effect.provide(RepoTest)),
	);
});
