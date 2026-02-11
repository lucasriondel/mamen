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
import type { CategoryTreeNode } from "@/types";

function countDescendants(node: CategoryTreeNode): number {
	let count = 0;
	for (const child of node.children) {
		count += 1 + countDescendants(child);
	}
	return count;
}

type DeleteCategoryDialogProps = {
	node: CategoryTreeNode | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (id: number) => Promise<void>;
};

export function DeleteCategoryDialog({
	node,
	open,
	onOpenChange,
	onConfirm,
}: DeleteCategoryDialogProps): React.ReactElement {
	const descendantCount = node ? countDescendants(node) : 0;

	const handleConfirm = async (): Promise<void> => {
		if (!node?.id) return;
		await onConfirm(node.id);
		onOpenChange(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete "{node?.name}"?</AlertDialogTitle>
					<AlertDialogDescription>
						{descendantCount > 0
							? `This will permanently delete "${node?.name}" and ${descendantCount} ${descendantCount === 1 ? "subcategory" : "subcategories"}. You can undo this action for 10 seconds.`
							: `This will permanently delete "${node?.name}". You can undo this action for 10 seconds.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={handleConfirm}>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
