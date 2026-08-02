import type { Category, CategoryId } from "@mamen/shared/contract";
import { FolderTree, X } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CategoryTreeItems } from "@/components/category-tree-items";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	NEUTRAL_CATEGORY_COLOR,
	resolveCategoryColors,
	searchAllNodes,
} from "@/lib/category-tree";

/**
 * The **parent** picker: the same searchable popover tree the issuer detail page
 * picks a category with, differing in exactly two ways, both forced by what a
 * parent *is*.
 *
 * First, **every node is selectable**, folders included — under ADR 0003 any
 * category is a legal parent, where only a childless leaf is assignable. So it
 * walks {@link searchAllNodes} rather than `searchTree`, and no row is a mere
 * heading.
 *
 * Second, there is **no inline create**. The picker that files a receipt offers
 * to mint a missing category because the search is a dead end otherwise; here the
 * search is *inside* that very create flow, so a nested create would be a second
 * dialog over the first — the way to get a deeper parent is to make the shallow
 * one first. Its absence is the feature.
 *
 * **Top level** is offered as an explicit row rather than a cleared value: a
 * category with no parent is a real, common choice (a new root), not the absence
 * of one, so it reads as something you pick.
 */
export function CategoryParentPicker({
	categories,
	value,
	onChange,
	disabled,
	portalContainer,
}: {
	/**
	 * The tree to choose from. A caller that must exclude a subtree (a move, which
	 * can't land inside itself) passes a narrowed list — the filtering is theirs,
	 * since only they know what is illegal.
	 */
	categories: readonly Category[];
	/** The selected parent, or `null` for **Top level**. */
	value: CategoryId | null;
	onChange: (parentId: CategoryId | null) => void;
	disabled?: boolean;
	/**
	 * Render the popover here instead of `document.body`. Required when this sits
	 * inside a modal dialog, whose scroll lock would otherwise freeze the list —
	 * see {@link PopoverContent}'s `portalContainer`. Falls back to the picker's own
	 * wrapper, which is inside the dialog by construction.
	 */
	portalContainer?: HTMLElement | null;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	/**
	 * The popover portals in here rather than into `document.body`. This picker
	 * lives inside a modal dialog, which locks scrolling outside its own subtree —
	 * a body-portalled popover lands outside it and its list won't take the wheel.
	 * Anchoring the portal to this wrapper keeps it in the whitelisted subtree.
	 * `useState` rather than `useRef` so the first render after mount actually sees
	 * the node (a ref assignment wouldn't re-render, and the portal would fall back
	 * to `body` for the opening that matters).
	 */
	const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

	const current =
		value != null ? categories.find((c) => c.id === value) : undefined;
	const nodes = searchAllNodes(categories, query);

	// A category's colour is inherited — a walk up `parentId`, not a field — so the
	// trigger resolves through the whole list, same as the rows do.
	const currentColor = current
		? (resolveCategoryColors(categories).get(current.id) ??
			NEUTRAL_CATEGORY_COLOR)
		: undefined;

	const handleOpenChange = (next: boolean) => {
		if (disabled) return;
		setOpen(next);
		if (next) setQuery("");
	};

	const choose = (parentId: CategoryId | null) => {
		if (disabled) return;
		onChange(parentId);
		setOpen(false);
	};

	return (
		<div className="flex flex-col gap-1" ref={setAnchor}>
			<span className="text-gousse-muted text-sm">Parent</span>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						size="sm"
						className="self-start"
						title="Choose where this category sits"
						disabled={disabled}
					>
						{current ? (
							<>
								<CategoryIcon
									name={current.icon}
									color={currentColor}
									size={14}
								/>
								<span style={{ color: currentColor }}>{current.name}</span>
							</>
						) : (
							<>
								<FolderTree
									size={14}
									className="shrink-0 text-gousse-muted"
									aria-hidden
								/>
								<span className="text-gousse-muted">Top level</span>
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="p-0"
					portalContainer={portalContainer ?? anchor}
				>
					{/* `shouldFilter={false}` — the tree walk does the filtering, so
					    ordering stays deterministic (as in the leaf picker). */}
					<Command shouldFilter={false} label="Choose a parent category">
						<CommandInput
							value={query}
							onValueChange={setQuery}
							placeholder="Search categories…"
							aria-label="Search parent categories"
						/>
						<CommandList>
							{nodes.length === 0 ? (
								<CommandEmpty>No categories found.</CommandEmpty>
							) : null}

							{/* Every node selectable: `searchAllNodes` marks them all as
							    leaves, which is what this renderer keys off. */}
							<CategoryTreeItems
								categories={categories}
								nodes={nodes}
								selectedId={value}
								onSelect={choose}
								disabled={disabled}
								selectedLabel="Current parent"
							/>

							{current ? (
								<>
									<CommandSeparator />
									<CommandGroup>
										<CommandItem
											value="__top-level__"
											onSelect={() => choose(null)}
											disabled={disabled}
										>
											<X
												size={16}
												className="shrink-0 text-gousse-muted"
												aria-hidden
											/>
											<span className="truncate">
												Move to top level (no parent)
											</span>
										</CommandItem>
									</CommandGroup>
								</>
							) : null}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
