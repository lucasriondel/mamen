import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { IssuerId, numFromStr, RuleId } from "./ids";
import { Paged, Pagination } from "./pagination";
import { Transaction } from "./transactions";

/**
 * Rule entity — the wire shape returned by every rules endpoint. A Matching Rule
 * assigns **only** an issuer (`issuerId`, the issuer this rule matches against);
 * category is derived *through* the issuer, never carried on the rule. `pattern`
 * is a regex over the raw issuer string; `matchCount` is bumped each time the
 * rule wins a row.
 */
export class Rule extends Schema.Class<Rule>("Rule")({
	id: RuleId,
	issuerId: IssuerId,
	pattern: Schema.String,
	matchCount: Schema.Number,
	createdAt: Schema.Date,
}) {}

/** Create payload — the server assigns `id` and `createdAt`. */
export const RuleCreate = Schema.Struct({
	issuerId: Rule.fields.issuerId,
	pattern: Rule.fields.pattern,
	matchCount: Rule.fields.matchCount,
});
export type RuleCreate = typeof RuleCreate.Type;

/** Update payload — every field optional (partial update). */
export const RuleUpdate = Schema.partial(RuleCreate);
export type RuleUpdate = typeof RuleUpdate.Type;

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
 * a **create** (a brand-new, therefore newest, rule). `issuerId` + `pattern` are
 * the rule's prospective state. The preview is scoped to this one pattern, never
 * the issuer's whole rule set (PRD #8 stories 7–11).
 */
export const RulePreviewInput = Schema.Struct({
	ruleId: Schema.optional(RuleId),
	issuerId: Rule.fields.issuerId,
	pattern: Rule.fields.pattern,
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
 */
export class RulesGroup extends HttpApiGroup.make("rules")
	.add(
		HttpApiEndpoint.get("list")`/rules`
			.setUrlParams(Schema.Struct({ ...Pagination, ...RuleListFilters }))
			.addSuccess(Paged(Rule)),
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
			.addSuccess(Rule)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByIssuerPattern",
		)`/rules/by-issuer-pattern/${HttpApiSchema.param("issuerId", numFromStr(IssuerId))}/${HttpApiSchema.param("pattern", Schema.String)}`
			.addSuccess(Rule)
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
			.addSuccess(Rule, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/rules/${HttpApiSchema.param("id", numFromStr(RuleId))}`
			.setPayload(RuleUpdate)
			.addSuccess(Rule)
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
