import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	Api,
	IssuerId,
	NotFound,
	type RuleCreate,
	RuleId,
	type TransactionCreate,
	TransactionId,
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
const asRule = Schema.decodeSync(RuleId);
const asAccount = Schema.decodeSync(AccountId);
const asTxId = Schema.decodeSync(TransactionId);

/** A valid create payload; override any field per test. */
const make = (over: Partial<RuleCreate> = {}): RuleCreate => ({
	issuerId: asIssuer(1),
	pattern: "ACME",
	matchCount: 0,
	...over,
});

const DATE = new Date("2026-03-01T00:00:00.000Z");

/** A valid transaction-create payload; override any field per test. */
const tx = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
	accountId: asAccount(1),
	date: DATE,
	amount: 10,
	rawIssuerString: "RAW",
	importedAt: DATE,
	importMonth: "2026-03",
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
				payload: make({ pattern: "AMAZON", issuerId: asIssuer(3) }),
			});
			assert.strictEqual(created.pattern, "AMAZON");
			assert.strictEqual(created.issuerId, asIssuer(3));
			assert.strictEqual(created.matchCount, 0);

			const fetched = yield* client.rules.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
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
			assert.deepStrictEqual(page.items.map((r) => r.pattern).sort(), [
				"a",
				"b",
			]);
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

	it.effect(
		"getByIssuerPattern decodes the two-segment path and finds the rule",
		() =>
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

// The matching dry-run (PRD #8 stories 7–11). Drive the whole preview through the
// derived client over a fresh `:memory:` DB: seed rows via `bulkCreate` (which
// itself matches at import), then ask the preview endpoint what a scoped rule
// edit *would* do — asserting the three lists, never `IssuerMatcher` internals.
describe("rule preview (dry-run)", () => {
	const ids = (rows: ReadonlyArray<{ id: unknown }>) => rows.map((r) => r.id);

	it.effect(
		"create: will-match lists the unmatched rows the pattern claims",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// No rules yet ⇒ the row imports unmatched.
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
				});

				const preview = yield* client.rules.preview({
					payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
				});
				assert.strictEqual(preview.skipped, false);
				assert.deepStrictEqual(ids(preview.willMatch), [row?.id]);
				assert.deepStrictEqual(preview.willReassign, []);
				assert.deepStrictEqual(preview.manualCollisions, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	// The headline case (AC): will-reassign uses the **full-set specificity
	// winner** — the prospective rule must beat *every* matching rule for the row,
	// not merely the row's current owner. Three competing rules exercise both
	// directions in one scenario.
	it.effect(
		"create: will-reassign uses the full-set winner across ≥3 competing rules",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Broadest → issuer 1; broad → issuer 2. The row lands on issuer 2
				// (longer literal beats "A").
				yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "A", matchCount: 0 },
				});
				yield* client.rules.create({
					payload: { issuerId: asIssuer(2), pattern: "AMAZON", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(row?.issuerId, asIssuer(2));

				// A longer-literal prospective rule beats BOTH existing rules → it is
				// the full-set winner → the row (owned by a different issuer) reassigns.
				const wins = yield* client.rules.preview({
					payload: { issuerId: asIssuer(3), pattern: "AMAZON EU SARL" },
				});
				assert.deepStrictEqual(ids(wins.willReassign), [row?.id]);
				assert.deepStrictEqual(wins.willMatch, []);

				// A shorter-literal prospective rule matches the row and beats "A", but
				// LOSES to the current owner "AMAZON" → NOT the full-set winner → it must
				// not claim the row (proves "beats every rule", not "beats current owner").
				const loses = yield* client.rules.preview({
					payload: { issuerId: asIssuer(4), pattern: "AM" },
				});
				assert.deepStrictEqual(loses.willReassign, []);
				assert.deepStrictEqual(loses.willMatch, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"manual-collisions lists sticky rows, and they never enter the other lists",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const [row] = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							tx({
								rawIssuerString: "AMAZON EU SARL",
								issuerId: asIssuer(5),
								manualIssuer: true,
							}),
						],
					},
				});
				assert.strictEqual(row?.manualIssuer, true);

				const preview = yield* client.rules.preview({
					payload: { issuerId: asIssuer(9), pattern: "AMAZON" },
				});
				assert.deepStrictEqual(ids(preview.manualCollisions), [row?.id]);
				assert.deepStrictEqual(preview.willMatch, []);
				assert.deepStrictEqual(preview.willReassign, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	// Scoped to the ONE pattern being edited, never the issuer's whole rule set
	// (PRD #8 story 11): a row matched by the issuer's *other* rule is invisible to
	// a preview of a different pattern for that same issuer.
	it.effect(
		"is scoped to the single pattern, not the issuer's whole rule set",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// The issuer already owns a NETFLIX row via an existing rule.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(5), pattern: "NETFLIX", matchCount: 0 },
				});
				yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "NETFLIX.COM" })] },
				});
				// And an unmatched SPOTIFY row the previewed pattern will claim.
				const [spotify] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "PAYPAL *SPOTIFY" })] },
				});

				// Previewing a SPOTIFY rule for the SAME issuer only surfaces the SPOTIFY
				// row — the issuer's NETFLIX row is out of this pattern's scope.
				const preview = yield* client.rules.preview({
					payload: { issuerId: asIssuer(5), pattern: "SPOTIFY" },
				});
				assert.deepStrictEqual(ids(preview.willMatch), [spotify?.id]);
				assert.deepStrictEqual(preview.willReassign, []);
				assert.deepStrictEqual(preview.manualCollisions, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"update: previews the edited pattern against the stored rule set",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const rule = yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "OLD", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "NEWPATTERN CO" })] },
				});

				// Editing this rule's pattern to NEWPATTERN would claim the currently
				// unmatched row (the old pattern no longer competes — same-id swap).
				const preview = yield* client.rules.preview({
					payload: {
						ruleId: rule.id,
						issuerId: asIssuer(1),
						pattern: "NEWPATTERN",
					},
				});
				assert.deepStrictEqual(ids(preview.willMatch), [row?.id]);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update: 404s when the ruleId names a missing rule", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.preview({
					payload: {
						ruleId: asRule(999),
						issuerId: asIssuer(1),
						pattern: "X",
					},
				})
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("an invalid regex is a skipped rule → empty lists, not a 500", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.transactions.bulkCreate({
				payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
			});
			const preview = yield* client.rules.preview({
				payload: { issuerId: asIssuer(1), pattern: "AMAZON[" },
			});
			assert.strictEqual(preview.skipped, true);
			assert.deepStrictEqual(preview.willMatch, []);
			assert.deepStrictEqual(preview.willReassign, []);
			assert.deepStrictEqual(preview.manualCollisions, []);
		}).pipe(Effect.provide(HttpLive)),
	);
});

