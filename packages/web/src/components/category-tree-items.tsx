import type { Category } from "@mamen/shared/contract";
import { Check } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import type { PickerNode } from "@/lib/category-tree";

/**
 * The category tree rendered as picker rows, nested to arbitrary depth (issue
 * #33). Given the flat DFS list from {@link searchTree}, it draws each **folder**
 * as an unselectable heading and each **leaf** as a selectable `cmdk` item,
 * indenting both by their tree depth so the nesting reads without nested groups.
 * cmdk navigates the leaf items and steps over the folder headings (which are not
 * items), so the picker stays keyboard-navigable through any depth.
 *
 * Shared by the transactions **Category override** picker and the issuer
 * **Default category** picker — the two surfaces that file a receipt against the
 * tree without reshaping it. Nesting, re-parenting and spill stay on the
 * categories page; this component only ever selects a leaf.
 */
export function CategoryTreeItems({
	nodes,
	selectedId,
	onSelect,
	disabled,
	selectedLabel,
}: {
	nodes: PickerNode[];
	/** The currently-assigned leaf, marked with a check. */
	selectedId?: Category["id"] | null;
	onSelect: (id: Category["id"]) => void;
	disabled?: boolean;
	/** aria-label for the current-selection check (e.g. "Current category"). */
	selectedLabel: string;
}) {
	return nodes.map(({ category, depth, isLeaf }) => {
		// Indent by depth so the tree reads; leaves and headings align per level.
		const indent = { paddingLeft: `${8 + depth * 14}px` };
		if (!isLeaf) {
			return (
				<div
					key={`folder-${category.id}`}
					role="presentation"
					className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted"
					style={indent}
				>
					<span aria-hidden>{category.icon}</span>
					<span className="truncate">{category.name}</span>
				</div>
			);
		}
		return (
			<CommandItem
				key={category.id}
				value={`category-${category.id}`}
				onSelect={() => onSelect(category.id)}
				disabled={disabled}
				style={indent}
			>
				<span aria-hidden>{category.icon}</span>
				<span className="truncate">{category.name}</span>
				{category.id === selectedId ? (
					<Check
						size={14}
						className="ml-auto shrink-0 text-accent"
						aria-label={selectedLabel}
					/>
				) : null}
			</CommandItem>
		);
	});
}
