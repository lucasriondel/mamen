import { assert, describe, it } from "@effect/vitest";
import {
	type Setting,
	SettingId,
	type SettingKey,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { SettingRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `SettingRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = SettingRepo.Default.pipe(Layer.provide(DatabaseTest));

const asSetting = Schema.decodeSync(SettingId);

/** A `Setting` payload with a placeholder id (upsert keys off `key`, not id). */
const make = (key: SettingKey, value: string): Setting =>
	({ id: asSetting(1), key, value }) as Setting;

describe("SettingRepo", () => {
	it.effect("putByKey inserts a new key and returns the stored Setting", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			const saved = yield* repo.putByKey(make("currency_symbol", "$"));
			assert.strictEqual(saved.key, "currency_symbol");
			assert.strictEqual(saved.value, "$");
			assert.ok(saved.id > 0);

			const fetched = yield* repo.getByKey("currency_symbol");
			assert.deepStrictEqual(fetched, saved);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("putByKey upserts an existing key, keeping the row's id", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			const first = yield* repo.putByKey(make("anomaly_threshold", "3"));
			const second = yield* repo.putByKey(make("anomaly_threshold", "5"));
			// Same key → same physical row: value updated, id preserved.
			assert.strictEqual(second.id, first.id);
			assert.strictEqual(second.value, "5");

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("putByKey ignores the payload id (upsert keys off key)", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			// A bogus id in the payload must not become the stored id.
			const saved = yield* repo.putByKey({
				id: asSetting(999),
				key: "date_format",
				value: "YYYY-MM-DD",
			});
			// AUTOINCREMENT assigns 1 for the first row, not the payload's 999.
			assert.strictEqual(saved.id, asSetting(1));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("putByKey accepts displayPreferences (the un-dropped key)", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			const saved = yield* repo.putByKey(
				make("displayPreferences", '{"theme":"dark"}'),
			);
			assert.strictEqual(saved.key, "displayPreferences");
			assert.strictEqual(saved.value, '{"theme":"dark"}');
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns all settings and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			yield* repo.putByKey(make("currency_symbol", "€"));
			yield* repo.putByKey(make("date_format", "DD/MM/YYYY"));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			yield* repo.putByKey(make("currency_symbol", "$"));
			yield* repo.putByKey(make("date_format", "x"));
			yield* repo.putByKey(make("anomaly_threshold", "y"));

			const page = yield* repo.list({ limit: 1, offset: 1 });
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByKey fails NotFound on an absent (but valid) key", () =>
		Effect.gen(function* () {
			const repo = yield* SettingRepo;
			const error = yield* repo.getByKey("anomaly_threshold").pipe(Effect.flip);
			assert.strictEqual(error._tag, "NotFound");
			assert.strictEqual(error.resource, "setting");
			assert.strictEqual(error.id, "anomaly_threshold");
		}).pipe(Effect.provide(RepoTest)),
	);
});
