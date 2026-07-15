import type { Category, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
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
import { categoryQueries } from "@/lib/sdk";
import { CategoryCell } from "./transaction-cells";
import { useCategoryOverride } from "./use-category-override";

/** A folder paired with the leaves beneath it that match the current search. */
type FolderGroup = { folder: Category; leaves: Category[] };

/** Case-insensitive substring match of a category name against the query. */
function matches(name: string, query: string): boolean {
	return name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Group leaves under their folder, keeping only leaves whose name matches the
 * search, and dropping folders left with none. Folders themselves are never
 * offered — a **Category folder** is not assignable (two-level invariant), so it
 * is a heading only. Orphan leaves (parent absent from the page) are dropped.
 * The same shape the issuer default-category picker uses.
 */
function groupLeaves(
	categories: readonly Category[],
	query: string,
): FolderGroup[] {
	const folders = categories.filter((c) => c.parentId === null);
	const leavesByParent = new Map<number, Category[]>();
	for (const cat of categories) {
		if (cat.parentId === null || !matches(cat.name, query)) continue;
		const bucket = leavesByParent.get(cat.parentId) ?? [];
		bucket.push(cat);
		leavesByParent.set(cat.parentId, bucket);
	}
	return folders
		.map((folder) => ({ folder, leaves: leavesByParent.get(folder.id) ?? [] }))
		.filter((g) => g.leaves.length > 0);
}

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
 */
export function CategoryPicker({ transaction, category }: CategoryPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { setOverride, removeOverride } = useCategoryOverride();

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
	const groups = groupLeaves(categories, query);
	const pending = setOverride.isPending || removeOverride.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) setQuery("");
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

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="block text-left"
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
						placeholder="Search categories…"
						aria-label="Search categories"
					/>
					<CommandList>
						{groups.length === 0 ? (
							<CommandEmpty>No categories found.</CommandEmpty>
						) : null}

						{groups.map(({ folder, leaves }) => (
							<CommandGroup key={folder.id} heading={folder.name}>
								{leaves.map((leaf) => (
									<CommandItem
										key={leaf.id}
										value={`category-${leaf.id}`}
										onSelect={() => apply(leaf.id)}
										disabled={pending}
									>
										<span aria-hidden>{leaf.icon}</span>
										<span className="truncate">{leaf.name}</span>
										{leaf.id === category?.id ? (
											<Check
												size={14}
												className="ml-auto shrink-0 text-accent"
												aria-label="Current category"
											/>
										) : null}
									</CommandItem>
								))}
							</CommandGroup>
						))}

						{isOverride ? (
							<>
								<CommandSeparator />
								<CommandGroup>
									<CommandItem
										value="__remove__"
										onSelect={remove}
										disabled={pending}
									>
										<X size={16} className="shrink-0 text-muted" aria-hidden />
										<span className="truncate">Remove override</span>
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
