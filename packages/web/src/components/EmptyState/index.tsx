import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
	icon: LucideIcon;
	title: string;
	description: string;
	actionLabel?: string;
	onAction?: () => void;
	actionDisabled?: boolean;
};

export function EmptyState({
	icon: Icon,
	title,
	description,
	actionLabel,
	onAction,
	actionDisabled = false,
}: EmptyStateProps): React.ReactElement {
	return (
		<div className="flex flex-col items-center justify-center h-full py-16">
			<Icon className="h-12 w-12 text-muted-foreground mb-4" />
			<h2 className="text-xl font-semibold mb-2">{title}</h2>
			<p className="text-muted-foreground mb-6 text-center max-w-md">
				{description}
			</p>
			{actionLabel && (
				<Button onClick={onAction} disabled={actionDisabled}>
					{actionLabel}
				</Button>
			)}
		</div>
	);
}
