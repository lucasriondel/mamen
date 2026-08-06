import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { AccountId, IssuerId, numFromStr, RuleId } from "./ids";
import { Paged, Pagination } from "./pagination";
import { Transaction } from "./transactions";

/**
 * The **Sign matcher**'s two values (issue #90, ADR 0009): `"positive"` matches
 * money-in rows (`amount > 0`), `"negative"` money-out rows (`amount < 0`). A
 * **zero amount matches neither** — a bundle that nets out is not income, and
 * falling through to the user's sign-less rule is the safe direction. There is
 * deliberately no `"zero"` value: nothing motivates one.
 */
export const RuleSign = Schema.Literal("positive", "negative");
export type RuleSign = typeof RuleSign.Type;

/**
 * Rule entity — a Matching Rule as **stored**. It assigns **only** an issuer
 * (`issuerId`, the issuer this rule matches against); category is derived
 * *through* the issuer, never carried on the rule. `pattern` is a regex over the
 * raw issuer string.
 *
 * Every rules *endpoint* returns the richer {@link RuleView} (this plus the
 * derived `ownedCount`); `Rule` is what the DB dump and the matching engine
 * speak, i.e. the fields that actually live in a row.
 */
export class Rule extends Schema.Class<Rule>("Rule")({
	id: RuleId,
	issuerId: IssuerId,
	pattern: Schema.String,
	/**
	 * The optional **Value matcher** (issue #42, ADR 0004): a positive amount
	 * magnitude. When present the rule matches a row only if `pattern` matches the
	 * raw issuer string **and** the row's amount magnitude equals `matchValue` to
	 * the cent — so one issuer-string can fork by amount. Absent ⇒ a plain regex
	 * rule, byte-identical to the pre-#42 behaviour. Sign-agnostic: stored and
	 * compared as a magnitude, so a `6.99` rule matches a `-6.99` debit.
	 */
	matchValue: Schema.optional(Schema.Number.pipe(Schema.positive())),
	/**
	 * The optional **Account matcher** (issue #90, ADR 0009): when present the
	 * rule matches a row only if the row lives in that account — so the same raw
	 * issuer string can route to a different issuer per account. **One** account,
	 * never a set: a row lives in exactly one account, so N rules cover N accounts
	 * and never compete for a row. No FK; deleting the account deletes the rule.
	 */
	matchAccountId: Schema.optional(AccountId),
	/**
	 * The optional **Sign matcher** (issue #90, ADR 0009): when present the rule
	 * matches only money-in (`positive`) or only money-out (`negative`) rows, so a
	 * purchase and its refund can carry different issuers. A zero amount matches
	 * neither ({@link RuleSign}). Independent of {@link Rule.matchValue}, which
	 * stays a sign-agnostic magnitude (ADR 0004).
	 */
	matchSign: Schema.optional(RuleSign),
	createdAt: Schema.Date,
}) {}

/**
 * The wire shape of every rules endpoint: a stored {@link Rule} plus
 * `ownedCount` — **how many transactions this rule currently owns**, i.e. the
 * rows for which it is the specificity winner right now (issue #63).
 *
 * Derived on read from the live table, never stored: it falls when a
 * more-specific sibling rule out-specifies the rule, when a row is hand-assigned
 * away, or when a transaction is deleted. It is *not* a lifetime tally of import
 * matches — that was the old stored `matchCount`, which no rule created against
 * existing history ever accumulated, so every UI-created rule read "0 matches".
 * Read-only: no write payload carries it.
 */
export class RuleView extends Rule.extend<RuleView>("RuleView")({
	ownedCount: Schema.Number,
}) {}

/** Create payload — the server assigns `id` and `createdAt`. */
export const RuleCreate = Schema.Struct({
	issuerId: Rule.fields.issuerId,
	pattern: Rule.fields.pattern,
	matchValue: Rule.fields.matchValue,
	matchAccountId: Rule.fields.matchAccountId,
	matchSign: Rule.fields.matchSign,
});
export type RuleCreate = typeof RuleCreate.Type;

