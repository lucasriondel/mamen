import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/hooks/useCategories";
import { merchantsApi, queryKeys, rulesApi } from "@/lib/api";
import type { Merchant, Rule } from "@/types";
import { RuleRow } from "../RuleRow";

type MerchantWithRules = {
	merchant: Merchant;
	rules: Rule[];
};

type RulesListByMerchantProps = {
	searchQuery: string;
	focusedIndex: number | null;
	flatRules: Rule[];
	onEditRule: (ruleId: number) => void;
	onDeleteRule: (ruleId: number) => void;
};

export function RulesListByMerchant({
	searchQuery,
	focusedIndex,
	flatRules,
	onEditRule,
	onDeleteRule,
}: RulesListByMerchantProps): React.ReactElement {
	const [collapsedMerchants, setCollapsedMerchants] = useState<Set<number>>(
		new Set(),
	);
	const { getCategoryById } = useCategories();

	const { data: rulesWithMerchants = [] } = useQuery({
		queryKey: ["rulesListByMerchant"],
		queryFn: async () => {
			const [rules, merchants] = await Promise.all([
				rulesApi.getAll(),
				merchantsApi.getAll(),
			]);
			const merchantMap = new Map(merchants.map((m) => [m.id!, m]));

			const grouped = new Map<number, MerchantWithRules>();

			for (const rule of rules) {
				const merchant = merchantMap.get(rule.merchantId);
				if (!merchant || merchant.id === undefined) continue;

				if (!grouped.has(merchant.id)) {
					grouped.set(merchant.id, { merchant, rules: [] });
				}
				grouped.get(merchant.id)!.rules.push(rule);
			}

			return Array.from(grouped.values()).sort((a, b) => {
				if (a.rules.length !== b.rules.length) {
					return b.rules.length - a.rules.length;
				}
				return a.merchant.name.localeCompare(b.merchant.name);
			});
		},
	});

	const filteredGroups = useMemo(() => {
		if (!searchQuery.trim()) return rulesWithMerchants;

		const query = searchQuery.toLowerCase();
		return rulesWithMerchants
			.map((group) => {
				const merchantMatch = group.merchant.name.toLowerCase().includes(query);
				if (merchantMatch) return group;

				const matchingRules = group.rules.filter((rule) => {
					const patternMatch = rule.pattern.toLowerCase().includes(query);
					const category =
						rule.categoryOverride !== undefined
							? getCategoryById(rule.categoryOverride)
							: getCategoryById(group.merchant.defaultCategoryId ?? 0);
					const categoryMatch =
						category?.name.toLowerCase().includes(query) ?? false;
					return patternMatch || categoryMatch;
				});

				if (matchingRules.length === 0) return null;
				return { ...group, rules: matchingRules };
			})
			.filter(Boolean) as MerchantWithRules[];
	}, [rulesWithMerchants, searchQuery, getCategoryById]);

	const toggleCollapse = (merchantId: number): void => {
		setCollapsedMerchants((prev) => {
			const next = new Set(prev);
			if (next.has(merchantId)) {
				next.delete(merchantId);
			} else {
				next.add(merchantId);
			}
			return next;
		});
	};

	if (rulesWithMerchants.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<p className="text-lg font-medium">No rules yet</p>
				<p className="text-sm mt-1">
					Create rules by pressing R on transactions
				</p>
			</div>
		);
	}

	if (filteredGroups.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<p className="text-sm">No rules match your search</p>
			</div>
		);
	}

	let globalIndex = 0;

	return (
		<div className="divide-y" data-testid="rules-list">
			{filteredGroups.map((group) => {
				const isCollapsed = collapsedMerchants.has(group.merchant.id!);
				const merchantCategory = group.merchant.defaultCategoryId
					? getCategoryById(group.merchant.defaultCategoryId)
					: undefined;

				const startIndex = globalIndex;

				return (
					<div key={group.merchant.id} data-testid="merchant-group">
						<button
							className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
							onClick={() => toggleCollapse(group.merchant.id!)}
							aria-expanded={!isCollapsed}
						>
							{isCollapsed ? (
								<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
							) : (
								<ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
							)}
							<span className="font-medium">{group.merchant.name}</span>
							<span className="text-xs text-muted-foreground">
								({group.rules.length} rule{group.rules.length !== 1 ? "s" : ""})
							</span>
							{merchantCategory && (
								<Badge
									variant="secondary"
									className="ml-auto text-xs"
									style={{
										backgroundColor: `${merchantCategory.color}20`,
										color: merchantCategory.color,
									}}
								>
									{merchantCategory.name}
								</Badge>
							)}
						</button>

						{!isCollapsed && (
							<div>
								{group.rules.map((rule, ruleIndex) => {
									const flatIndex = startIndex + ruleIndex;
									const ruleCategory =
										rule.categoryOverride !== undefined
											? getCategoryById(rule.categoryOverride)
											: undefined;

									return (
										<RuleRow
											key={rule.id}
											rule={rule}
											category={ruleCategory}
											merchantDefaultCategory={merchantCategory}
											isFocused={focusedIndex === flatRules.indexOf(rule)}
											onEdit={onEditRule}
											onDelete={onDeleteRule}
										/>
									);
								})}
							</div>
						)}
						{(() => {
							globalIndex = startIndex + group.rules.length;
							return null;
						})()}
					</div>
				);
			})}
		</div>
	);
}
