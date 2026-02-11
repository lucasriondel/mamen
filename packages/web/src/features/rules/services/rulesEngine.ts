import { merchantsApi, rulesApi, transactionsApi } from "@/lib/api";
import type { Merchant, Rule } from "@/types";

type CompiledRule = {
	rule: Rule;
	regex: RegExp;
	merchant: Merchant;
};

export type RuleMatchResult = {
	transactionId: number;
	matchedRuleId: number;
	merchantId: number;
	categoryId: number;
};

export type ApplyRulesResult = {
	matched: RuleMatchResult[];
	unmatched: number[];
	skippedRules: number[];
	processingTimeMs: number;
};

const getLiteralLength = (pattern: string): number =>
	pattern.replace(/[.*+?^${}()|[\]\\]/g, "").length;

export const compareRuleSpecificity = (
	ruleA: Rule,
	ruleB: Rule,
	_matchString: string,
): number => {
	const literalA = getLiteralLength(ruleA.pattern);
	const literalB = getLiteralLength(ruleB.pattern);

	if (literalA > literalB) return -1;
	if (literalB > literalA) return 1;

	const dateA = new Date(ruleA.createdAt).getTime();
	const dateB = new Date(ruleB.createdAt).getTime();

	if (dateA > dateB) return -1;
	if (dateB > dateA) return 1;

	return 0;
};

export const applyRulesToTransactions = async (
	transactionIds: number[],
): Promise<ApplyRulesResult> => {
	const startTime = performance.now();

	if (transactionIds.length === 0) {
		return {
			matched: [],
			unmatched: [],
			skippedRules: [],
			processingTimeMs: 0,
		};
	}

	const rules = await rulesApi.getAll();
	const merchants = await merchantsApi.getAll();
	const merchantMap = new Map(merchants.map((m) => [m.id!, m]));

	const compiledRules: CompiledRule[] = [];
	const skippedRules: number[] = [];

	for (const rule of rules) {
		try {
			const regex = new RegExp(rule.pattern, "i");
			const merchant = merchantMap.get(rule.merchantId);
			if (merchant) {
				compiledRules.push({ rule, regex, merchant });
			}
		} catch {
			if (rule.id !== undefined) {
				skippedRules.push(rule.id);
			}
		}
	}

	const transactions = await transactionsApi.bulkGet(transactionIds);

	const matched: RuleMatchResult[] = [];
	const unmatched: number[] = [];

	for (const tx of transactions) {
		if (!tx || tx.id === undefined) continue;

		const matchingRules = compiledRules.filter((cr) =>
			cr.regex.test(tx.rawMerchantString),
		);

		if (matchingRules.length === 0) {
			unmatched.push(tx.id);
			continue;
		}

		const bestMatch = matchingRules.reduce((best, current) => {
			const comparison = compareRuleSpecificity(
				best.rule,
				current.rule,
				tx.rawMerchantString,
			);
			return comparison <= 0 ? best : current;
		});

		const categoryId =
			bestMatch.rule.categoryOverride ?? bestMatch.merchant.defaultCategoryId;

		if (categoryId !== undefined) {
			matched.push({
				transactionId: tx.id,
				matchedRuleId: bestMatch.rule.id!,
				merchantId: bestMatch.merchant.id!,
				categoryId,
			});
		} else {
			unmatched.push(tx.id);
		}
	}

	const processingTimeMs = performance.now() - startTime;

	return { matched, unmatched, skippedRules, processingTimeMs };
};

export const applyMatchResults = async (
	results: RuleMatchResult[],
): Promise<void> => {
	if (results.length === 0) return;

	const ruleMatchCounts = new Map<number, number>();

	for (const r of results) {
		await transactionsApi.update(r.transactionId, {
			merchantId: r.merchantId,
			categoryId: r.categoryId,
		});
	}

	for (const result of results) {
		const count = ruleMatchCounts.get(result.matchedRuleId) ?? 0;
		ruleMatchCounts.set(result.matchedRuleId, count + 1);
	}

	for (const [ruleId, count] of ruleMatchCounts) {
		const rule = await rulesApi.get(ruleId);
		if (rule) {
			await rulesApi.update(ruleId, {
				matchCount: rule.matchCount + count,
			});
		}
	}
};