/**
 * Update payload — every field optional (partial update). Each of the three
 * optional predicates carries the same **three-way patch** (issue #43, extended
 * to the new pair by #90): **absent** leaves it unchanged, an explicit **`null`**
 * clears it, and a value sets it. `null` is the wire-expressible clear sentinel
 * that `undefined` can't be (JSON drops undefined keys). Absent-means-clear was
 * rejected outright: it would make every partial update silently drop predicates
 * the caller never mentioned, which is data loss in a PUT.
 */
export const RuleUpdate = Schema.Struct({
	issuerId: Schema.optional(Rule.fields.issuerId),
	pattern: Schema.optional(Rule.fields.pattern),
	matchValue: Schema.optional(
		Schema.NullOr(Schema.Number.pipe(Schema.positive())),
	),
	matchAccountId: Schema.optional(Schema.NullOr(AccountId)),
	matchSign: Schema.optional(Schema.NullOr(RuleSign)),
});
export type RuleUpdate = typeof RuleUpdate.Type;

/**
 * Apply a {@link RuleUpdate} patch onto the stored `current` rule, returning the
 * full merged entity to re-write. Implements the three-way patch (issue #43,
 * #90) for each optional predicate: an absent key keeps the current value, an
 * explicit `null` clears it, a value sets it. Each `null` clear sentinel is
 * folded to `undefined` because the `Rule` fields are optionals and can't hold
 * `null`.
 *
 * The three branches stay written out rather than extracted into a shared
 * helper: the patch semantics are the point, and they read at a glance here.
 */
export const mergeRuleUpdate = (current: Rule, changes: RuleUpdate): Rule => {
	const matchValue =
		changes.matchValue === undefined
			? current.matchValue
			: (changes.matchValue ?? undefined);
	const matchAccountId =
		changes.matchAccountId === undefined
			? current.matchAccountId
			: (changes.matchAccountId ?? undefined);
	const matchSign =
		changes.matchSign === undefined
			? current.matchSign
			: (changes.matchSign ?? undefined);
	return new Rule({
		...current,
		...changes,
		matchValue,
		matchAccountId,
		matchSign,
	});
};

/**
 * `list` / `count` filter (contract §2.6): `issuerId?` scopes to one issuer's
 * rules (else all). Decoded + branded from the query string via `numFromStr`.
 * `list` spreads it alongside `Pagination`; `count` takes it alone (no paging).
 */
export const RuleListFilters = {
	issuerId: Schema.optional(numFromStr(IssuerId)),
} as const;

/** `count` success body — the full filtered row count. */
export const RuleCount = Schema.Struct({ count: Schema.Number });

/**
 * Preview request — the single rule *being edited*, described independently of
 * whether it exists yet. `ruleId` present ⇒ an **update** (that rule's pattern /
 * issuer are being changed to these values, its `createdAt` preserved); absent ⇒
 * a **create** (a brand-new, therefore newest, rule). `issuerId` + `pattern` +
 * the three optional predicates are the rule's prospective state — each present
 * one narrows the scope (to rows of that amount magnitude, in that account, of
 * that direction). The preview is scoped to this one pattern, never the issuer's
 * whole rule set (PRD #8 stories 7–11).
 */
export const RulePreviewInput = Schema.Struct({
	ruleId: Schema.optional(RuleId),
	issuerId: Rule.fields.issuerId,
	pattern: Rule.fields.pattern,
	matchValue: Rule.fields.matchValue,
	matchAccountId: Rule.fields.matchAccountId,
	matchSign: Rule.fields.matchSign,
});
export type RulePreviewInput = typeof RulePreviewInput.Type;

/**
 * Preview response — the dry-run's three transaction lists over the scoped
 * pattern (PRD #8):
 * - `willMatch` — currently unmatched rows (`issuerId IS NULL`) this rule claims;
 * - `willReassign` — rows a *different* issuer owns via a rule (`manualIssuer =
 *   false`) where this rule is the **full-set specificity winner** (it beats
 *   *every* matching rule for the row, not merely the current owner);
 * - `manualCollisions` — rows matching the pattern with `manualIssuer = true`,
 *   untouched-by-default (each gets a per-row "remove manual issuer" action).
 *
 * `skipped` is `true` when the prospective pattern is an invalid regex: it
 * matches nothing (all three lists empty), reported as a skipped rule rather than
 * a 500 (PRD #8 story 19). The commit **recomputes** from current state, so this
 * preview is advisory — a concurrent import/edit can't cause a stale write.
 */
