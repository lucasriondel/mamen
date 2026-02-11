import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Rule } from "@/types";

type DeleteRuleConfirmationProps = {
	rule: Rule | null;
	affectedTransactionCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
};

export function DeleteRuleConfirmation({
	rule,
	affectedTransactionCount,
	open,
	onOpenChange,
	onConfirm,
}: DeleteRuleConfirmationProps): React.ReactElement {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Rule</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-2">
							<p>Are you sure you want to delete this rule?</p>
							{rule && (
								<p className="font-mono text-sm bg-muted px-2 py-1 rounded">
									{rule.pattern}
								</p>
							)}
							{affectedTransactionCount > 0 && (
								<p className="text-destructive font-medium">
									{affectedTransactionCount} transaction
									{affectedTransactionCount !== 1 ? "s" : ""} will become
									unmatched
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						Delete Rule
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
