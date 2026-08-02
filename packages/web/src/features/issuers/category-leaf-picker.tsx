import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Plus, Tag, X } from "lucide-react";
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
import { CategoryCreateDialog } from "@/features/categories/category-create-dialog";
import {
	isLeaf,
	NEUTRAL_CATEGORY_COLOR,
	resolveCategoryColors,
	searchTree,
} from "@/lib/category-tree";
import { categoryQueries } from "@/lib/sdk";

/**
 * A **controlled** category-leaf picker: a `cmdk` command palette in a popover
 * that offers the category tree's **leaves only** (folders are structural
 * headings), grouped under their folder headings and nested to arbitrary depth
 * (issue #33). The current `value` is marked with a check; a **Clear** action
 * appears only when a value is set and `onChange(null)` is meaningful, so the
 * menu never offers a no-op.
 *
 * It owns only presentation state (open, search query, the tree fetch) and
 * reports selections through `onChange` — it never writes. This is the seam two
 * issuer surfaces reuse: the detail page's write-on-select **Default category**
 * lever (via {@link IssuerDefaultCategoryPicker}) and the standalone create
 * form's draft field. `shouldFilter={false}` — the grouping does the filtering,
 * so ordering stays deterministic.
 */
export function CategoryLeafPicker({
	value,
	onChange,
	disabled,
	title,
	selectedLabel,
	clearLabel,
}: {
	/** The currently-selected leaf, or `null`/`undefined` for none. */
	value: CategoryId | null | undefined;
	/** Report a selection; `null` clears. Never called while `disabled`. */
	onChange: (categoryId: CategoryId | null) => void;
	disabled?: boolean;
	/** Trigger button `title`. */
	title: string;
	/** aria-label for the current-selection check. */
	selectedLabel: string;
	/** Copy for the clear action (shown only when a value is set). */
	clearLabel: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	/**
	 * The name the **Create** row handed to the dialog, or `null` while it is
	 * closed. Held here rather than read from `query` at render time because the
	 * popover closes as the dialog opens — which clears the search — and the draft
	 * name must survive that.
	 */
	const [draftName, setDraftName] = useState<string | null>(null);

	// The whole (small) tree — fetched even while closed so the trigger can name
	// the current value. A single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const current =
		value != null ? categories.find((c) => c.id === value) : undefined;
	const nodes = searchTree(categories, query);

	// A leaf's colour is inherited — a walk up `parentId`, not a field — so the
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

	const choose = (categoryId: CategoryId | null) => {
		if (disabled) return;
		onChange(categoryId);
		setOpen(false);
	};

	// The **Create** escape hatch (mirroring the transactions cell's, issue #24):
	// searching for a category that doesn't exist is otherwise a dead end that
	// sends you to the categories page and loses the record you were editing.
	// Offered whenever no *leaf* carries that exact name — not merely when the list
	// came back empty, since a query can match a folder heading (or a near-miss
	// leaf) and still leave nothing by that name to pick. A folder never blocks a
	// create: it is structural, and what's being minted here is assignable.
	const trimmedQuery = query.trim();
	const hasExactLeaf = categories.some(
		(c) =>
			isLeaf(categories, c) &&
			c.name.trim().toLowerCase() === trimmedQuery.toLowerCase(),
	);
	const canCreate = trimmedQuery.length > 0 && !hasExactLeaf && !disabled;

	const startCreate = () => {
		setDraftName(trimmedQuery);
		setOpen(false);
	};

	return (
		<>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						size="sm"
						className="self-start"
						title={title}
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
								<Tag
									size={14}
									className="shrink-0 text-gousse-muted"
									aria-hidden
								/>
								<span className="text-gousse-muted italic">No category</span>
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-0">
					<Command shouldFilter={false} label="Set default category">
						<CommandInput
							value={query}
							onValueChange={setQuery}
							placeholder="Search categories…"
							aria-label="Search categories"
						/>
						<CommandList>
							{/* cmdk's own empty state would swallow the Create row, so the
						    "nothing found" copy is only shown when there is nothing to
						    offer *at all* — a blank query over an empty tree. */}
							{nodes.length === 0 && !canCreate ? (
								<CommandEmpty>No categories found.</CommandEmpty>
							) : null}

							{canCreate ? (
								<CommandGroup>
									<CommandItem value="__create__" onSelect={startCreate}>
										<Plus
											size={16}
											className="shrink-0 text-gousse-accent"
											aria-hidden
										/>
										<span className="truncate">
											Create category “{trimmedQuery}”
										</span>
									</CommandItem>
								</CommandGroup>
							) : null}

							{canCreate && nodes.length > 0 ? <CommandSeparator /> : null}

							<CategoryTreeItems
								categories={categories}
								nodes={nodes}
								selectedId={value}
								onSelect={choose}
								disabled={disabled}
								selectedLabel={selectedLabel}
							/>

							{current ? (
								<>
									<CommandSeparator />
									<CommandGroup>
										<CommandItem
											value="__clear__"
											onSelect={() => choose(null)}
											disabled={disabled}
										>
											<X
												size={16}
												className="shrink-0 text-gousse-muted"
												aria-hidden
											/>
											<span className="truncate">{clearLabel}</span>
										</CommandItem>
									</CommandGroup>
								</>
							) : null}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{/* Keyed on the draft name so each opening remounts with fresh drafts —
		    the dialog seeds its fields from props once and never syncs back. */}
			{draftName !== null ? (
				<CategoryCreateDialog
					key={draftName}
					open
					onOpenChange={(next) => {
						if (!next) setDraftName(null);
					}}
					initialName={draftName}
					// A category created from here exists to be picked, so pick it —
					// the search that found nothing ends in a selection, not just a row
					// somewhere in the tree.
					onCreated={(category) => {
						setDraftName(null);
						onChange(category.id);
					}}
				/>
			) : null}
		</>
	);
}