export const RulePreviewResult = Schema.Struct({
	willMatch: Schema.Array(Transaction),
	willReassign: Schema.Array(Transaction),
	manualCollisions: Schema.Array(Transaction),
	skipped: Schema.Boolean,
});
export type RulePreviewResult = typeof RulePreviewResult.Type;

/**
 * Delete-preview response — the full consequence set of deleting one rule (PRD
 * #8 stories 17–18). Deleting a rule re-homes the rows it had won
 * (`manualIssuer = false`, matching its pattern) against the **remaining** rules:
 * - `willReassign` — rows that fall back to a *different* issuer (the next-best
 *   specificity winner among the rules that remain);
 * - `willUnmatch` — rows that become unmatched because no other rule matches.
 *
 * Manual rows (`manualIssuer = true`) are never touched by a delete, so they
 * appear in neither list. Advisory only — the commit recomputes from current
 * state, so a concurrent edit can't cause a stale write.
 */
export const RuleDeletePreviewResult = Schema.Struct({
	willReassign: Schema.Array(Transaction),
	willUnmatch: Schema.Array(Transaction),
});
export type RuleDeletePreviewResult = typeof RuleDeletePreviewResult.Type;

/**
 * Rules group (contract §2.6), prefix `/rules`. No uniqueness constraint on any
 * field (faithful port), so `create`/`update` declare no `Conflict`.
 * `getById`/`getByIssuerPattern`/`update`/`remove` 404 on a missing rule;
 * `remove` → 204. `list`/`count` share the `issuerId?` filter. Dropped vs
 * today: `POST /rules/bulk-add`, `POST /rules/bulk-delete` (both client-only).
 *
 * Every rule-returning endpoint answers with a {@link RuleView} — the stored
 * rule plus its derived `ownedCount` (issue #63) — so one shape covers reads and
 * writes alike and a freshly-saved rule already reports the rows it just claimed.
 */
export class RulesGroup extends HttpApiGroup.make("rules")
	.add(
		HttpApiEndpoint.get("list")`/rules`
			.setUrlParams(Schema.Struct({ ...Pagination, ...RuleListFilters }))
			.addSuccess(Paged(RuleView)),
	)
	.add(
		HttpApiEndpoint.get("count")`/rules/count`
			.setUrlParams(Schema.Struct(RuleListFilters))
			.addSuccess(RuleCount),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/rules/${HttpApiSchema.param("id", numFromStr(RuleId))}`
			.addSuccess(RuleView)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByIssuerPattern",
		)`/rules/by-issuer-pattern/${HttpApiSchema.param("issuerId", numFromStr(IssuerId))}/${HttpApiSchema.param("pattern", Schema.String)}`
			.addSuccess(RuleView)
			.addError(NotFound),
	)
	.add(
		// Dry-run for a create/update — returns the three affected-transaction
		// lists for the scoped pattern without writing. `NotFound` when `ruleId`
		// names a rule that doesn't exist (an update preview of a missing rule).
		HttpApiEndpoint.post("preview")`/rules/preview`
			.setPayload(RulePreviewInput)
			.addSuccess(RulePreviewResult)
			.addError(NotFound),
	)
	.add(
		// Dry-run for a delete — returns the rows that will change issuer or become
		// unmatched if this rule is removed, re-homed against the remaining rules.
		// `NotFound` when `id` names a rule that doesn't exist.
		HttpApiEndpoint.get(
			"previewDelete",
		)`/rules/${HttpApiSchema.param("id", numFromStr(RuleId))}/delete-preview`
			.addSuccess(RuleDeletePreviewResult)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/rules`
			.setPayload(RuleCreate)
			.addSuccess(RuleView, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/rules/${HttpApiSchema.param("id", numFromStr(RuleId))}`
			.setPayload(RuleUpdate)
			.addSuccess(RuleView)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/rules/${HttpApiSchema.param("id", numFromStr(RuleId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Rules" })) {}
