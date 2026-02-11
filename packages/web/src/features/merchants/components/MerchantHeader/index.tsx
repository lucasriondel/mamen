import { ArrowLeft } from "lucide-react";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewMerchantBadge } from "../NewMerchantBadge";

export type MerchantHeaderProps = {
	name: string;
	defaultCategoryId: number | undefined;
	createdAt: Date;
	onBack: () => void;
};

export function MerchantHeader({
	name,
	defaultCategoryId,
	createdAt,
	onBack,
}: MerchantHeaderProps): React.ReactElement {
	return (
		<div className="space-y-2">
			<Button
				variant="ghost"
				size="sm"
				onClick={onBack}
				className="gap-1 -ml-2 text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" />
				Merchants
			</Button>
			<div className="flex items-center gap-2">
				<h1 className="text-2xl font-bold">{name}</h1>
				<NewMerchantBadge createdAt={createdAt} />
			</div>
			{defaultCategoryId != null ? (
				<CategoryBadge categoryId={defaultCategoryId} size="md" />
			) : (
				<Badge
					variant="secondary"
					className="gap-1.5 rounded-md h-7 text-sm text-muted-foreground"
				>
					Uncategorized
				</Badge>
			)}
		</div>
	);
}
