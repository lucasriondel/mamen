import type { Category, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
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
import {
	categoryPath,
	isFolder,
	isLeaf,
	resolveCategoryColor,
	searchTree,
} from "@/lib/category-tree";
import { categoryQueries } from "@/lib/sdk";
import { CategoryCell } from "./transaction-cells";
import { useCategoryOverride } from "./use-category-override";
import { useCreateCategoryLeaf } from "./use-create-category-leaf";

/** Which step of the picker is showing: pick a leaf, or choose a folder for a new one. */
type Mode = "pick" | "choose-folder";

export interface CategoryPickerProps {
	/** The transaction being curated — the override is written to this row only. */
	transaction: Transaction;
	/** The row's *derived* category (through its issuer, or its own override). */
	category?: Category;
}

/**
 * The **Category override** picker on a transaction's category cell (PRD #19,
 * issue #23) — the exception that lets one transaction differ from its issuer's
 * default. Clicking the cell opens a `cmdk` command palette in a popover,
 * mirroring the issuer assignment + default-category pickers: search, leaves
 * grouped under folder headings, folders unselectable.
 *
 * Applying a leaf writes an override to **this transaction only** (`manualCategory`
 * + `categoryId`); it never touches the issuer's default — the two gestures are
 * deliberately split. A **Remove override** action appears only when the row
 * actually carries one (`manualCategory`), so the menu never offers a no-op;
 * removing it reverts the row to its issuer's default, never to no category.
 *
 * A row with no issuer can still take an override — resolving the issuer is not a
 * prerequisite. `shouldFilter={false}` — the grouping does the filtering, so
 * ordering stays deterministic. The tree is fetched only once the picker opens.
 *
 * When the typed name matches no leaf, the picker offers to **create** one
 * (issue #24): a two-step, in-popover flow mirroring the assignment picker's
 * add-rule mode switch — hit create, choose the folder it belongs in, and the
 * leaf is minted with the typed name pre-filled and applied to this transaction
 * in one gesture. Only *leaves* can be created here; folders are structural and
 * live on the categories page. The transaction never leaves the screen.
 */
export function CategoryPicker({ transaction, category }: CategoryPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<Mode>("pick");
	const { setOverride, removeOverride } = useCategoryOverride();
	const createLeaf = useCreateCategoryLeaf();

	// The whole (small) tree — fetched only on open. A single user's taxonomy is
	// coarse (PRD), so a wide limit takes it in one page.
	const categoriesQuery = useQuery({
		...categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
		enabled: open,
	});
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	// An override is a *marked* row: a manual category on this transaction. An
	// inherited row (through the issuer) is not manual and stays plain.
	const isOverride = transaction.manualCategory === true && category != null;
	const nodes = searchTree(categories, query);
	const folders = categories.filter((c) => isFolder(categories, c));
	const trimmed = query.trim();
	// Offer to create only when the search finds no leaf by that exact name — a
	// folder is structural and never created here, so it doesn't block a create.
	const hasExactLeaf = categories.some(
		(c) =>
			isLeaf(categories, c) &&
			c.name.trim().toLowerCase() === trimmed.toLowerCase(),
	);
	const canCreate = trimmed.length > 0 && !hasExactLeaf;
	const pending =
		setOverride.isPending || removeOverride.isPending || createLeaf.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setQuery("");
			setMode("pick");
		}
	};

	/** Apply a leaf as an override on this one transaction. */
	const apply = (categoryId: Category["id"]) => {
		if (pending) return;
		setOverride.mutate(
			{ transactionId: transaction.id, categoryId },
			{ onSuccess: () => setOpen(false) },
		);
	};

	/** Remove the override, reverting the row to its issuer's default. */
	const remove = () => {
		if (pending) return;
		removeOverride.mutate(
			{ transactionId: transaction.id },
			{ onSuccess: () => setOpen(false) },
		);
	};

	/** Step two: create the leaf under the chosen folder, then apply it here. */
	const createInFolder = (parentId: Category["id"]) => {
		if (pending || trimmed.length === 0) return;
		createLeaf.mutate(
			{ name: trimmed, parentId },
			{
				onSuccess: (created) =>
					setOverride.mutate(
						{ transactionId: transaction.id, categoryId: created.id },
						{ onSuccess: () => setOpen(false) },
					),
			},
		);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="block rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
					title="Set a category for this transaction"
				>
					<CategoryCell category={category} isOverride={isOverride} />
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command shouldFilter={false} label="Set a category">
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder={
							mode === "choose-folder"
								? "Pick a folder for the new category…"
								: "Search categories…"
						}
						aria-label="Search categories"
						readOnly={mode === "choose-folder"}
					/>
					<CommandList>
						{mode === "choose-folder" ? (
							<>
								{folders.length === 0 ? (
									<CommandEmpty>No folders to create in.</CommandEmpty>
								) : null}
								<CommandGroup heading={`New category “${trimmed}” in…`}>
									{folders.map((folder) => (
										<CommandItem
											key={folder.id}
											value={`folder-${folder.id}`}
											onSelect={() => createInFolder(folder.id)}
											disabled={pending}
										>
											<CategoryIcon
												name={folder.icon}
												color={resolveCategoryColor(categories, folder)}
												size={14}
											/>
											<span className="truncate">
												{categoryPath(categories, folder)}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
								<CommandSeparator />
								<CommandGroup>
									<CommandItem
										value="__back__"
										onSelect={() => setMode("pick")}
										disabled={pending}
									>
										<ArrowLeft
											size={16}
											className="shrink-0 text-muted"
											aria-hidden
										/>
										<span className="truncate">Back</span>
									</CommandItem>
								</CommandGroup>
							</>
						) : (
							<>
								{nodes.length === 0 && !canCreate ? (
									<CommandEmpty>No categories found.</CommandEmpty>
								) : null}

								<CategoryTreeItems
									categories={categories}
									nodes={nodes}
									selectedId={category?.id}
									onSelect={apply}
									disabled={pending}
									selectedLabel="Current category"
								/>

								{canCreate ? (
									<>
										{nodes.length > 0 ? <CommandSeparator /> : null}
										<CommandGroup>
											<CommandItem
												value="__create__"
												onSelect={() => setMode("choose-folder")}
												disabled={pending}
											>
												<Plus
													size={16}
													className="shrink-0 text-muted"
													aria-hidden
												/>
												<span className="truncate">
													Create category “{trimmed}”
												</span>
											</CommandItem>
										</CommandGroup>
									</>
								) : null}

								{isOverride ? (
									<>
										<CommandSeparator />
										<CommandGroup>
											<CommandItem
												value="__remove__"
												onSelect={remove}
												disabled={pending}
											>
												<X
													size={16}
													className="shrink-0 text-muted"
													aria-hidden
												/>
												<span className="truncate">Remove override</span>
											</CommandItem>
										</CommandGroup>
									</>
								) : null}
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
