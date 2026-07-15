import type { Category, Issuer } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Check, Tag, X } from "lucide-react";
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
import { useIssuerMutations } from "./use-issuer-mutations";

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

/**
 * The **Issuer default category** picker on the issuer detail page (PRD #19,
 * issue #22) — the bulk lever the Derived category model runs on. Setting an
 * issuer's default recategorises its whole non-overridden history at once; the
 * category is read *through* the issuer at query time, never copied onto a row.
 *
 * A `cmdk` command palette in a popover, mirroring the issuer assignment picker.
 * It offers **leaves only**, grouped under their folder headings (a folder is
 * structural and unselectable). A **Clear** action appears only when a default
 * is set, so the menu never offers a no-op. The current default is marked with a
 * check. `shouldFilter={false}` — the grouping does the filtering, so ordering
 * stays deterministic.
 */
export function IssuerDefaultCategoryPicker({ issuer }: { issuer: Issuer }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { setDefaultCategory } = useIssuerMutations();

	// The whole (small) tree — fetched even while closed so the trigger can name
	// the current default. A single user's taxonomy is coarse (PRD).
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const current =
		issuer.defaultCategoryId != null
			? categories.find((c) => c.id === issuer.defaultCategoryId)
			: undefined;
	const groups = groupLeaves(categories, query);
	const pending = setDefaultCategory.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) setQuery("");
	};

	const choose = (categoryId: Category["id"] | null) => {
		if (pending) return;
		setDefaultCategory.mutate(
			{ id: issuer.id, categoryId },
			{ onSuccess: () => setOpen(false) },
		);
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-sm text-muted">Default category</span>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-2 self-start rounded-md border border-line px-3 py-1.5 text-sm text-ink"
						title="Set this issuer's default category"
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
							{groups.length === 0 ? (
								<CommandEmpty>No categories found.</CommandEmpty>
							) : null}

							{groups.map(({ folder, leaves }) => (
								<CommandGroup key={folder.id} heading={folder.name}>
									{leaves.map((leaf) => (
										<CommandItem
											key={leaf.id}
											value={`category-${leaf.id}`}
											onSelect={() => choose(leaf.id)}
											disabled={pending}
										>
											<span aria-hidden>{leaf.icon}</span>
											<span className="truncate">{leaf.name}</span>
											{leaf.id === issuer.defaultCategoryId ? (
												<Check
													size={14}
													className="ml-auto shrink-0 text-accent"
													aria-label="Current default"
												/>
											) : null}
										</CommandItem>
									))}
								</CommandGroup>
							))}

							{current ? (
								<>
									<CommandSeparator />
									<CommandGroup>
										<CommandItem
											value="__clear__"
											onSelect={() => choose(null)}
											disabled={pending}
										>
											<X
												size={16}
												className="shrink-0 text-muted"
												aria-hidden
											/>
											<span className="truncate">Remove default category</span>
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
