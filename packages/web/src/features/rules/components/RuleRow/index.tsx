import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Category, Rule } from "@/types";

type RuleRowProps = {
	rule: Rule;
	category: Category | undefined;
	merchantDefaultCategory: Category | undefined;
	isFocused: boolean;
	onEdit: (ruleId: number) => void;
	onDelete: (ruleId: number) => void;
};

export function RuleRow({
	rule,
	category,
	merchantDefaultCategory,
	isFocused,
	onEdit,
	onDelete,
}: RuleRowProps): React.ReactElement {
	const hasOverride = rule.categoryOverride !== undefined;
	const displayCategory = hasOverride ? category : merchantDefaultCategory;

	return (
		<div
			className={cn(
				"flex items-center gap-3 h-12 px-3 group hover:bg-accent/50 transition-colors",
				isFocused && "bg-accent ring-1 ring-ring",
			)}
			data-testid="rule-row"
		>
			<span className="font-mono text-sm truncate flex-1 min-w-0">
				{rule.pattern}
			</span>

			<span className="text-sm text-muted-foreground shrink-0 w-24 text-right">
				{rule.matchCount} match{rule.matchCount !== 1 ? "es" : ""}
			</span>

			<div className="shrink-0 w-48 flex items-center gap-1.5">
				{displayCategory ? (
					<>
						<Badge
							variant="secondary"
							className="text-xs"
							style={{
								backgroundColor: `${displayCategory.color}20`,
								color: displayCategory.color,
							}}
						>
							{displayCategory.name}
						</Badge>
						{hasOverride && (
							<span className="text-xs text-muted-foreground">(override)</span>
						)}
					</>
				) : (
					<span className="text-xs text-muted-foreground">
						(uses merchant default)
					</span>
				)}
			</div>

			<div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={() => onEdit(rule.id!)}
					aria-label={`Edit rule ${rule.pattern}`}
				>
					<Pencil className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-destructive hover:text-destructive"
					onClick={() => onDelete(rule.id!)}
					aria-label={`Delete rule ${rule.pattern}`}
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
