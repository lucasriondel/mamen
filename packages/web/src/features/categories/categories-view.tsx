import type { Category } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Empty } from "@/components/ui/empty";
import { categoryQueries } from "@/lib/sdk";

/** A folder paired with the leaves that sit beneath it, in sort order. */
type FolderGroup = { folder: Category; leaves: Category[] };

/**
 * Group the flat category list into folders-with-leaves. A **Category folder**
 * has no parent; a **Category leaf** points at one. Folders keep the list's
 * order (the query asks for `sortOrder`); each folder's leaves are the rows that
 * name it as parent. Orphan leaves (a parent missing from the page) are dropped
 * rather than shown rootless — this read-only page never invents structure.
 */
function groupByFolder(categories: readonly Category[]): FolderGroup[] {
	const folders = categories.filter((c) => c.parentId === null);
	const leavesByParent = new Map<number, Category[]>();
	for (const cat of categories) {
		if (cat.parentId === null) continue;
		const bucket = leavesByParent.get(cat.parentId) ?? [];
		bucket.push(cat);
		leavesByParent.set(cat.parentId, bucket);
	}
	return folders.map((folder) => ({
		folder,
		leaves: leavesByParent.get(folder.id) ?? [],
	}));
}

/**
 * Categories page (PRD #19). Lists the seeded two-level tree: each **Category
 * folder** as a heading with its **Category leaves** grouped beneath. Every node
 * is navigable (issue #25) — clicking a folder or a leaf opens its transactions
 * with a **Category total**. CRUD is a later slice.
 */
export function CategoriesView() {
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];
	const groups = groupByFolder(categories);

	return (
		<section className="flex flex-col gap-6">
			<header>
				<h1 className="font-semibold text-2xl text-ink">Categories</h1>
				<p className="mt-1 text-muted">
					The shape of your spending, grouped into folders.
				</p>
			</header>

			{categoriesQuery.isError ? (
				<Empty
					title="Couldn't load categories"
					description="Something went wrong reading your categories. Try again in a moment."
				/>
			) : categoriesQuery.isPending ? (
				<p className="py-16 text-center text-muted">Loading categories…</p>
			) : groups.length === 0 ? (
				<Empty
					title="No categories yet"
					description="A fresh database seeds a starter tree — if you see this, they've all been removed."
				/>
			) : (
				<div className="flex flex-col gap-6">
					{groups.map(({ folder, leaves }) => (
						// A `fieldset` carries the implicit ARIA `group` role, named by its
						// `legend` — the folder heading — so each folder reads as a labelled
						// group of its leaves.
						<fieldset
							key={folder.id}
							className="rounded-lg border border-line bg-panel p-4"
						>
							<legend>
								<Link
									to="/categories/$categoryId"
									params={{ categoryId: String(folder.id) }}
									className="flex items-center gap-2 font-medium text-ink hover:text-accent"
								>
									<span aria-hidden>{folder.icon}</span>
									<span>{folder.name}</span>
								</Link>
							</legend>
							{leaves.length === 0 ? (
								<p className="mt-2 text-muted text-sm">No categories inside.</p>
							) : (
								<ul className="mt-3 flex flex-wrap gap-2">
									{leaves.map((leaf) => (
										<li key={leaf.id}>
											<Link
												to="/categories/$categoryId"
												params={{ categoryId: String(leaf.id) }}
												className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-ink text-sm transition-colors hover:border-accent"
											>
												<span aria-hidden>{leaf.icon}</span>
												<span>{leaf.name}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</fieldset>
					))}
				</div>
			)}
		</section>
	);
}
