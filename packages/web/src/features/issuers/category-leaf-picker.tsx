import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Tag, X } from "lucide-react";
import { useState } from "react";
import { CategoryTreeItems } from "@/components/category-tree-items";
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
import { searchTree } from "@/lib/category-tree";
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

	// The whole (small) tree — fetched even while closed so the trigger can name
	// the current value. A single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const current =
		value != null ? categories.find((c) => c.id === value) : undefined;
	const nodes = searchTree(categories, query);

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

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-2 self-start rounded-md border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50"
					title={title}
					disabled={disabled}
				>
					<Tag size={14} className="shrink-0 text-muted" aria-hidden />
					{current ? (
						<span>{current.name}</span>
					) : (
						<span className="text-muted italic">No category</span>
					)}
				</button>
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
						{nodes.length === 0 ? (
							<CommandEmpty>No categories found.</CommandEmpty>
						) : null}

						<CategoryTreeItems
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
										<X size={16} className="shrink-0 text-muted" aria-hidden />
										<span className="truncate">{clearLabel}</span>
									</CommandItem>
								</CommandGroup>
							</>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
