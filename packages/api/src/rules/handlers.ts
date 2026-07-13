import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { IssuerMatcher } from "../matching/issuer-matcher";
import { RuleRepo } from "./repository";

/**
 * Implements the `rules` group of the contract: `list`/`count`
 * (both `issuerId?`-filtered), `getById`, `getByIssuerPattern`, `remove` on
 * {@link RuleRepo}; `preview`, `create`, `update` on the {@link IssuerMatcher}.
 *
 * `create`/`update` are **apply-on-save** (PRD #8): they don't just write the
 * rule, they recompute every transaction's issuer against the resulting rule set
 * atomically — so a broader rule's rows retroactively move to a newly-added
 * more-specific rule, and a manual row is never touched. `preview` is the
 * matching dry-run (three scoped lists) the create/edit form shows first.
 */
export const RulesLive = HttpApiBuilder.group(Api, "rules", (handlers) =>
	Effect.gen(function* () {
		const repo = yield* RuleRepo;
		const matcher = yield* IssuerMatcher;
		return handlers
			.handle("list", (_) => repo.list(_.urlParams))
			.handle("count", (_) => repo.count(_.urlParams.issuerId))
			.handle("getById", (_) => repo.getById(_.path.id))
			.handle("getByIssuerPattern", (_) =>
				repo.getByIssuerPattern(_.path.issuerId, _.path.pattern),
			)
			.handle("preview", (_) => matcher.preview(_.payload))
			.handle("create", (_) => matcher.applyRuleCreate(_.payload))
			.handle("update", (_) => matcher.applyRuleUpdate(_.path.id, _.payload))
			.handle("remove", (_) => repo.remove(_.path.id));
	}),
).pipe(Layer.provide([RuleRepo.Default, IssuerMatcher.Default]));
