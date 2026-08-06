import { assert, describe, it } from "@effect/vitest";
import { AccountId, NotFound } from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { AccountRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `AccountRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = AccountRepo.Default.pipe(Layer.provide(DatabaseTest));

const asId = Schema.decodeSync(AccountId);

describe("AccountRepo", () => {
	it.effect(
		"create assigns an id and timestamps, then findById returns it",
		() =>
			Effect.gen(function* () {
				const repo = yield* AccountRepo;
				const created = yield* repo.create({ name: "Main", type: "checking" });
				assert.strictEqual(created.name, "Main");
				assert.ok(created.id > 0);
				assert.strictEqual(
					created.createdAt.getTime(),
					created.updatedAt.getTime(),
				);

				const fetched = yield* repo.getById(created.id);
				assert.deepStrictEqual(fetched, created);
			}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns items and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			yield* repo.create({ name: "A", type: "checking" });
			yield* repo.create({ name: "B", type: "savings" });

			const page = yield* repo.list(50, 0);
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			yield* repo.create({ name: "A", type: "checking" });
			yield* repo.create({ name: "B", type: "savings" });
			yield* repo.create({ name: "C", type: "other" });

			const page = yield* repo.list(1, 1);
			assert.strictEqual(page.total, 3);
			assert.deepStrictEqual(
				page.items.map((a) => a.name),
				["B"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByName returns the matching account", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			yield* repo.create({ name: "Wallet", type: "other" });
			const found = yield* repo.getByName("Wallet");
			assert.strictEqual(found.name, "Wallet");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges the partial and preserves createdAt", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			const created = yield* repo.create({ name: "Old", type: "checking" });
			const updated = yield* repo.update(created.id, { type: "savings" });
			assert.strictEqual(updated.name, "Old");
			assert.strictEqual(updated.type, "savings");
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	// The delete is not on this repository: it cascades into the Matching Rules
	// scoped to the account and re-derives the rows they won, so it lives on the
	// `IssuerMatcher` (issue #90). Both halves — the row going, and the 404 on a
	// missing id — are covered end-to-end in `accounts/handlers.test.ts`.

	it.effect("getById fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* AccountRepo;
			const error = yield* repo
				.update(asId(404), { name: "X" })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "account", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);
});
