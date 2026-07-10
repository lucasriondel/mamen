import { assert, describe, it } from "@effect/vitest";
import {
	CategoryId,
	type IssuerCreate,
	IssuerId,
	NotFound,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { IssuerRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `IssuerRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = IssuerRepo.Default.pipe(Layer.provide(DatabaseTest));

const asId = Schema.decodeSync(IssuerId);

/** A fixed instant for `firstSeen` — deterministic across the suite. */
const FIRST_SEEN = new Date("2026-01-15T00:00:00.000Z");

/** A valid create payload; override any field per test. */
const make = (over: Partial<IssuerCreate> = {}): IssuerCreate => ({
	name: "Acme",
	firstSeen: FIRST_SEEN,
	...over,
});

describe("IssuerRepo", () => {
	it.effect(
		"create assigns an id + createdAt, keeps firstSeen, then getById returns it",
		() =>
			Effect.gen(function* () {
				const repo = yield* IssuerRepo;
				const created = yield* repo.create(make({ name: "Coffee Co" }));
				assert.strictEqual(created.name, "Coffee Co");
				assert.ok(created.id > 0);
				assert.ok(created.createdAt instanceof Date);
				assert.strictEqual(
					created.firstSeen.getTime(),
					FIRST_SEEN.getTime(),
				);
				// Optional columns absent (not null) when unset.
				assert.strictEqual(created.imageUrl, undefined);
				assert.strictEqual(created.defaultCategoryId, undefined);

				const fetched = yield* repo.getById(created.id);
				assert.deepStrictEqual(fetched, created);
			}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("create keeps optional imageUrl + defaultCategoryId", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const created = yield* repo.create(
				make({
					imageUrl: "/uploads/issuers/x.png",
					defaultCategoryId: Schema.decodeSync(CategoryId)(7),
				}),
			);
			assert.strictEqual(created.imageUrl, "/uploads/issuers/x.png");
			assert.strictEqual(created.defaultCategoryId, 7);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns items and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "a" }));
			yield* repo.create(make({ name: "b" }));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "a" }));
			yield* repo.create(make({ name: "b" }));
			yield* repo.create(make({ name: "c" }));

			const page = yield* repo.list({ limit: 1, offset: 1 });
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list orders by name (case-insensitive) when asked", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "banana" }));
			yield* repo.create(make({ name: "Apple" }));
			yield* repo.create(make({ name: "cherry" }));

			const page = yield* repo.list({ limit: 50, offset: 0, orderBy: "name" });
			assert.deepStrictEqual(
				page.items.map((m) => m.name),
				["Apple", "banana", "cherry"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list without orderBy keeps insertion order", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "zeta" }));
			yield* repo.create(make({ name: "alpha" }));

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.deepStrictEqual(
				page.items.map((m) => m.name),
				["zeta", "alpha"],
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByName matches exactly (case-sensitive)", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "Netflix" }));
			const found = yield* repo.getByName("Netflix");
			assert.strictEqual(found.name, "Netflix");

			// A different case is NOT an exact match.
			const error = yield* repo.getByName("netflix").pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: "netflix" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByNameCi matches case-insensitively", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			yield* repo.create(make({ name: "Netflix" }));
			const found = yield* repo.getByNameCi("NETFLIX");
			assert.strictEqual(found.name, "Netflix");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges the partial and preserves createdAt", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const created = yield* repo.create(make({ name: "Old" }));
			const updated = yield* repo.update(created.id, { name: "New" });
			assert.strictEqual(updated.name, "New");
			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(
				updated.createdAt.getTime(),
				created.createdAt.getTime(),
			);
			assert.strictEqual(
				updated.firstSeen.getTime(),
				created.firstSeen.getTime(),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("setImage sets imageUrl, then getById reflects it", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const created = yield* repo.create(make());
			const updated = yield* repo.setImage(
				created.id,
				"/uploads/issuers/logo.png",
			);
			assert.strictEqual(updated.imageUrl, "/uploads/issuers/logo.png");

			const fetched = yield* repo.getById(created.id);
			assert.strictEqual(fetched.imageUrl, "/uploads/issuers/logo.png");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("clearImage removes imageUrl (back to absent)", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const created = yield* repo.create(make());
			yield* repo.setImage(created.id, "/uploads/issuers/logo.png");
			const cleared = yield* repo.clearImage(created.id);
			assert.strictEqual(cleared.imageUrl, undefined);

			const fetched = yield* repo.getById(created.id);
			assert.strictEqual(fetched.imageUrl, undefined);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove deletes the row", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const created = yield* repo.create(make());
			yield* repo.remove(created.id);
			const error = yield* repo.getById(created.id).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: created.id }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getById fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const error = yield* repo.getById(asId(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByNameCi fails NotFound on a missing name", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const error = yield* repo.getByNameCi("nope").pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: "nope" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const error = yield* repo
				.update(asId(404), { name: "X" })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* IssuerRepo;
			const error = yield* repo.remove(asId(404)).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "issuer", id: asId(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);
});
