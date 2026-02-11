import {
	ArrowDown,
	ArrowUp,
	ChevronRight,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CategoryTreeNode as CategoryTreeNodeType } from "@/types";
import { getIconComponent } from "../../lib/constants";

export type CategoryTreeNodeProps = {
	node: CategoryTreeNodeType;
	depth: number;
	onAddSubcategory: (parentId: number) => void;
	onEdit: (node: CategoryTreeNodeType) => void;
	onDelete: (node: CategoryTreeNodeType) => void;
	onReorder: (id: number, direction: "up" | "down") => void;
};

export function CategoryTreeNode({
	node,
	depth,
	onAddSubcategory,
	onEdit,
	onDelete,
	onReorder,
}: CategoryTreeNodeProps): React.ReactElement {
	const [expanded, setExpanded] = useState(depth === 0);
	const hasChildren = node.children.length > 0;
	const Icon = getIconComponent(node.icon);

	const toggleExpand = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	return (
		<div>
			<div
				className="flex items-center h-10 group hover:bg-accent/50 transition-colors rounded-md"
				style={{ paddingLeft: depth * 24 + 8 }}
			>
				{/* Chevron */}
				<button
					type="button"
					className={cn(
						"flex items-center justify-center h-6 w-6 rounded-sm transition-transform shrink-0",
						hasChildren ? "hover:bg-accent text-muted-foreground" : "invisible",
					)}
					onClick={toggleExpand}
					aria-label={expanded ? "Collapse" : "Expand"}
					tabIndex={hasChildren ? 0 : -1}
				>
					<ChevronRight
						className={cn(
							"h-4 w-4 transition-transform",
							expanded && "rotate-90",
						)}
					/>
				</button>

				{/* Color dot */}
				<span
					className="h-3 w-3 rounded-full shrink-0 ml-1"
					style={{ backgroundColor: node.color }}
					aria-hidden="true"
				/>

				{/* Icon */}
				<Icon
					className="h-4 w-4 shrink-0 ml-2 text-muted-foreground"
					aria-hidden="true"
				/>

				{/* Name */}
				<span className="ml-2 text-sm font-medium truncate">{node.name}</span>

				{/* Child count */}
				{hasChildren && (
					<span className="ml-1.5 text-xs text-muted-foreground">
						({node.children.length})
					</span>
				)}

				{/* Actions dropdown */}
				<div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								className="text-muted-foreground"
							>
								<MoreHorizontal className="h-4 w-4" />
								<span className="sr-only">Actions</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onAddSubcategory(node.id!)}>
								<Plus />
								Add Subcategory
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onEdit(node)}>
								<Pencil />
								Edit
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => onReorder(node.id!, "up")}>
								<ArrowUp />
								Move Up
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onReorder(node.id!, "down")}>
								<ArrowDown />
								Move Down
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onClick={() => onDelete(node)}
							>
								<Trash2 />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Recursive children */}
			{hasChildren && expanded && (
				<div>
					{node.children.map((child) => (
						<CategoryTreeNode
							key={child.id}
							node={child}
							depth={depth + 1}
							onAddSubcategory={onAddSubcategory}
							onEdit={onEdit}
							onDelete={onDelete}
							onReorder={onReorder}
						/>
					))}
				</div>
			)}
		</div>
	);
}
