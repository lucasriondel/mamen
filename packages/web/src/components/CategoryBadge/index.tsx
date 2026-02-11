import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";

export type CategoryBadgeProps = {
	categoryId: number;
	subcategoryId?: number;
	showSubcategory?: boolean;
	size?: "sm" | "md";
	className?: string;
};

export function CategoryBadge({
	categoryId,
	subcategoryId,
	showSubcategory = true,
	size = "sm",
	className,
}: CategoryBadgeProps): React.ReactElement | null {
	const { getCategoryById } = useCategories();

	const category = getCategoryById(categoryId);
	const subcategory = subcategoryId
		? getCategoryById(subcategoryId)
		: undefined;

	if (!category) return null;

	const displayText =
		showSubcategory && subcategory
			? `${category.name} > ${subcategory.name}`
			: category.name;

	return (
		<Badge
			variant="secondary"
			className={cn(
				"gap-1.5 rounded-md",
				size === "sm" && "h-6 text-xs",
				size === "md" && "h-7 text-sm",
				className,
			)}
		>
			<span
				className="h-2 w-2 rounded-full shrink-0"
				style={{ backgroundColor: category.color }}
				aria-hidden="true"
			/>
			<span className="truncate max-w-[150px]">{displayText}</span>
		</Badge>
	);
}
