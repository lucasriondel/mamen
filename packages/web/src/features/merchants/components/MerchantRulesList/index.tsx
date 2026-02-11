import { useQuery } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { queryKeys, rulesApi } from "@/lib/api";

type MerchantRulesListProps = {
	merchantId: number;
};

export function MerchantRulesList({
	merchantId,
}: MerchantRulesListProps): React.ReactElement {
	const { data: rules = [] } = useQuery({
		queryKey: [...queryKeys.rules.all, "byMerchant", merchantId],
		queryFn: () => rulesApi.getAll({ merchantId }),
	});

	const { getCategoryById } = useCategories();

	if (rules.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-2">No existing rules</p>
		);
	}

	return (
		<ul role="list" className="space-y-1">
			{rules.map((rule) => {
				const overrideCategory = rule.categoryOverride
					? getCategoryById(rule.categoryOverride)
					: null;

				return (
					<li
						key={rule.id}
						role="listitem"
						className="flex items-center gap-2 text-sm py-1"
					>
						<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
							{rule.pattern}
						</code>
						<span className="text-muted-foreground">
							({rule.matchCount} matches)
						</span>
						{overrideCategory ? (
							<span className="text-muted-foreground">
								&rarr; {overrideCategory.name}
							</span>
						) : (
							<span className="text-muted-foreground">(default)</span>
						)}
					</li>
				);
			})}
		</ul>
	);
}
