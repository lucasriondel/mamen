import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	Api,
	CategoryId,
	IssuerId,
	NotFound,
	type RuleCreate,
	RuleId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asIssuer = Schema.decodeSync(IssuerId);
const asCategory = Schema.decodeSync(CategoryId);
const asRule = Schema.decodeSync(RuleId);

/** A valid create payload; override any field per test. */
const make = (over: Partial<RuleCreate> = {}): RuleCreate => ({
	issuerId: asIssuer(1),
	pattern: "ACME",
	matchCount: 0,
	...over,
});

describe("rules endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.rules.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: make({ pattern: "AMAZON", categoryOverride: asCategory(3) }),
			});
			assert.strictEqual(created.pattern, "AMAZON");
			assert.strictEqual(created.categoryOverride, asCategory(3));

			const fetched = yield* client.rules.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create without categoryOverride leaves it absent", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({ payload: make() });
			assert.strictEqual(created.categoryOverride, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({ payload: make({ pattern: "a" }) });
			yield* client.rules.create({ payload: make({ pattern: "b" }) });
			yield* client.rules.create({ payload: make({ pattern: "c" }) });

			const page = yield* client.rules.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list filters by issuerId over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({
				payload: make({ issuerId: asIssuer(1), pattern: "a" }),
			});
			yield* client.rules.create({
				payload: make({ issuerId: asIssuer(1), pattern: "b" }),
			});
			yield* client.rules.create({
				payload: make({ issuerId: asIssuer(2), pattern: "c" }),
			});

			const page = yield* client.rules.list({
				urlParams: { limit: 50, offset: 0, issuerId: asIssuer(1) },
			});
			assert.strictEqual(page.total, 2);
			assert.deepStrictEqual(
				page.items.map((r) => r.pattern).sort(),
				["a", "b"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("count returns the total, and the issuer-scoped count", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({ payload: make({ issuerId: asIssuer(1) }) });
			yield* client.rules.create({ payload: make({ issuerId: asIssuer(1) }) });
			yield* client.rules.create({ payload: make({ issuerId: asIssuer(2) }) });

			const total = yield* client.rules.count({ urlParams: {} });
			assert.strictEqual(total.count, 3);

			const scoped = yield* client.rules.count({
				urlParams: { issuerId: asIssuer(1) },
			});
			assert.strictEqual(scoped.count, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByIssuerPattern decodes the two-segment path and finds the rule", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({
				payload: make({ issuerId: asIssuer(5), pattern: "NETFLIX" }),
			});
			const found = yield* client.rules.getByIssuerPattern({
				path: { issuerId: asIssuer(5), pattern: "NETFLIX" },
			});
			assert.strictEqual(found.pattern, "NETFLIX");
			assert.strictEqual(found.issuerId, asIssuer(5));
		}).pipe(Effect.provide(HttpLive)),
	);

	// A pattern with spaces round-trips through the `:pattern` segment via the
	// client's percent-encoding (space → `%20`). A literal `/` is deliberately
	// NOT tested: it would split the path into extra segments and can't survive a
	// single path param — patterns with slashes are out of scope for this route
	// (faithful to the old single-segment param).
	it.effect("getByIssuerPattern handles a pattern with spaces", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const pattern = "ACME STORE 1";
			yield* client.rules.create({
				payload: make({ issuerId: asIssuer(6), pattern }),
			});
			const found = yield* client.rules.getByIssuerPattern({
				path: { issuerId: asIssuer(6), pattern },
			});
			assert.strictEqual(found.pattern, pattern);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change and keeps createdAt", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: make({ pattern: "old", matchCount: 1 }),
			});
			const updated = yield* client.rules.update({
				path: { id: created.id },
				payload: { matchCount: 9 },
			});
			assert.strictEqual(updated.matchCount, 9);
			assert.strictEqual(updated.pattern, "old");
			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove deletes the rule (then getById 404s)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: make({ pattern: "temp" }),
			});
			yield* client.rules.remove({ path: { id: created.id } });

			const error = yield* client.rules
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: created.id }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getById 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.getById({ path: { id: asRule(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByIssuerPattern 404s on a missing pattern", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.getByIssuerPattern({
					path: { issuerId: asIssuer(1), pattern: "nope" },
				})
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: "nope" }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.update({ path: { id: asRule(999) }, payload: { pattern: "X" } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.remove({ path: { id: asRule(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});
