import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { AccountId, Api, NotFound } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test (below) so each test gets an
// isolated, migrated database.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asId = Schema.decodeSync(AccountId);

describe("accounts endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.accounts.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.accounts.create({
				payload: { name: "Checking", type: "checking" },
			});
			assert.strictEqual(created.name, "Checking");
			assert.strictEqual(created.type, "checking");

			const fetched = yield* client.accounts.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.accounts.create({
				payload: { name: "A", type: "checking" },
			});
			yield* client.accounts.create({
				payload: { name: "B", type: "savings" },
			});
			yield* client.accounts.create({
				payload: { name: "C", type: "other" },
			});

			const page = yield* client.accounts.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
			assert.deepStrictEqual(
				page.items.map((a) => a.name),
				["A", "B"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByName finds by exact name", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.accounts.create({
				payload: { name: "Savings", type: "savings" },
			});
			const found = yield* client.accounts.getByName({
				path: { name: "Savings" },
			});
			assert.strictEqual(found.name, "Savings");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByName decodes URL-encoded names", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.accounts.create({
				payload: { name: "Joint & Co", type: "other" },
			});
			const found = yield* client.accounts.getByName({
				path: { name: "Joint & Co" },
			});
			assert.strictEqual(found.name, "Joint & Co");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change and bumps updatedAt", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.accounts.create({
				payload: { name: "Old", type: "checking" },
			});
			const updated = yield* client.accounts.update({
				path: { id: created.id },
				payload: { name: "New" },
			});
			assert.strictEqual(updated.name, "New");
			assert.strictEqual(updated.type, "checking");
			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove deletes the account (then getById 404s)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.accounts.create({
				payload: { name: "Temp", type: "other" },
			});
			yield* client.accounts.remove({ path: { id: created.id } });

			const error = yield* client.accounts
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: created.id }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getById 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.accounts
				.getById({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByName 404s on a missing name", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.accounts
				.getByName({ path: { name: "Nope" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: "Nope" }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id (behavior change)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.accounts
				.update({ path: { id: asId(999) }, payload: { name: "X" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove 404s on a missing id (behavior change)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.accounts
				.remove({ path: { id: asId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: asId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});