// Apply-on-save (PRD #8 stories 12, 16, 22): create/update write the rule AND
// recompute every transaction's issuer against the resulting rule set atomically.
// Asserted through the client: the transactions table is invariant-correct after
// each save, and matches what the matching preview promised.
describe("rule apply-on-save", () => {
	it.effect("create retroactively claims a previously unmatched row", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
			});
			assert.strictEqual(row?.issuerId, undefined);

			// Preview promises the claim; save must deliver exactly it.
			const preview = yield* client.rules.preview({
				payload: { issuerId: asIssuer(42), pattern: "AMAZON" },
			});
			assert.deepStrictEqual(
				preview.willMatch.map((r) => r.id),
				[row?.id],
			);

			yield* client.rules.create({
				payload: { issuerId: asIssuer(42), pattern: "AMAZON", matchCount: 0 },
			});

			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, asIssuer(42));
		}).pipe(Effect.provide(HttpLive)),
	);

	// Retroactive specificity (stories 15–16): a later, more-specific rule
	// reassigns a row a broader rule had already claimed.
	it.effect(
		"create reassigns a broad rule's row to a more-specific new rule",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				yield* client.rules.create({
					payload: { issuerId: asIssuer(10), pattern: "AMAZON", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(row?.issuerId, asIssuer(10));

				yield* client.rules.create({
					payload: {
						issuerId: asIssuer(20),
						pattern: "AMAZON EU SARL",
						matchCount: 0,
					},
				});

				const after = yield* client.transactions.getById({
					path: { id: row?.id ?? asTxId(0) },
				});
				assert.strictEqual(after.issuerId, asIssuer(20));
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("a manual row is never reassigned by a rule save", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const [row] = yield* client.transactions.bulkCreate({
				payload: {
					records: [
						tx({
							rawIssuerString: "AMAZON EU SARL",
							issuerId: asIssuer(5),
							manualIssuer: true,
						}),
					],
				},
			});

			yield* client.rules.create({
				payload: { issuerId: asIssuer(10), pattern: "AMAZON", matchCount: 0 },
			});

			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, asIssuer(5));
			assert.strictEqual(after.manualIssuer, true);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update re-derives the table against the edited pattern", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			// Rule initially matches nothing; the row imports unmatched.
			const rule = yield* client.rules.create({
				payload: { issuerId: asIssuer(7), pattern: "OLD", matchCount: 0 },
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [tx({ rawIssuerString: "NEWPATTERN CO" })] },
			});
			assert.strictEqual(row?.issuerId, undefined);

			// Editing the pattern to match the row applies retroactively on save.
			yield* client.rules.update({
				path: { id: rule.id },
				payload: { pattern: "NEWPATTERN" },
			});

			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, asIssuer(7));
		}).pipe(Effect.provide(HttpLive)),
	);
});

