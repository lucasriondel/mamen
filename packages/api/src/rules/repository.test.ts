import { assert, describe, it } from "@effect/vitest";
import {
	CategoryId,
	IssuerId,
	NotFound,
	Rule,
	type RuleCreate,
	RuleId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { RuleFromRow, RuleRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `RuleRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = RuleRepo.Default.pipe(Layer.provide(DatabaseTest));

const asIssuer = Schema.decodeSync(IssuerId);
const asCategory = Schema.decodeSync(CategoryId);
const asRule = Schema.decodeSync(RuleId);

const DATE = new Date("2026-03-01T00:00:00.000Z");

/** A valid create payload; override any field per test. */
const make = (over: Partial<RuleCreate> = {}): RuleCreate => ({
	issuerId: asIssuer(1),
	pattern: "ACME",
	matchCount: 0,
	...over,
});

describe("RuleFromRow storage codec", () => {
	// The row codec's `encode` is the storage inverse of the read path. Verify
	// decode∘encode = id for both a populated entity and a bare one — this pins
	// the `categoryOverride` null↔absent fold in both directions and keeps the
	// inverse from silently drifting.
	const encode = Schema.encodeSync(RuleFromRow);
	const decode = Schema.decodeSync(RuleFromRow);

	it("round-trips a rule with categoryOverride set", () => {
		const full = new Rule({
			id: asRule(1),
			issuerId: asIssuer(2),
			pattern: "STARBUCKS",
			categoryOverride: asCategory(7),
			matchCount: 3,
			createdAt: DATE,
		});
		const row = encode(full);
		assert.strictEqual(row.categoryOverride, 7);
		assert.strictEqual(row.issuerId, 2);
		assert.deepStrictEqual(decode(row), full);
	});

	it("round-trips a bare rule (categoryOverride absent → null column)", () => {
		const bare = new Rule({
			id: asRule(1),
			issuerId: asIssuer(2),
			pattern: "X",
			matchCount: 0,
			createdAt: DATE,
		});
		const row = encode(bare);
		assert.strictEqual(row.categoryOverride, null);
		assert.deepStrictEqual(decode(row), bare);
	});
});

describe("RuleRepo", () => {
	it.effect("create assigns an id and createdAt, then getById returns it", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(make({ pattern: "AMAZON" }));
			assert.strictEqual(created.pattern, "AMAZON");
			assert.strictEqual(created.issuerId, asIssuer(1));
			assert.ok(created.id > 0);
			assert.ok(created.createdAt instanceof Date);

			const fetched = yield* repo.getById(created.id);
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("categoryOverride absent on create stays absent (null → undefined)", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(make());
			assert.strictEqual(created.categoryOverride, undefined);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("create keeps a set categoryOverride (a category id)", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(
				make({ categoryOverride: asCategory(9) }),
			);
			assert.strictEqual(created.categoryOverride, asCategory(9));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns items and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ pattern: "a" }));
			yield* repo.create(make({ pattern: "b" }));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ pattern: "a" }));
			yield* repo.create(make({ pattern: "b" }));
			yield* repo.create(make({ pattern: "c" }));

			const page = yield* repo.list({ limit: 1, offset: 1 });
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list filters by issuerId (and total reflects the filter)", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ issuerId: asIssuer(1), pattern: "a" }));
			yield* repo.create(make({ issuerId: asIssuer(1), pattern: "b" }));
			yield* repo.create(make({ issuerId: asIssuer(2), pattern: "c" }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				issuerId: asIssuer(1),
			});
			assert.strictEqual(page.total, 2);
			assert.deepStrictEqual(
				page.items.map((r) => r.pattern).sort(),
				["a", "b"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("count returns the total, and the issuer-scoped count", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ issuerId: asIssuer(1) }));
			yield* repo.create(make({ issuerId: asIssuer(1) }));
			yield* repo.create(make({ issuerId: asIssuer(2) }));

			const total = yield* repo.count(undefined);
			assert.strictEqual(total.count, 3);

			const scoped = yield* repo.count(asIssuer(1));
			assert.strictEqual(scoped.count, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByIssuerPattern returns the matching rule", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ issuerId: asIssuer(5), pattern: "NETFLIX" }));
			const found = yield* repo.getByIssuerPattern(
				asIssuer(5),
				"NETFLIX",
			);
			assert.strictEqual(found.pattern, "NETFLIX");
			assert.strictEqual(found.issuerId, asIssuer(5));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByIssuerPattern is scoped by issuer (same pattern, other issuer)", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			yield* repo.create(make({ issuerId: asIssuer(1), pattern: "SHARED" }));
			const error = yield* repo
				.getByIssuerPattern(asIssuer(2), "SHARED")
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: "SHARED" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges the partial and preserves createdAt", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(make({ pattern: "old", matchCount: 1 }));
			const updated = yield* repo.update(created.id, {
				pattern: "new",
				matchCount: 5,
			});
			assert.strictEqual(updated.pattern, "new");
			assert.strictEqual(updated.matchCount, 5);
			assert.strictEqual(updated.issuerId, created.issuerId);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update can set categoryOverride from absent", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(make());
			assert.strictEqual(created.categoryOverride, undefined);
			const updated = yield* repo.update(created.id, {
				categoryOverride: asCategory(4),
			});
			assert.strictEqual(updated.categoryOverride, asCategory(4));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove deletes the row", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const created = yield* repo.create(make({ pattern: "temp" }));
			yield* repo.remove(created.id);
			const error = yield* repo.getById(created.id).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: created.id }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getById fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const error = yield* repo.getById(asRule(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByIssuerPattern fails NotFound on a missing pattern", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const error = yield* repo
				.getByIssuerPattern(asIssuer(1), "nope")
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: "nope" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const error = yield* repo
				.update(asRule(404), { pattern: "X" })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* RuleRepo;
			const error = yield* repo.remove(asRule(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);
});
