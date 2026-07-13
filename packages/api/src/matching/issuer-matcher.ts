import { SqlClient, SqlSchema } from "@effect/sql";
import type {
	IssuerId,
	RuleCreate,
	RulePreviewInput,
	RulePreviewResult,
	RuleUpdate,
} from "@mamen/shared/contract";
import {
	NotFound,
	Rule,
	RuleId,
	Transaction,
	TransactionId,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";
import { RuleFromRow } from "../rules/repository";
import { TransactionFromRow } from "../transactions/repository";

/**
 * A rule whose regex compiled cleanly, paired with its live `RegExp` (built once
 * per matching pass, `"i"` for case-insensitivity).
 */
type CompiledRule = { rule: Rule; regex: RegExp };

/**
 * The outcome of compiling the current rule set: the ones that compiled, and the
 * ids of the ones whose pattern threw (surfaced to the user as *skipped rules*,
 * never a 500). Order of `compiled` follows the input rule order.
 */
type CompiledSet = {
	compiled: ReadonlyArray<CompiledRule>;
	skippedRuleIds: ReadonlyArray<typeof RuleId.Type>;
};

/**
 * The per-row match verdict from {@link derive}. `issuerId` is the resolved
 * issuer (`null` = unmatched); `matchedRuleId` is the winning rule (`null` when
 * manual or unmatched) — used only to bump `matchCount`, never stored on the row
 * (the engine is stateless: a row records *that* a rule set its issuer via
 * `manualIssuer = false`, not *which*).
 */
export type MatchOutcome = {
	transactionId: typeof Transaction.Type.id;
	issuerId: typeof IssuerId.Type | null;
	matchedRuleId: typeof RuleId.Type | null;
};

/**
 * A {@link MatchOutcome} a rule actually won: both `issuerId` and `matchedRuleId`
 * present. The subset that drives writes — an issuer assignment plus a
 * `matchCount` bump (manual and unmatched outcomes have no rule to book).
 */
type AssignedOutcome = MatchOutcome & {
	issuerId: typeof IssuerId.Type;
	matchedRuleId: typeof RuleId.Type;
};

/** Regex metacharacters stripped when measuring a pattern's literal length. */
const META = /[.*+?^${}()|[\]\\]/g;

/** Specificity = count of literal (non-metachar) characters left in the pattern. */
const literalLength = (pattern: string): number =>
	pattern.replace(META, "").length;

/**
 * Order two matching rules by specificity: the longer literal wins; ties break to
 * the newer rule (`createdAt`). `< 0` means `a` wins, `> 0` means `b` wins. Mirrors
 * the deleted pre-Effect engine's comparator (`compareRuleSpecificity`).
 */
const compareSpecificity = (a: Rule, b: Rule): number => {
	const la = literalLength(a.pattern);
	const lb = literalLength(b.pattern);
	if (la !== lb) return lb - la;
	return b.createdAt.getTime() - a.createdAt.getTime();
};

/**
 * Compile a rule set: `new RegExp(pattern, "i")` per rule, each guarded by
 * try/catch so an invalid pattern becomes a *skipped rule* instead of throwing.
 */
const compile = (rules: ReadonlyArray<Rule>): CompiledSet => {
	const compiled: Array<CompiledRule> = [];
	const skippedRuleIds: Array<typeof RuleId.Type> = [];
	for (const rule of rules) {
		try {
			compiled.push({ rule, regex: new RegExp(rule.pattern, "i") });
		} catch {
			skippedRuleIds.push(rule.id);
		}
	}
	return { compiled, skippedRuleIds };
};

/**
 * The specificity-winner among the rules whose pattern matches `raw`, or
 * `undefined` when none match. Pure — the core of the Issuer invariant's step (b).
 */
const winnerFor = (
	raw: string,
	compiled: ReadonlyArray<CompiledRule>,
): Rule | undefined => {
	const matching = compiled.filter((c) => c.regex.test(raw));
	if (matching.length === 0) return undefined;
	return matching.reduce((best, cur) =>
		compareSpecificity(best.rule, cur.rule) <= 0 ? best : cur,
	).rule;
};

/**
 * Derive the correct issuer for a set of rows against a rule set, per the
 * **Issuer invariant**: (a) a `manualIssuer` row keeps its issuer (manual wins);
 * else (b) the specificity-winner among matching rules; else (c) unmatched
 * (`issuerId: null`). Pure and mode-agnostic — the single routine both dry-run
 * and commit paths call. Exported for direct unit reasoning; the feature's
 * behaviour is tested at the API boundary.
 */
export const derive = (
	rows: ReadonlyArray<Transaction>,
	rules: ReadonlyArray<Rule>,
): {
	outcomes: ReadonlyArray<MatchOutcome>;
	skippedRuleIds: ReadonlyArray<typeof RuleId.Type>;
} => {
	const { compiled, skippedRuleIds } = compile(rules);
	const outcomes = rows.map((row): MatchOutcome => {
		if (row.manualIssuer) {
			// (a) manual assignment wins — never touched by a rule.
			return {
				transactionId: row.id,
				issuerId: row.issuerId ?? null,
				matchedRuleId: null,
			};
		}
		const winner = winnerFor(row.rawIssuerString, compiled);
		return winner === undefined
			? { transactionId: row.id, issuerId: null, matchedRuleId: null } // (c)
			: {
					transactionId: row.id,
					issuerId: winner.issuerId,
					matchedRuleId: winner.id,
				}; // (b)
	});
	return { outcomes, skippedRuleIds };
};

/**
 * The three preview lists for one scoped pattern — `Transaction`s bucketed by how
 * the prospective rule would touch them. Pure; the API surface decides the shape.
 */
export type PreviewLists = {
	willMatch: ReadonlyArray<Transaction>;
	willReassign: ReadonlyArray<Transaction>;
	manualCollisions: ReadonlyArray<Transaction>;
	skipped: boolean;
};

/**
 * Dry-run the scoped edit of a **single rule** against the current table, per the
 * Issuer invariant — the pure core behind the `rules` preview endpoint. `prospective`
 * is the rule in its edited state (its own `RegExp` decides scope); `isUpdate`
 * means it *replaces* the same-`id` rule in `currentRules` (an edit), otherwise it
 * is *added* as a new, newest rule (a create). Every bucket is scoped to rows the
 * prospective pattern matches:
 * - `manualCollisions` — the row is `manualIssuer` (rule never touches it);
 * - `willMatch` / `willReassign` — the prospective rule is the **full-set
 *   specificity winner** for the row (beats every matching rule), splitting on
 *   whether the row is currently unmatched (`issuerId == null`) or owned by a
 *   *different* issuer. A row already owned by this rule's issuer is no visible
 *   change and appears in neither list.
 *
 * An invalid prospective pattern compiles to nothing (`skipped: true`) → all lists
 * empty, mirroring the skipped-rule path (never a throw).
 */
export const previewLists = (
	rows: ReadonlyArray<Transaction>,
	currentRules: ReadonlyArray<Rule>,
	prospective: Rule,
	isUpdate: boolean,
): PreviewLists => {
	// The prospective rule set: an edit swaps the same-id rule in place; a create
	// appends the (newest) rule. Specificity is decided over this whole set.
	const ruleSet = isUpdate
		? currentRules.map((r) => (r.id === prospective.id ? prospective : r))
		: [...currentRules, prospective];

	const { compiled } = compile(ruleSet);
	// Reference-identity, not id: `compile` preserves each rule object, so the
	// prospective's compiled entry is the one whose `.rule` *is* `prospective`.
	// Absent ⇒ its pattern failed to compile → skipped rule, empty lists.
	const prospectiveEntry = compiled.find((c) => c.rule === prospective);
	if (prospectiveEntry === undefined) {
		return {
			willMatch: [],
			willReassign: [],
			manualCollisions: [],
			skipped: true,
		};
	}

	const willMatch: Array<Transaction> = [];
	const willReassign: Array<Transaction> = [];
	const manualCollisions: Array<Transaction> = [];
	for (const row of rows) {
		// Scope: only rows this one pattern matches are ever in a bucket.
		if (!prospectiveEntry.regex.test(row.rawIssuerString)) continue;
		if (row.manualIssuer) {
			manualCollisions.push(row);
			continue;
		}
		// The full-set winner must be *this* rule, else the edit changes nothing
		// for the row (a more-specific rule already/still owns it).
		if (winnerFor(row.rawIssuerString, compiled) !== prospective) continue;
		if (row.issuerId == null) {
			willMatch.push(row);
		} else if (row.issuerId !== prospective.issuerId) {
			willReassign.push(row);
		}
	}
	return { willMatch, willReassign, manualCollisions, skipped: false };
};

/**
 * `IssuerMatcher` — the server-side matching engine (ADR 0001: matching over
 * stored transactions runs where the data lives). It owns the Issuer invariant
 * and the commit path; regex runs in JS (never SQL) so an invalid pattern is a
 * skipped rule, not a crash. Depends only on `SqlClient` — it reads the current
 * rule set and writes issuer assignments + `matchCount` bumps directly, so a
 * whole commit fits in one SQLite transaction.
 *
 * Tested exclusively through the API boundary (import matching via `bulkCreate`),
 * per the PRD's single-seam bias — no isolated engine seam.
 */
export class IssuerMatcher extends Effect.Service<IssuerMatcher>()(
	"api/IssuerMatcher",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// The whole rule set, decoded through the shared row codec. Small by
			// design (tens of rules); ordering is irrelevant to specificity.
			const allRulesQuery = SqlSchema.findAll({
				Request: Schema.Void,
				Result: RuleFromRow,
				execute: () => sql`SELECT * FROM rules`,
			});

			// The whole transaction table — the retroactive scope every rule
			// create/edit recomputes over (current volume is trivially small; PRD
			// #8 defers large-history perf). Decoded through the shared row codec.
			const allTransactionsQuery = SqlSchema.findAll({
				Request: Schema.Void,
				Result: TransactionFromRow,
				execute: () => sql`SELECT * FROM transactions`,
			});

			const ruleByIdQuery = SqlSchema.findOne({
				Request: RuleId,
				Result: RuleFromRow,
				execute: (id) => sql`SELECT * FROM rules WHERE id = ${id}`,
			});

			// The rule insert/update mirror `RuleRepo`'s, but live here so a rule
			// write and the recompute it triggers share one `withTransaction`.
			const insertRuleQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{
					issuerId: number;
					pattern: string;
					matchCount: number;
					createdAt: string;
				}>,
				Result: RuleFromRow,
				execute: (row) => sql`INSERT INTO rules ${sql.insert(row)} RETURNING *`,
			});

			const updateRuleQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{
					id: typeof RuleId.Type;
					issuerId: number;
					pattern: string;
					matchCount: number;
					createdAt: string;
				}>,
				Result: RuleFromRow,
				execute: (row) =>
					sql`UPDATE rules SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
			});

			const txByIdQuery = SqlSchema.findOne({
				Request: TransactionId,
				Result: TransactionFromRow,
				execute: (id) => sql`SELECT * FROM transactions WHERE id = ${id}`,
			});

			const nowIso = Clock.currentTimeMillis.pipe(
				Effect.map((millis) => new Date(millis).toISOString()),
			);

			/**
			 * The `issuerId` writes that bring the whole table back to the Issuer
			 * invariant against `rules` — one `UPDATE` per row whose derived issuer
			 * differs from its stored one (a `null` winner clears the column). Manual
			 * rows derive to their current issuer, so they never produce a write.
			 * `matchCount` is intentionally left to the import bump path; this
			 * retroactive recompute only settles issuer assignment.
			 */
			const issuerWrites = (
				rows: ReadonlyArray<Transaction>,
				rules: ReadonlyArray<Rule>,
			) => {
				const { outcomes } = derive(rows, rules);
				const current = new Map(
					rows.map((r) => [r.id as number, r.issuerId ?? null]),
				);
				return outcomes
					.filter((o) => (o.issuerId ?? null) !== current.get(o.transactionId))
					.map(
						(o) =>
							sql`UPDATE transactions SET issuerId = ${o.issuerId} WHERE id = ${o.transactionId}`,
					);
			};

			/**
			 * Recompute every transaction's issuer against the (already-written) rule
			 * set and apply the diff. Meant to run *inside* a caller's
			 * `withTransaction` so the rule write and its retroactive fallout commit
			 * atomically (all-or-nothing).
			 */
			const recomputeIssuers = Effect.gen(function* () {
				const rules = yield* allRulesQuery();
				const rows = yield* allTransactionsQuery();
				const writes = issuerWrites(rows, rules);
				if (writes.length > 0) {
					yield* Effect.all(writes, { discard: true });
				}
			});

			/**
			 * Match a freshly-imported batch of rows against the current rule set and
			 * apply the result atomically: every winning rule sets its row's
			 * `issuerId` and its own `matchCount` is bumped once per row it won. All
			 * writes run in a single `withTransaction` — all-or-nothing. Returns the
			 * rows with their assigned issuers so the `bulkCreate` 201 body reflects
			 * the DB state. A manual row (`manualIssuer = true`) is never reassigned.
			 */
			const matchImported = (rows: ReadonlyArray<Transaction>) =>
				Effect.gen(function* () {
					if (rows.length === 0) return rows;

					const rules = yield* allRulesQuery();
					const { outcomes } = derive(rows, rules);

					// The issuer writes (only rows a rule actually won) and the per-rule
					// win tally, built from the derived outcomes.
					const assigned = outcomes.filter(
						(o): o is AssignedOutcome =>
							o.matchedRuleId !== null && o.issuerId !== null,
					);
					const bumps = new Map<number, number>();
					for (const o of assigned) {
						bumps.set(o.matchedRuleId, (bumps.get(o.matchedRuleId) ?? 0) + 1);
					}

					if (assigned.length > 0) {
						yield* sql.withTransaction(
							Effect.all(
								[
									...assigned.map(
										// `manualIssuer = 0` is written alongside the issuer: a
										// rule-assigned row is, by definition, not a manual pick
										// (issue #10). Manual rows never reach here — `derive`
										// filters them out (the Issuer invariant, step (a)).
										(o) =>
											sql`UPDATE transactions SET issuerId = ${o.issuerId}, manualIssuer = 0 WHERE id = ${o.transactionId}`,
									),
									...[...bumps].map(
										([ruleId, n]) =>
											sql`UPDATE rules SET matchCount = matchCount + ${n} WHERE id = ${ruleId}`,
									),
								],
								{ discard: true },
							),
						);
					}

					// Reflect the assignments onto the returned rows (issuer only —
					// `manualIssuer` stays false, matching set it).
					const byId = new Map(
						assigned.map((o) => [o.transactionId as number, o.issuerId]),
					);
					return rows.map((row) => {
						const issuerId = byId.get(row.id);
						return issuerId === undefined
							? row
							: new Transaction({ ...row, issuerId });
					});
					// A `SqlError` (query/tx) or `ParseError` (rule-row decode) is not
					// client-actionable → dies as a 500 ({@link orDieSql}), never leaked.
				}).pipe(orDieSql);

			/**
			 * Dry-run a create/update of the single rule described by `input`
			 * (`ruleId` present ⇒ edit, absent ⇒ create), returning the three scoped
			 * lists ({@link previewLists}). Reads the current rules + whole table; a
			 * create's prospective rule is synthesised as the newest rule (so it wins
			 * specificity ties, exactly as the real insert will), an edit reuses the
			 * stored rule's `id`/`createdAt` with the new pattern + issuer. `NotFound`
			 * when an edit names a missing rule. Purely advisory — no writes.
			 */
			const preview = (
				input: RulePreviewInput,
			): Effect.Effect<typeof RulePreviewResult.Type, NotFound> =>
				// `orDieSql` covers only the reads (infra errors die); the `NotFound`
				// below is introduced *after* it, so it survives to the wire as a 404.
				Effect.all({
					rules: allRulesQuery(),
					rows: allTransactionsQuery(),
				}).pipe(
					orDieSql,
					Effect.flatMap(({ rules, rows }) =>
						Effect.gen(function* () {
							if (input.ruleId !== undefined) {
								const existing = rules.find((r) => r.id === input.ruleId);
								if (existing === undefined) {
									return yield* Effect.fail(
										new NotFound({ resource: "rule", id: input.ruleId }),
									);
								}
								const prospective = new Rule({
									...existing,
									issuerId: input.issuerId,
									pattern: input.pattern,
								});
								return previewLists(rows, rules, prospective, true);
							}

							// A create's rule doesn't exist yet: synthesise it as the
							// newest rule (max `createdAt`) so specificity ties resolve to
							// it, mirroring the real insert. The sentinel `id` never
							// collides — the winner is matched by reference, not id.
							const now = yield* nowIso;
							const prospective = new Rule({
								id: RuleId.make(0),
								issuerId: input.issuerId,
								pattern: input.pattern,
								matchCount: 0,
								createdAt: new Date(now),
							});
							return previewLists(rows, rules, prospective, false);
						}),
					),
				);

			/**
			 * Apply-on-save for a **create**: insert the rule and recompute the whole
			 * table against the resulting rule set, all in one `withTransaction` (the
			 * commit is atomic and recomputes from *current* state, never trusting a
			 * stale preview). Returns the created rule.
			 */
			const applyRuleCreate = (payload: RuleCreate) =>
				nowIso.pipe(
					Effect.flatMap((now) =>
						sql.withTransaction(
							Effect.gen(function* () {
								const created = yield* insertRuleQuery({
									issuerId: payload.issuerId,
									pattern: payload.pattern,
									matchCount: payload.matchCount,
									createdAt: now,
								});
								yield* recomputeIssuers;
								return created;
							}),
						),
					),
					orDieSql,
				);

			/**
			 * Apply-on-save for an **update**: merge `changes` onto the stored rule
			 * (preserving `createdAt`), write it, and recompute the whole table — one
			 * atomic `withTransaction`. 404s when `id` is missing (`getById` semantics).
			 */
			const applyRuleUpdate = (id: typeof RuleId.Type, changes: RuleUpdate) =>
				ruleByIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) =>
						Option.match(found, {
							onNone: () => Effect.fail(new NotFound({ resource: "rule", id })),
							onSome: (current) =>
								sql
									.withTransaction(
										Effect.gen(function* () {
											const merged = new Rule({ ...current, ...changes });
											const updated = yield* updateRuleQuery({
												id,
												issuerId: merged.issuerId,
												pattern: merged.pattern,
												matchCount: merged.matchCount,
												createdAt: merged.createdAt.toISOString(),
											});
											yield* recomputeIssuers;
											return updated;
										}),
									)
									.pipe(orDieSql),
						}),
					),
				);

			/**
			 * The preview's per-row "remove manual issuer" action (PRD #8 story 10):
			 * clear the row's manual flag, then re-derive *that row* against the
			 * current rule set — it becomes unmatched, or is claimed by an existing
			 * rule if one matches (the invariant still holds). Atomic; returns the
			 * updated row. 404s when the id is missing.
			 */
			const removeManualIssuer = (id: typeof TransactionId.Type) =>
				txByIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) =>
						Option.match(found, {
							onNone: () =>
								Effect.fail(new NotFound({ resource: "transaction", id })),
							onSome: (current) =>
								Effect.gen(function* () {
									const rules = yield* allRulesQuery();
									// Re-derive with the manual flag dropped: the row is now
									// rule-eligible, so `derive` gives it the current winner (or
									// null when no rule matches).
									const cleared = new Transaction({
										...current,
										manualIssuer: false,
										issuerId: undefined,
									});
									const { outcomes } = derive([cleared], rules);
									const resolved = outcomes[0]?.issuerId ?? null;
									// One atomic write clears the manual flag and sets the
									// re-derived issuer (`NULL` = unmatched).
									yield* sql.withTransaction(
										sql`UPDATE transactions SET issuerId = ${resolved}, manualIssuer = 0 WHERE id = ${id}`,
									);
									// `cleared` already carries the dropped flag + null issuer;
									// only stamp the re-derived issuer when a rule claimed it.
									return resolved === null
										? cleared
										: new Transaction({ ...cleared, issuerId: resolved });
								}).pipe(orDieSql),
						}),
					),
				);

			return {
				derive,
				matchImported,
				preview,
				applyRuleCreate,
				applyRuleUpdate,
				removeManualIssuer,
			} as const;
		}),
	},
) {}