// The per-row "remove manual issuer" action (PRD #8 story 10): clear the manual
// flag and re-derive the row against the current rule set — it becomes unmatched,
// or is immediately claimed by a matching rule.
describe("remove manual issuer", () => {
	it.effect(
		"clears the manual flag and lets an existing rule claim the row",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// A rule exists but the row was assigned by hand to a different issuer.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(10), pattern: "AMAZON", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							tx({
								rawIssuerString: "AMAZON EU SARL",
								issuerId: asIssuer(5),
								manualIssuer: true,
							}),
						],
					},
				});
				assert.strictEqual(row?.issuerId, asIssuer(5));

				const cleared = yield* client.transactions.removeManualIssuer({
					path: { id: row?.id ?? asTxId(0) },
				});
				// Manual dropped; the matching rule now owns the row.
				// Manual flag cleared (the wire may carry `false` or omit it).
				assert.notStrictEqual(cleared.manualIssuer, true);
				assert.strictEqual(cleared.issuerId, asIssuer(10));

				// Persisted, not just returned.
				const after = yield* client.transactions.getById({
					path: { id: row?.id ?? asTxId(0) },
				});
				assert.strictEqual(after.issuerId, asIssuer(10));
				assert.strictEqual(after.manualIssuer, undefined);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("makes the row unmatched when no rule matches", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const [row] = yield* client.transactions.bulkCreate({
				payload: {
					records: [
						tx({
							rawIssuerString: "SQ *BLUE BOTTLE",
							issuerId: asIssuer(5),
							manualIssuer: true,
						}),
					],
				},
			});

			const cleared = yield* client.transactions.removeManualIssuer({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(cleared.issuerId, undefined);
			assert.notStrictEqual(cleared.manualIssuer, true);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("404s on a missing transaction id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.removeManualIssuer({ path: { id: asTxId(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: asTxId(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});

// Delete preview + next-best fall-back re-eval (PRD #8 stories 17–18, issue #12).
// Deleting a rule previews the rows it re-homes and, on commit, re-derives them
// against the REMAINING rules — driven end-to-end through the client.
describe("rule delete preview + re-eval", () => {
	const ids = (rows: ReadonlyArray<{ id: unknown }>) => rows.map((r) => r.id);

	it.effect(
		"preview: rows owned by the rule fall to the next-best or unmatch",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Broad rule (issuer 1) + a more-specific rule (issuer 2) that wins the
				// AMAZON row. A lone SPOTIFY row is owned only by the specific rule.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
				});
				const specific = yield* client.rules.create({
					payload: {
						issuerId: asIssuer(2),
						pattern: "AMAZON EU SARL",
						matchCount: 0,
					},
				});
				const [amazon, spotify] = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							tx({ rawIssuerString: "AMAZON EU SARL" }),
							tx({ rawIssuerString: "AMAZON EU SARL SPOTIFY" }),
						],
					},
				});
				// Both rows land on the specific rule (issuer 2, longest literal).
				assert.strictEqual(amazon?.issuerId, asIssuer(2));
				assert.strictEqual(spotify?.issuerId, asIssuer(2));

				const preview = yield* client.rules.previewDelete({
					path: { id: specific.id },
				});
				// `amazon` falls back to the broad rule (issuer 1); `spotify` still
				// matches "AMAZON" too, so it also reassigns to issuer 1. Neither
				// unmatches because the broad rule survives.
				assert.deepStrictEqual(ids(preview.willReassign), [
					amazon?.id,
					spotify?.id,
				]);
				assert.deepStrictEqual(preview.willUnmatch, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"preview: deleting the only matching rule lists rows as will-unmatch",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const only = yield* client.rules.create({
					payload: { issuerId: asIssuer(9), pattern: "AMAZON", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(row?.issuerId, asIssuer(9));

				const preview = yield* client.rules.previewDelete({
					path: { id: only.id },
				});
				assert.deepStrictEqual(ids(preview.willUnmatch), [row?.id]);
				assert.deepStrictEqual(preview.willReassign, []);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("preview: a manual row is never in either list", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const rule = yield* client.rules.create({
				payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
			});
			yield* client.transactions.bulkCreate({
				payload: {
					records: [
						tx({
							rawIssuerString: "AMAZON EU SARL",
							issuerId: asIssuer(5),
							manualIssuer: true,
						}),
					],
				},
			});

			const preview = yield* client.rules.previewDelete({
				path: { id: rule.id },
			});
			assert.deepStrictEqual(preview.willReassign, []);
			assert.deepStrictEqual(preview.willUnmatch, []);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("preview: 404s when the ruleId names a missing rule", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.rules
				.previewDelete({ path: { id: asRule(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "rule", id: asRule(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("delete: winning rule's rows move to the next-best rule", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({
				payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
			});
			const specific = yield* client.rules.create({
				payload: {
					issuerId: asIssuer(2),
					pattern: "AMAZON EU SARL",
					matchCount: 0,
				},
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
			});
			assert.strictEqual(row?.issuerId, asIssuer(2));

			yield* client.rules.remove({ path: { id: specific.id } });

			// Falls back to the broad rule that remains.
			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, asIssuer(1));
			assert.notStrictEqual(after.manualIssuer, true);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("delete: rows become unmatched when no rule remains", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const only = yield* client.rules.create({
				payload: { issuerId: asIssuer(9), pattern: "AMAZON", matchCount: 0 },
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [tx({ rawIssuerString: "AMAZON EU SARL" })] },
			});
			assert.strictEqual(row?.issuerId, asIssuer(9));

			yield* client.rules.remove({ path: { id: only.id } });

			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("delete: a manual row keeps its issuer through a delete", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const rule = yield* client.rules.create({
				payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: {
					records: [
						tx({
							rawIssuerString: "AMAZON EU SARL",
							issuerId: asIssuer(5),
							manualIssuer: true,
						}),
					],
				},
			});

			yield* client.rules.remove({ path: { id: rule.id } });

			const after = yield* client.transactions.getById({
				path: { id: row?.id ?? asTxId(0) },
			});
			assert.strictEqual(after.issuerId, asIssuer(5));
			assert.strictEqual(after.manualIssuer, true);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("delete: 404s when the rule is missing", () =>
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

// The optional Value matcher (issue #42, ADR 0004): a rule with a `matchValue`
// forks one issuer-string by amount. Every assertion rides the rules + import API
// seam — never the engine internals.
describe("rule value matcher", () => {
	const ids = (rows: ReadonlyArray<{ id: unknown }>) => rows.map((r) => r.id);

	// The headline AC: a value-rule reassigns only the matching-amount row and
	// leaves the other-amount row on its previous issuer (retroactive recompute).
	it.effect(
		"create with matchValue reassigns only the matching-amount row",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// A broad rule claims every AMAZON row for issuer 1.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
				});
				const [cheap, dear] = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							tx({ rawIssuerString: "AMAZON EU SARL", amount: -6.99 }),
							tx({ rawIssuerString: "AMAZON EU SARL", amount: -20 }),
						],
					},
				});
				assert.strictEqual(cheap?.issuerId, asIssuer(1));
				assert.strictEqual(dear?.issuerId, asIssuer(1));

				// A value-rule for 6.99 → issuer 2. It matches the -6.99 row (magnitude,
				// sign-agnostic) and outranks the broad rule; the -20 row is out of scope.
				yield* client.rules.create({
					payload: {
						issuerId: asIssuer(2),
						pattern: "AMAZON",
						matchValue: 6.99,
						matchCount: 0,
					},
				});

				const afterCheap = yield* client.transactions.getById({
					path: { id: cheap?.id ?? asTxId(0) },
				});
				const afterDear = yield* client.transactions.getById({
					path: { id: dear?.id ?? asTxId(0) },
				});
				assert.strictEqual(afterCheap.issuerId, asIssuer(2));
				assert.strictEqual(afterDear.issuerId, asIssuer(1));
			}).pipe(Effect.provide(HttpLive)),
	);

	// Specificity tier: a value-rule outranks a regex-only rule of equal literal
	// length regardless of createdAt — the value rule is created FIRST (older), so
	// only the value-tier (not createdAt luck) can explain its win.
	it.effect(
		"value-rule outranks an equal-length regex-only rule regardless of createdAt",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Older value-rule → issuer 2; newer regex-only rule of the SAME pattern
				// (equal literal length) → issuer 1. Newest-wins would give issuer 1.
				yield* client.rules.create({
					payload: {
						issuerId: asIssuer(2),
						pattern: "AMAZON",
						matchValue: 6.99,
						matchCount: 0,
					},
				});
				yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "AMAZON", matchCount: 0 },
				});

				const [row] = yield* client.transactions.bulkCreate({
					payload: {
						records: [tx({ rawIssuerString: "AMAZON EU SARL", amount: -6.99 })],
					},
				});
				// The value-rule wins despite being older → the value-tier decided it.
				assert.strictEqual(row?.issuerId, asIssuer(2));
			}).pipe(Effect.provide(HttpLive)),
	);

	// A freshly-imported matching-amount row is claimed by the value-rule at import
	// (the import matching path, not a later recompute).
	it.effect("import matches a fresh 6.99 row to the value-rule's issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({
				payload: {
					issuerId: asIssuer(7),
					pattern: "AMAZON",
					matchValue: 6.99,
					matchCount: 0,
				},
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: {
					records: [tx({ rawIssuerString: "AMAZON EU SARL", amount: 6.99 })],
				},
			});
			assert.strictEqual(row?.issuerId, asIssuer(7));
		}).pipe(Effect.provide(HttpLive)),
	);

	// Preview narrows the buckets by amount: the matching-amount row is in
	// willMatch, the other-amount row is out of scope entirely.
	it.effect("preview with matchValue narrows the buckets to the amount", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const [cheap] = yield* client.transactions.bulkCreate({
				payload: {
					records: [tx({ rawIssuerString: "AMAZON EU SARL", amount: -6.99 })],
				},
			});
			yield* client.transactions.bulkCreate({
				payload: {
					records: [tx({ rawIssuerString: "AMAZON EU SARL", amount: -20 })],
				},
			});

			const preview = yield* client.rules.preview({
				payload: { issuerId: asIssuer(3), pattern: "AMAZON", matchValue: 6.99 },
			});
			assert.strictEqual(preview.skipped, false);
			assert.deepStrictEqual(ids(preview.willMatch), [cheap?.id]);
			assert.deepStrictEqual(preview.willReassign, []);
			assert.deepStrictEqual(preview.manualCollisions, []);
		}).pipe(Effect.provide(HttpLive)),
	);

	// A value-rule and getById round-trip carries the matchValue back on the wire.
	it.effect("create echoes matchValue and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: {
					issuerId: asIssuer(1),
					pattern: "AMAZON",
					matchValue: 6.99,
					matchCount: 0,
				},
			});
			assert.strictEqual(created.matchValue, 6.99);
			const fetched = yield* client.rules.getById({ path: { id: created.id } });
			assert.strictEqual(fetched.matchValue, 6.99);
		}).pipe(Effect.provide(HttpLive)),
	);

	// An explicit `null` in the update payload clears a set Value matcher back to a
	// regex-only rule (issue #43) — the wire sentinel `undefined` can't express.
	it.effect("update clears matchValue when sent an explicit null", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: {
					issuerId: asIssuer(1),
					pattern: "AMAZON",
					matchValue: 6.99,
					matchCount: 0,
				},
			});
			assert.strictEqual(created.matchValue, 6.99);

			const cleared = yield* client.rules.update({
				path: { id: created.id },
				payload: { matchValue: null },
			});
			assert.strictEqual(cleared.matchValue, undefined);

			const fetched = yield* client.rules.getById({ path: { id: created.id } });
			assert.strictEqual(fetched.matchValue, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	// Absent `matchValue` in an update leaves a set Value matcher untouched.
	it.effect("update leaves matchValue untouched when the key is absent", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.rules.create({
				payload: {
					issuerId: asIssuer(1),
					pattern: "AMAZON",
					matchValue: 6.99,
					matchCount: 0,
				},
			});
			const updated = yield* client.rules.update({
				path: { id: created.id },
				payload: { pattern: "AMZN" },
			});
			assert.strictEqual(updated.pattern, "AMZN");
			assert.strictEqual(updated.matchValue, 6.99);
		}).pipe(Effect.provide(HttpLive)),
	);
});
