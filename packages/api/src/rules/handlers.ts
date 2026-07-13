import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { IssuerMatcher } from "../matching/issuer-matcher";
import { RuleRepo } from "./repository";

/**
 * Implements the `rules` group of the contract: `list`/`count`
 * (both `issuerId?`-filtered), `getById`, `getByIssuerPattern` on
 * {@link RuleRepo}; `preview`, `previewDelete`, `create`, `update`, `remove` on
 * the {@link IssuerMatcher}.
 *
 * `create`/`update`/`remove` are **apply-on-save** (PRD #8): they don't just
 * write the rule, they recompute every transaction's issuer against the
 * resulting rule set atomically — so a broader rule's rows retroactively move to
 * a newly-added more-specific rule, a deleted rule's rows fall back to the
 * next-best rule (or become unmatched), and a manual row is never touched.
 * `preview`/`previewDelete` are the matching dry-runs the create/edit/delete
 * confirmation shows first.
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
			.handle("previewDelete", (_) => matcher.previewDelete(_.path.id))
			.handle("create", (_) => matcher.applyRuleCreate(_.payload))
			.handle("update", (_) => matcher.applyRuleUpdate(_.path.id, _.payload))
			.handle("remove", (_) => matcher.applyRuleDelete(_.path.id));
	}),
).pipe(Layer.provide([RuleRepo.Default, IssuerMatcher.Default]));
