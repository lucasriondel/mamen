import { SqlClient, SqlSchema } from "@effect/sql";
import type { IssuerId, RuleId } from "@mamen/shared/contract";
import { type Rule, Transaction } from "@mamen/shared/contract";
import { Effect, Schema } from "effect";
import { orDieSql } from "../db/errors";
import { RuleFromRow } from "../rules/repository";

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

			return { derive, matchImported } as const;
		}),
	},
) {}
