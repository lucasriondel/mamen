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
